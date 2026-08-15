# Simulated SMS Layer — Design Spec

Two-way texting, simulated end to end, for both parties who hold a phone in this problem: the
**vendor** (who accepts orders, sets ETAs, schedules pickups) and the **household** (who is the only
witness that equipment actually arrived and the only person who ever sees what condition it is in).

Every outbound text carries a `template` key. A single code-defined table maps `template × digit →
action`. A digit that does not resolve through that table is never guessed at — it goes to the human
review queue. This is the same shape as the keypress table in `docs/IVR-SIM-SPEC.md` §4.2, and for
the same reason: **at a known lifecycle moment, a digit has exactly one meaning, so no model needs to
read it.**

Build is **simulation-only**: real message rows rendered as threads in a phone emulator that POST
real inbound messages. No telephony provider. The magic links in the bubbles are genuine
`/portal/<token>` URLs — nothing about them is faked.

> **Amended 08-14 — the quick-reply buttons are gone.** This spec assumes tappable digit buttons
> throughout (§10 especially). They were built, and removed the same day: a real iPhone or Android
> renders an SMS as plain text with nothing tappable in it, so buttons made the emulator *less*
> faithful, not more. Everything the spec says about `template × digit` routing still holds —
> `handleReply` now treats a bare `[1-9]` typed into the box exactly like a structured `digit`,
> which is what a gateway does anyway, since "1" arrives as text with nothing marking it as a
> digit. Read "tap 1" below as "type 1"; the routing table is unchanged.

**Scope note:** the emulator UI is owned by another dev and already built. This spec covers the
backend — schema, templates, the routing table, triggers — plus the integration contract the
emulator consumes (§10). No component, layout, or interaction design appears here.

---

## 0 · Deviations from the brief's assumptions

The brief for this spec made assumptions the codebase contradicts, and `origin/main` moved
underneath it mid-flight. The codebase wins; here is where and why.

1. **`messages.vendor_id` stays `NOT NULL`.** The brief locked "`vendor_id` must become nullable for
   family rows." SQLite cannot drop `NOT NULL` in place — that is a twelve-column table rebuild or a
   team-wide `npm run db:reset`, and `origin/main` has just established the opposite convention
   (`server/db.ts` now ends with an additive `ALTER TABLE … ADD COLUMN` loop in a `try/catch`
   specifically so teammates' existing dev databases keep working). Nullable `vendor_id` would also
   ripple `Message['vendor_id']` to `number | null`, through the `message` variant of `ServerEvent`,
   into `Vendor.tsx` and the review queue. **Instead: family rows carry the order's `vendor_id` as a
   denormalized join key and `recipient_type` is the authoritative thread discriminator.** Every
   family template is order-scoped, so the vendor is always derivable and never invented. Cost: one
   guard clause on the messages filter (§9.3). §5.1 documents the strict-nullable alternative if the
   team would rather pay the reset.
2. **`recipient_type` on an inbound row means "the other party," not "the recipient."** We keep the
   locked column name, but on `direction = 'in'` rows it identifies the *sender*. It is really a
   thread key. Naming it `recipient_type` anyway keeps one column instead of two and matches the
   locked decision; this paragraph is the honesty tax.
3. **`decline` still has no event mapping** — `INTENT_EVENT` in `server/messaging.ts` has no
   `decline` key — but `applyParsed()` now handles it explicitly (escalate, no state transition,
   no throw), and `handleInbound()` routes decline through the same ≥0.8 confidence gate as every
   other intent (fixed post-spec; see `docs/RUBRIC-AUDIT-1.md` row 4). Digit 2 on V1/V2 still
   escalates directly via the template route, unchanged.
4. **Outbound sends are call-site-driven, not transition side effects.** `CLAUDE.md` says "outbound
   SMS templates fire as side effects of transitions"; in the code `sendToVendor()` is called from
   four explicit sites (`POST /orders`, `POST /orders/:id/swap-vendor`, `setPatientStatus()`,
   `watchdog.tick()`). This spec adds call sites; it does not move sending into `applyEvent()`.
5. **There is no `sendToFamily` and no family thread today.** The caregiver condition channel on
   `origin/main` records its outbound text as an `order_events` row of type `family_notified` and
   returns the body in the HTTP response — **the body is never persisted anywhere**. There is
   nothing to render as a thread. §1 reconciles this.
6. **No `ServerEvent` change is needed.** `sendToVendor()` already broadcasts `{ type: 'message' }`
   and `useLive()` refetches on *every* event, so the emulator updates itself with no new event
   variant and no new plumbing. Keeping `vendor_id` non-null (deviation 1) is what makes this free.
7. **`patients` already has the household contact.** `caregiver_name`, `caregiver_phone`, and
   `contact_ok` landed with the condition channel and `scripts/seed.ts` fills all twelve patients.
   The brief's "seed changes (family/patient phone presence)" is **already done** — no new column,
   no new seed data. We text the *caregiver*, never the patient (`server/condition.ts` design note
   1: hospice patients frequently cannot answer a phone).
8. **The phone emulator already exists, and this spec has never seen it.** It was built by another
   dev and was not on `origin` when this was written, so §10 is a contract written *blind*: it
   states what the backend offers, not what the emulator calls. Treat every mismatch as a
   merge-time reconciliation rather than a defect, and resolve all of them in favor of the server
   owning the actions.
9. **The pickup clock now re-anchors on a vendor-set ETA.** Commit `6913f0e` replaced
   `order.eta_at ?? order.created_at` with `pickupAnchor()`, which anchors to the
   `pickup_triggered` event *unless* an `eta_set` event lands after it, in which case the vendor's
   promised time becomes the clock. That makes V4's digit behavior a deliberate choice, not an
   accident — see §6.4.

---

## 1 · Reconciliation with the caregiver condition channel

`server/condition.ts` (commits `004b30d`, `073673f`) already texts the household. Two features
texting the same grieving house about the same delivery is exactly the failure the tone north star
in `docs/PROBLEM-THESIS.md` warns about, so this section is load-bearing.

### 1.1 What the condition channel actually stores

Read before assuming: **it does not use `messages` at all.**

| Piece | Where it lives today |
|---|---|
| Outbound check body | Returned from `sendConditionCheck()` in the HTTP response. **Not persisted.** |
| Record that we asked | `order_events` row, type `family_notified`, payload `{ kind: 'condition_check', channel: 'sms', to }` |
| Inbound reply | `POST /api/orders/:id/condition-reply` → `handleCaregiverReply()` → `condition_reports` row |
| Rollup | `condition_reports` → `GET /api/vendors/condition`, `GET /api/reports/vendor-scorecards` |

So the condition channel has a *record* but no *thread*. This spec's `messages` rows are the store
it is missing, and the phone emulator is the screen it never got.

### 1.2 The collision, and why sequencing resolves it

F1 (delivery-confirm) and the condition check are **already mutually exclusive on the happy path**:

- `sendConditionCheck()` is called from the POD route — i.e. only when delivery is **verified**.
- F1 fires only on an **unproven** vendor claim (the `intent === 'delivered'` branch of
  `applyParsed()`), where no POD ever arrives.

Which exposes a hole in `main`: a delivery the vendor merely *claimed* gets **no condition rating at
all**, because nothing ever calls `sendConditionCheck()` for it. The household that most needs
asking is the one we never ask.

**Decision: one household thread, one question at a time, sequenced — F1 becomes the gate that
unlocks the existing condition check.**

| Path | Trigger | Household receives |
|---|---|---|
| **A — verified** | Driver submits a delivery POD | Condition check only. *Unchanged behavior.* |
| **B — claimed** | Vendor texts/taps "delivered", no POD | F1 first. On **1 = yes**, F1's handler calls `sendConditionCheck(orderId)` as the follow-on question **in the same thread**. On **2 = no**, the condition check never fires. |

Never two simultaneous texts. Never a question about the condition of equipment we are not sure
arrived. And path B closes the rating hole using `condition.ts` verbatim — `sendConditionCheck()`'s
own guards (state `delivered`, patient not deceased, `contact_ok`, not already reported) are exactly
the guards we would have had to write.

### 1.3 Household channel rules (one gate, all family sends)

`condition.ts` earned its guard rail (`shouldAskForCondition`); every family template goes through
the same kind of gate rather than each call site reimplementing "is it decent to text this house
right now." New function in `server/messaging.ts`:

```ts
export function householdGate(order: Order, template: FamilyTemplate): { ok: boolean; reason?: string }
```

1. `contact_ok` must be truthy — a STOP is honored across every template, not just the survey.
2. `caregiver_phone` must be present, else no-op (silently — historical seeded orders are fine).
3. **Questions** (`f_delivery_confirm`, `f_condition_check`) require the patient to be alive and
   require **zero unanswered questions already open in that thread**. This is `condition.ts` design
   note 2 generalized: once a patient is deceased we ask the household nothing, ever.
4. **Notices** (`f_eta_notice`, `f_pickup_notice`, `f_delivered_thanks`, `f_picked_up_thanks`) are
   permitted post-death — they are the mechanism by which nobody in a grieving house has to chase a
   truck — but they are **informational only**, carry no digits, and are sent at most once per
   order per template.
5. *(Sketched, cut first)* quiet hours: defer sends between 21:00 and 08:00 local. See §11.

Rule 3 is also a genuine safety property, not just manners: the production reply resolver in §11 has
to guess which question a bare "1" answers. **A thread that never has two questions open cannot be
ambiguous.** We designed the ambiguity out rather than parsing our way through it.

### 1.4 How the two inbound paths coexist

`POST /api/orders/:id/condition-reply` **stays**. It is the *no-thread-context* entry point: the
caller already knows the order id. `POST /api/messages/reply` (§7.1) is the *thread-aware* router:
the caller knows a message id and the server derives everything else.

When the router sees `template = 'f_condition_check'`, its action is `delegate` — it calls
`handleCaregiverReply(orderId, body)` unchanged and stores the inbound message row that the ad-hoc
route never stored. **There is no second condition parser.** `parseConditionReply()` remains the
only thing that reads a 1-5, and `tests/condition.test.ts` keeps covering it.

> **Follow-on refactor (not this branch):** once `/messages/reply` is proven, `condition-reply`
> becomes the documented fallback for an inbound we could not thread — which is not a hypothetical:
> a real Twilio webhook hands you a phone number, not an order id. Its URL-supplied `:id` is itself
> a simulation seam, and §11's resolver is the thing that would fill it. Keep the route; document
> what it is for.

### 1.5 The cross-feature bug this creates if nobody looks

`server/reports.ts` computes the DON's headline number as:

```sql
SELECT COUNT(*) FROM messages WHERE direction = 'in' AND review_status = 'auto_applied'
```

…published under `CALLS_AVOIDED_DEFINITION`, which says **"Vendor status updates this system
received without a human picking up a phone."** The moment family and caregiver replies become
`messages` rows, that count silently includes them and the number stops matching its own
definition — on the one screen whose entire pitch is honesty about where the number came from.

**MUST FIX WITH THE IMPLEMENTATION — not a follow-up ticket.** Team decision (2026-08-14): take
both halves in the same branch as the routing.

- Add `AND recipient_type = 'vendor'` to that count.
- Add a fourth breakdown line `household_confirmations` and extend `CALLS_AVOIDED_DEFINITION`. A
  family confirming a delivery *is* a phone call a case manager did not make — arguably the most
  defensible entry in the whole counter, and it belongs in the number under its own name.

Shipping the routing without this puts a wrong number on the DON's screen and on a slide.

---

## 2 · Feature summary

`docs/PROBLEM-THESIS.md` rung 1 of the adoption ladder is "replies to a text." Today the simulator
can only send **free text** into the Claude parse gate. That undersells the design in two ways:

- A vendor who taps `1` on their phone should be as deterministic as a vendor who taps a magic link
  — confidence 1.0, no model, nothing to review. Right now the same reply costs an API call and a
  confidence gate.
- The household side of the story — *the family never knows it exists* — has no screen. The
  `family_notified` event prints as an event type with the actual sentence buried in
  `payload.text` (`DEMO-SCRIPT.md` FE punch list item 6), and the condition check's body is not
  persisted at all.

The phone emulator (owned separately — §10) makes both visible in a second browser window: **the
hospice board in one window, the phones in the other.** Everything the system says to a human, and
everything a human says back, on screen, in threads, live over SSE. This spec's job is the backend
that makes those threads exist and makes a tapped digit mean something.

It is also **insurance for the demo's single largest dependency**. `DEMO-SCRIPT.md` marks the
`/portal/:token` page as "the highest-value FE item in the repo" and notes scenario 3's climax has
no click without it. With the emulator, the same beat has a tappable **1 = ACCEPT** in the text
itself, next to the real magic link. If the portal page ships, tap the link. If it does not, tap the
digit. The board moves either way.

Pitch line: *the vendor does not adopt a channel — we adopt theirs, and the whole conversation is on
the record.*

---

## 3 · Message matrix

Eight templates. Four to vendors (all four extend or reuse text that already exists), four to
households, plus the condition check inherited from `condition.ts`.

### 3.1 Vendor thread — `recipient_type = 'vendor'`

| Key | Brief | Existing function | Trigger | Digits |
|---|---|---|---|---|
| `v_order_request` | V1 | `orderRequestText()` — extended | `POST /orders`, `POST /orders/:id/swap-vendor` | 1 = accept · 2 = can't fill |
| `v_ack_nag` | V2 | `ackNagText()` — extended | `watchdog.tick()` silence ladder | 1 = accept · 2 = can't fill |
| `v_eta_check` | V3 | **new** `etaCheckText()` | `watchdog.tick()`, morning of `target_at` | 1 = on schedule · 2 = delayed |
| `v_pickup_request` | V4 | `pickupRequestText()` — extended | `setPatientStatus()` | 1 = today · 2 = later |

All four carry the magic link they already carry (V3 gains one). The digit line is appended, never
substituted — **the tap and the digit are two doors to the same room, and the vendor picks.**

```
V1  New order #1042: 1x Hospital bed, semi-electric (E0260), deliver by Aug 15, 2:00 PM,
    area Provo. Reply 1 to accept, 2 if you can't fill it — or confirm here:
    http://localhost:5173/portal/5526bc0f1e5aa153d8ae

V2  Order #1042 (Hospital bed, semi-electric) hasn't been confirmed — reply 1 to accept,
    2 if you can't fill it, or tap: http://localhost:5173/portal/5526bc0f1e5aa153d8ae

V3  Order #1042 (Hospital bed, semi-electric) is due today by 2:00 PM. Reply 1 if you're
    on schedule, 2 if it'll be late: http://localhost:5173/portal/5526bc0f1e5aa153d8ae

V4  Pickup needed for order #1050 (Hospital bed, semi-electric), area Ogden. Reply 1 if
    you can get it today, 2 to give us a window:
    http://localhost:5173/portal/0ba1ed9f8fc6b1e9a57f
```

**PHI:** order number, equipment, deadline, area. No patient name, no street address — matching
`orderRequestText`'s existing `area ${patientArea}` convention and the minimum-necessary rule in
`PROBLEM-THESIS.md`. `tests/silence.test.ts` already asserts `expect(text).not.toContain('Test
Patient')`; extend that assertion to the new templates.

V4 loses one thing worth naming: `pickupRequestText()` currently says *"Family is present — please
schedule promptly."* That is a dispatcher reading a logistics line, which is right, but "family is
present" is doing emotional work the dispatcher does not need. The replacement above says the same
operational thing with less. If the team disagrees, keep the sentence — it is not a PHI issue,
only a tone one.

### 3.2 Household thread — `recipient_type = 'family'`

| Key | Brief | Trigger | Digits |
|---|---|---|---|
| `f_delivery_confirm` | F1 | `applyParsed()` `delivered` branch — a claim with no POD | 1 = yes, it arrived · 2 = no |
| `f_condition_check` | *(inherited)* | POD delivery (existing) **or** chained off F1 = yes (§1.2) | 1-5 → `handleCaregiverReply()` |
| `f_eta_notice` | F2 | an ETA is set pre-delivery | none |
| `f_pickup_notice` | F3 | pickup scheduled | none |
| `f_delivered_thanks` | F4 | delivery POD (`family_notified`) | none |
| `f_picked_up_thanks` | F4 | pickup POD (`family_notified`) | none |

```
F1  This is the hospice team. Our records show the hospital bed was delivered today.
    Has it arrived? Reply 1 if yes, 2 if it hasn't. Nothing else is needed.

F2  Your hospice team: the hospital bed is scheduled to arrive Thu, Aug 15 by 10:00 AM.
    No reply needed — we'll let you know if that changes.

F3  Your hospice team: someone will be by today to collect the equipment. You don't need
    to be there for it, and there's nothing you need to do.

F4d Your hospice team: the hospital bed has been delivered and set up. If anything isn't
    right, call us — we'll handle it with the supplier.

F4p Your hospice team: the equipment has been picked up. There's nothing else you need to
    do. We're thinking of your family.
```

Copy rules, all of them enforceable in review:

- **Equipment is named generically** (`order.equipment_name`, already generic: "Hospital bed,
  semi-electric"). Never an HCPCS code, never a quantity, never a serial.
- **Zero PHI beyond what the household inherently knows.** No patient name, no address, no order
  number. The household knows whose bed it is; the phone number is the identity. This is *stricter*
  than the vendor templates, which do carry order numbers — the vendor needs a reference key, the
  daughter does not.
- **Never assume a death.** `setPatientStatus()` triggers pickup on `deceased` **or** `discharged`.
  F3 and F4p are sent in both cases, so no condolence language may appear in F3, and F4p's closing
  line is the furthest we go. *(If the team wants a true condolence variant, it must branch on
  `patients.status`; out of scope here.)*
- **"There's nothing you need to do"** appears in F3 and F4p on purpose. That sentence is the
  product, stated to the person the product is for.
- **Only F1 and the condition check ever ask for anything**, and by §1.3 rule 3 never both at once.

---

## 4 · Why the template key is not optional

The single strongest argument for this design fits in one line, and it is worth putting on a slide.

> The household replies **"1"**. Under `f_delivery_confirm` that means *yes, the bed is here.* Under
> `f_condition_check` it means *the equipment is unusable* — the bottom of the 1-5 scale, which
> `condition.ts` escalates to a human immediately.

Same digit, same thread, opposite meanings, one of them an alarm. Without the template key on the
question being answered, a reply router either guesses or asks a language model to guess. **We do
neither.** The digit is meaningless on its own; the question it answers is what carries the meaning,
and that is a column, not an inference.

This is the same argument as `IVR-SIM-SPEC.md` §1 ("a keypress is deterministic"), arrived at from
the other end: deterministic *given the moment*. The IVR re-derives the moment from order state; SMS
cannot, because a text arrives whenever it arrives — so we persist it.

---

## 5 · Data model changes

### 5.1 `server/db.ts` — `messages`

Four additive columns, applied through the `ALTER TABLE … ADD COLUMN` loop `origin/main` already
added at the bottom of `db.ts` for the caregiver columns:

```ts
"ALTER TABLE messages ADD COLUMN recipient_type TEXT NOT NULL DEFAULT 'vendor'",
'ALTER TABLE messages ADD COLUMN patient_id INTEGER',
'ALTER TABLE messages ADD COLUMN template TEXT',
'ALTER TABLE messages ADD COLUMN answered_at TEXT',
```

…plus the same four columns in the `CREATE TABLE IF NOT EXISTS messages` body for fresh databases.
Both are required: the `CREATE` covers new DBs, the `ALTER` loop covers teammates' existing ones.

**Because every column is additive with a default, no `db:reset` ping is needed.** That is the
deviation in §0.1 paying for itself: the whole feature is now a normal same-session push to `main`
under the ordinary workflow, not a schema branch. (If the team later insists on the strict
nullable-`vendor_id` model, that one *is* a table rebuild — `CREATE TABLE messages_new … ; INSERT
INTO messages_new SELECT …; DROP; ALTER … RENAME` — plus a `db:reset && seed` ping and a
`number | null` sweep through `ServerEvent` and the client. Real work, no user-visible gain.)

| Column | Meaning |
|---|---|
| `recipient_type` | `'vendor'` \| `'family'`. The thread discriminator. On inbound rows it names the sender (§0.2). |
| `patient_id` | Set on family rows; the household thread key. `NULL` on vendor rows. |
| `template` | The template key on outbound rows. `NULL` = conversational/unanswerable (§6.5). Always `NULL` on inbound rows. |
| `answered_at` | Set on an **outbound** question row when a reply resolves it. `NULL` = still open. |

`vendor_id` stays `NOT NULL` and carries the order's vendor on family rows (§0.1).

### 5.2 `shared/types.ts`

```ts
export type Actor = 'hospice' | 'vendor' | 'driver' | 'system' | 'ai' | 'family'   // 'family' added

export type OrderEventType =
  | …
  | 'family_confirmed'          // added

export type RecipientType = 'vendor' | 'family'

export type VendorTemplate = 'v_order_request' | 'v_ack_nag' | 'v_eta_check' | 'v_pickup_request'
export type FamilyTemplate =
  | 'f_delivery_confirm' | 'f_condition_check' | 'f_eta_notice'
  | 'f_pickup_notice' | 'f_delivered_thanks' | 'f_picked_up_thanks'
export type MessageTemplate = VendorTemplate | FamilyTemplate

export interface Message {
  // …existing fields
  recipient_type: RecipientType
  patient_id: number | null
  template: MessageTemplate | null
  answered_at: string | null
}

export interface Order {
  // …existing fields
  family_confirmed: boolean      // derived, see 5.3
}

export interface SmsReplyResult {
  message_id: number             // the inbound row we just stored
  in_reply_to: number | null
  template: MessageTemplate | null
  digit: string | null
  outcome: 'applied' | 'prompt' | 'review' | 'unmapped'
  prompt: string | null
  order: Order | null
}
```

`rowToMessage()` needs **no change** — it spreads the row, so the four columns arrive as soon as
they exist.

### 5.3 The Actor-union call, and the third provenance level

**Decision: add `'family'` to `Actor`, add a `'family_confirmed'` `OrderEventType`, and derive a
`family_confirmed` boolean on `Order`. Do not touch `delivery_verified` / `pickup_verified`.**

Reasoning:

- The `Actor` union is the ledger's answer to *who said this*. A household confirming a delivery is
  not `hospice` (we did not observe it), not `vendor` (they are the party being checked), not
  `system`, and emphatically not `ai`. Reusing any existing actor would put a false name on the one
  row whose entire job is provenance. The union is a TEXT column with no CHECK constraint, and no
  code switches exhaustively on `Actor` (`OrderCard.tsx` prints `({e.actor})` as a string), so the
  addition costs one line and breaks nothing.
- `'family_confirmed'` is a new `OrderEventType` with a `TRANSITIONS` entry of
  `{ from: ['delivered', 'pickup_pending', 'pickup_overdue', 'picked_up'], to: null }` — it records,
  it never moves state. It cannot reuse `family_notified`, which means *we told them*; this is the
  reverse direction.
- **`delivery_verified` stays POD-only.** `ORDER_SELECT` in `server/store.ts` derives it from an
  `EXISTS` over `pods`; `tests/evidence.test.ts` pins that. A family "yes" is better than a vendor
  claim and weaker than a signature, so it is a **third level**, not a promotion:

  | Level | Source | Board badge |
  |---|---|---|
  | Vendor-reported | text / digit / portal tap | `Vendor-reported` |
  | **Family-confirmed** | `family_confirmed` event, actor `family` | **`Family-confirmed`** |
  | Verified | POD photo/signature | `✓ Verified` |

  Derived alongside the other two, same style, one line:

  ```sql
  EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.type = 'family_confirmed')
    AS family_confirmed
  ```

  (Cuttable: the badge can read the events array instead, at the cost of the flag not being
  available in list views. Prefer the derived column — it is three lines and the evidence-badge
  owner gets a field instead of a scan.)

Payload: `{ confirms: 'delivery', via: 'sms', template: 'f_delivery_confirm', message_id }`.

---

## 6 · The routing table

One table, in `server/sms.ts`, next to the send helpers. Actions are a closed set of five.

```ts
type ReplyAction =
  | { kind: 'apply'; intent: MessageIntent; eta: 'target_at' | null; notes: string }
  | { kind: 'escalate'; reason: (order: Order) => string }
  | { kind: 'prompt'; text: string }
  | { kind: 'family_confirm'; confirmed: boolean }
  | { kind: 'delegate'; handler: 'condition' }

export const REPLY_ROUTES: Partial<Record<MessageTemplate, Record<string, ReplyAction>>>
```

| Template | Digit | Action | Result |
|---|---|---|---|
| `v_order_request` | 1 | `apply` `accept` | `vendor_accepted` → `dispatched`, actor `vendor` |
| `v_order_request` | 2 | `escalate` | `Vendor can't fill order #N — reassign` |
| `v_ack_nag` | 1 | `apply` `accept` | same as above |
| `v_ack_nag` | 2 | `escalate` | same as above |
| `v_eta_check` | 1 | `apply` `eta_update`, `eta: 'target_at'` | `eta_set`, `eta_at = target_at`, state unchanged |
| `v_eta_check` | 2 | `prompt` | *"When do you expect to deliver? Text back a day and time."* |
| `v_pickup_request` | 1 | `apply` `pickup_scheduled`, `eta: null` | `eta_set` with notes, **`eta_at` untouched** (§6.4) |
| `v_pickup_request` | 2 | `prompt` | *"When can you collect it? Text back a day and time."* |
| `f_delivery_confirm` | 1 | `family_confirm` true | `family_confirmed` event + resolve the no-POD escalation + chain the condition check |
| `f_delivery_confirm` | 2 | `family_confirm` false | replace the escalation with the sharper reason (§6.3) |
| `f_condition_check` | 1-5 | `delegate` condition | `handleCaregiverReply(orderId, body)` verbatim |
| *(everything else)* | any | — | **review queue** |

Four properties fall out of the table being a table:

1. **`apply` reuses `applyParsed()` verbatim**, synthesizing a real `ParsedMessage`
   `{ order_ref: String(orderId), intent, eta_iso, notes, confidence: 1 }` stored on the row with
   `review_status = 'auto_applied'`. There is no second intent→event map to keep in sync with
   `INTENT_EVENT`, exactly as `IVR-SIM-SPEC.md` §4.2 established for keypresses.
2. **Actor is `'vendor'`** on vendor digits (no model participated — the vendor spoke) and
   `'family'` on F1.
3. **The three ways to land in review are enumerated, not incidental:** unknown/absent template,
   digit not in that template's map, or the question already has `answered_at`. All three store the
   row with `review_status = 'needs_review'` and apply nothing.
4. **Family free text never reaches a model.** No `extractJson()` call, no API key needed, straight
   to review. A household writing prose to a hospice ("who is this?", "he passed last night") is the
   last text on earth to hand to an autonomous parser.

### 6.1 Already-answered

`answered_at` is set on the outbound question row inside the same synchronous better-sqlite3 block
that inserts the inbound row. A second "1" against the same question is stored, marked
`needs_review`, and applies nothing — the vendor who taps twice does not double-accept, and the
board does not 409 in front of a judge (a duplicate `vendor_accepted` on a `dispatched` order would
throw `TransitionError`; the answered-check catches it before `applyParsed` ever runs).

### 6.2 Vendor free text

Unchanged: `handleInbound()`, `extractJson()`, the 0.8 confidence gate, the review queue. The
router only intercepts **digits**; anything else on a vendor thread is forwarded verbatim. The gate
is the project's AI-safety story and this feature does not go near it.

*(Refinement deliberately not taken: `IVR-SIM-SPEC.md` §4.3 proposes passing an `order_id` hint into
`handleInbound()` so a prompt reply like "Friday morning" can resolve an order the text never names.
It is the right idea and it belongs to whoever builds it there; duplicating it here would create two
half-implementations of one parameter.)*

### 6.3 F1 and the escalation-dedupe trap

`escalate()` **no-ops when the order already has an open escalation.** The F1 text only exists
because `applyParsed()` opened one (`… marked delivered by the vendor without proof of delivery`).
So a naive "family says no → `escalate(...)`" **writes nothing at all** and the dark path silently
does nothing on stage.

Required order of operations in the `family_confirm` handler, both branches:

```
1. resolve the open no-POD escalation for this order   (guard: reason LIKE '%without proof of%')
2. record the family_confirmed event (digit 1 only)
3. digit 2 → escalate('Vendor reports order #N delivered; the family says it has not arrived')
4. digit 1 → sendConditionCheck(orderId)               (its own guards decide)
```

The guard on step 1 matters: `escalate()`'s dedupe means there is normally exactly one open
escalation, but resolving by reason keeps a coincidental unrelated escalation from being cleared by
a family reply. `POST /orders/:id/swap-vendor` resolves open escalations unconditionally today; that
is a hospice action and a different judgment call. Do not copy it here.

Either way, the household's answer **replaces** the vague "confirm with the family or request a POD"
escalation with the answer to that exact question. The board goes from *we don't know* to *we know* —
which is the whole product, expressed in one escalation row.

### 6.4 V4 digit 1 does not write an ETA

`pickup_scheduled` maps to `eta_set` in `INTENT_EVENT`, and `applyEvent()` writes `eta_at` whenever
`payload.eta_iso` is present. Commit `6913f0e` made `eta_at` **re-anchor the pickup-overdue clock**
when an `eta_set` lands after `pickup_triggered`. So writing "today" as an ETA on every digit-1
reply would let a vendor stay permanently not-overdue by texting `1` once a day.

Digit 1 therefore sends `eta_iso: null` and puts the promise in `notes` ("vendor says today"). The
event is on the ledger, the clock stays honest. The **digit 2 → free-text** path *does* set an ETA
and *does* re-anchor — that is the intended behavior of `pickupAnchor()`: a vendor who names a time
gets measured against the time they named. (Same call as `IVR-SIM-SPEC.md` §4.2, reached
independently and now with the clock fix as the reason rather than a workaround.)

### 6.5 Prompts

A `prompt` action does three things: stores the inbound digit row (`auto_applied`, `parsed = null` —
nothing about "the vendor pressed 2" needs human review), stamps `answered_at` on the question, and
sends an outbound message with **`template: NULL`**. A null template has no digit map, so a stray
digit against a prompt lands in review by the same rule as everything else. The *content* the vendor
then texts is the reviewable artifact, and it goes through the confidence gate as its own message.

---

## 7 · Endpoints

### 7.1 `POST /api/messages/reply` — the one inbound the simulator uses

```
Request:  { reply_to_message_id: number, digit?: string, body?: string }
Response: 200 SmsReplyResult
          400 { error: 'digit or body required' }
          404 { error: 'message not found' }
          409 TransitionError passthrough (existing error middleware)
```

`reply_to_message_id` is a **body field**, not a path segment or a header, per the locked decision:
the simulator renders threads, so it always has the id of the bubble being replied to. Everything
else — vendor, patient, order, template — is derived from that row. The client never asserts who it
is.

`handleReply()` in `server/sms.ts`:

1. Load the referenced message. Not found → 404. Not `direction = 'out'` → treat as untemplated.
2. `digit` present → look up `REPLY_ROUTES[template][digit]`, respecting `answered_at`.
   Miss on any step → store `needs_review`, `outcome: 'unmapped'` (no template/digit match) or
   `'review'` (already answered).
3. `body` present, vendor thread → `handleInbound(vendor_id, body)` unchanged, then patch the new
   columns onto the row it created.
4. `body` present, family thread → if the open question is `f_condition_check`, delegate to
   `handleCaregiverReply()` (it parses "2 - one of the wheels sticks" better than a digit-only path
   could); otherwise store `needs_review`. Never a model call.
5. Broadcast `{ type: 'message', … }` — already handled inside `sendToVendor`/`handleInbound`; the
   digit path broadcasts explicitly.

`POST /api/messages/inbound` is **untouched**, so the existing `Vendor.tsx` simulator keeps working
unchanged during and after this build.

### 7.2 `POST /api/messages/send` — presenter escape hatch *(optional, cut second)*

```
Request:  { order_id: number, template: MessageTemplate }
Response: 201 { message_id, body } | 409 { error: '<gate reason>' }
```

Four lines delegating to the same send helpers the watchdog uses. Buys the presenter a button for
the V3 ETA check without waiting for a morning-of clock condition, and makes the `householdGate`
refusal reasons ("patient deceased — this channel stays silent") demonstrable on demand. That last
one is a *better* judge answer than any slide about it.

### 7.3 Reads

None new. The emulator reads `GET /api/messages` (exists, unfiltered), `GET /api/vendors`, and
`GET /api/patients` (all exist) and groups client-side. The seed writes no message rows, so the
unfiltered fetch is small. Full contract in §10.

---

## 8 · Trigger map — which template fires from where

| Template | File · function | Condition |
|---|---|---|
| `v_order_request` | `routes.ts` `POST /orders` · `POST /orders/:id/swap-vendor` | existing — unchanged except the template argument |
| `v_ack_nag` | `watchdog.ts` `tick()` | existing silence ladder — unchanged except the template argument |
| `v_eta_check` | `watchdog.ts` `tick()` | **new**: state ∈ {`dispatched`, `in_transit`}, `target_at` is today (local), `now.getHours() >= ETA_CHECK_HOUR` (default 8), and no `v_eta_check` row for this order since local midnight |
| `v_pickup_request` | `pickups.ts` `setPatientStatus()` | existing — unchanged except the template argument |
| `f_delivery_confirm` | `messaging.ts` `applyParsed()`, `intent === 'delivered'` branch | **new**: right after the existing `escalate(… without proof of delivery)`, gated on `!order.delivery_verified` and `householdGate()` |
| `f_condition_check` | `routes.ts` POD route (existing) **or** F1 digit-1 handler (new) | `sendConditionCheck()` unchanged; only the call site is new |
| `f_eta_notice` | `messaging.ts` `applyParsed()` · `portal.ts` `portalConfirm`/`portalSetEta` | **new**: `eta_at` newly set, state pre-delivery, once per order |
| `f_pickup_notice` | same two places | **new**: `eta_set` while state ∈ {`pickup_pending`, `pickup_overdue`}, or V4 digit 1, once per order |
| `f_delivered_thanks` / `f_picked_up_thanks` | `routes.ts` POD route, at the existing `family_notified` `applyEvent` | **new**: the message row is inserted next to the event, body === `payload.text` |

Two honest gaps in that table:

- **F2/F3 fire from `applyParsed` and `portal.ts`, not from `applyEvent`.** An `eta_set` posted
  directly through `POST /orders/:id/events` sends no family notice. That route is a demo/debug
  escape hatch, not a user path, and moving sends into `applyEvent` would contradict §0.4 and the
  existing architecture. Named, not fixed.
- **F2 fires once per order, not on every ETA revision.** A vendor who slips their ETA twice
  generates one family notice. Correct for tone (fewer touches), wrong for information. The right
  v2 rule is "notify again only if the new ETA crosses the target date." Out of scope.

`f_delivered_thanks`/`f_picked_up_thanks` are a small expansion of the brief's F4 (which named only
the picked-up thank-you): the existing `family_notified` event already fires for both kinds with
both strings, so sending a message row for one and not the other would be arbitrary. It is one entry
in a map. Cut to pickup-only if anyone objects.

---

## 9 · What changes in existing code, and what must not

### 9.1 `sendToVendor()` — extended, not renamed

```ts
export function sendToVendor(vendorId: number, orderId: number | null, body: string,
                             template?: VendorTemplate): void
export function sendToFamily(patientId: number, orderId: number, body: string,
                             template: FamilyTemplate): number | null
```

Both delegate to one private `insertMessage()`. **`sendToVendor` is not renamed to a generic
`sendMessage(recipient…)`**: the rename would touch four call sites and every test that imports it,
to buy a shorter symbol table. `sendToFamily` returns the new message id (or `null` when the
household gate refuses) so callers can chain — F1's handler needs the id it just sent.

Trailing optional `template` means all four existing call sites compile untouched; each then gets
its one-word argument added.

### 9.2 The silence ladder's body-equality check — the one thing that must keep working

`watchdog.ts` decides whether it has already nagged by **comparing message bodies**:

```ts
"SELECT created_at FROM messages WHERE order_id = ? AND direction = 'out' AND body = ? AND created_at >= ?"
  .get(order.id, ackNagText(order), anchor)
```

V2 changes `ackNagText()`'s wording, and the check still works — the same function generates both
sides of the comparison, so they move together. `tests/silence.test.ts` (which asserts
`msgs[0].body === ackNagText(getOrder(id)!)`) stays green with no edit. **Nothing about this feature
requires touching it.**

It should be changed anyway, to one line:

```ts
"… AND direction = 'out' AND template = 'v_ack_nag' AND created_at >= ?"
```

Equivalent today (the `created_at >= anchor` clause already handles the post-swap case where the
link inside the body changes), strictly more robust tomorrow, and it removes a live landmine: the
moment anyone makes the nag body time-dependent — *"still unconfirmed 5h after placement"*, which
is exactly the phrasing the escalation already uses and the obvious next copy edit — body equality
silently stops matching and **the vendor gets re-nagged every thirty seconds, forever.** A nag loop
is the single worst bug this codebase could ship to a demo.

Do it in the same commit as the `template` column, with a test that nags once across three ticks
after the body has been mutated in the DB (i.e. a test that fails under body-equality and passes
under template matching). If the team prefers minimum diff, leaving it is *safe today* — but write
the landmine down in `CLAUDE.md`'s Gotchas.

### 9.3 The messages filter must exclude family rows

```ts
// routes.ts GET /messages
if (vendorId) { where.push('vendor_id = ?', "recipient_type = 'vendor'"); params.push(vendorId) }
```

Without this, `Vendor.tsx`'s phone simulator shows family texts inside the vendor's thread — a live
PHI-adjacent leak on stage and the direct consequence of the §0.1 deviation. **This one line is not
optional.** A test asserts it.

The review queue (`GET /api/messages?review_status=needs_review`) *should* include family rows —
that is where an unparseable household reply belongs. `Hospice.tsx`'s `ReviewRow` resolves candidate
orders by `o.vendor_id === message.vendor_id`, which still returns sane options under §0.1. It will,
however, offer "apply this parsed intent" affordances for a family message, which is wrong. Minimum
FE fix: badge family rows and hide the apply control. Flagged for the review-queue owner; not a
blocker.

### 9.4 Untouched, on purpose

`server/risk.ts` and `tests/risk.test.ts` (silence is still an escalation, not a risk reason — same
call as `IVR-SIM-SPEC.md` deviation 2) · `server/statemachine.ts` beyond one `TRANSITIONS` row ·
`extractJson()` and the 0.8 gate · `parseConditionReply()` · `POST /api/messages/inbound` ·
`GET /api/orders/:id` (it already returns `messages`, which now include family rows for that order —
free, and correct).

---

## 10 · Emulator integration contract

**The phone emulator UI is owned by another dev and is already built.** This section is the backend
contract it consumes — endpoints, shapes, and the live-update mechanism. Look, layout, thread
chrome, and interaction design belong to its owner and are deliberately absent here.

> ⚠️ **Written blind.** The emulator was not pushed to `origin` when this spec was written, so this
> contract describes what the backend *offers*, not what the emulator *calls*. Any mismatch is a
> merge-time reconciliation, not a defect on either side. Most likely divergences, in order: the
> reply endpoint's path and field names (§10.2); whether the emulator expects a thread-scoped read
> instead of grouping client-side (§10.1); and whether it wants digit **labels** from the server
> rather than hard-coding them (§10.3). All three are small; settle them in the merge, and make the
> **server** authoritative on actions in every case.

### 10.1 Enumerating threads and reading one

No new read endpoints. Everything the emulator needs exists:

| Need | Call | Notes |
|---|---|---|
| All messages | `GET /api/messages` | Unfiltered, `ORDER BY id`. Seeds write **no** message rows, so this is small — grouping client-side is cheap and correct. |
| Vendor thread only | `GET /api/messages?vendor_id=N` | Returns `recipient_type = 'vendor'` rows only, per the §9.3 guard. |
| Thread parties | `GET /api/vendors`, `GET /api/patients` | Vendors carry `name`/`phone`; patients carry `caregiver_name`/`caregiver_phone`/`contact_ok`. |
| One order's messages | `GET /api/orders/:id` → `.messages` | Now includes that order's family rows, for free. |

**Thread key:** `recipient_type === 'vendor'` → group by `vendor_id`; `recipient_type === 'family'`
→ group by `patient_id`. Never group family rows by `vendor_id` — family rows carry the order's
vendor as a denormalized join key only (§0.1).

Household threads belong to the **caregiver, not the patient** (`patients.caregiver_name` /
`caregiver_phone`). If the emulator labels a household thread with the patient's name, that is a
tone bug worth fixing at merge — we text the person who opens the door.

**Which question is open:** an outbound row with a non-null `template` and `answered_at === null`.
Under §1.3 rule 3 a household thread has at most one; a vendor thread can have one per order.

### 10.2 Sending a reply

One endpoint for every inbound the emulator produces (§7.1):

```
POST /api/messages/reply
  { reply_to_message_id: number, digit?: string }   // quick reply
  { reply_to_message_id: number, body?: string }    // free text
→ 200 SmsReplyResult { message_id, in_reply_to, template, digit, outcome, prompt, order }
  400 digit or body required · 404 message not found · 409 TransitionError
```

`reply_to_message_id` is a **body field** because the emulator renders threads and therefore always
knows which bubble is being answered. It is the only identity the client asserts — vendor, patient,
order, and template are all derived server-side from that row.

`outcome` tells the emulator what happened without it having to re-derive anything:
`applied` (state moved — the board will already be updating) · `prompt` (we texted back a question;
`prompt` carries the text) · `review` (stored, needs a human — e.g. a second answer to an already
answered question) · `unmapped` (no template/digit match; stored, nothing applied).

`POST /api/messages/inbound` remains unchanged for the older `Vendor.tsx` simulator.

### 10.3 Which digits to show

`REPLY_ROUTES` (§6) is server-side and authoritative. The emulator needs only **labels**, and may
hard-code them:

| Template | 1 | 2 | … |
|---|---|---|---|
| `v_order_request`, `v_ack_nag` | Accept | Can't fill | — |
| `v_eta_check` | On schedule | Delayed | — |
| `v_pickup_request` | Today | Later | — |
| `f_delivery_confirm` | Yes, it's here | No, not yet | — |
| `f_condition_check` | Unusable | Poor | 3 Acceptable · 4 Good · 5 Like new |
| *(informational templates)* | — | — | no buttons |

A hard-coded label table can drift from `REPLY_ROUTES`. If that matters to the emulator's owner, the
fix is a `GET /api/messages/templates` returning the label map — trivial, not built, and only worth
it if the drift is real. **Never let the client decide the action**; a wrong label is cosmetic, a
client-side action would be a second source of truth.

### 10.4 Live updates

**No new SSE plumbing.** Every outbound send and every inbound reply broadcasts the existing
`{ type: 'message', message_id, vendor_id, direction }` variant, and `useLive()` refetches on *any*
event (§0.6). An emulator window and the hospice board in a second window therefore stay in sync
with no coordination, and a mid-demo refresh loses nothing because the thread is derived entirely
from persisted rows.

The `message` event carries no `recipient_type`; the emulator refetches and regroups. Adding one
would mean touching the `DistributiveOmit` in `server/sse.ts` (see `CLAUDE.md` Gotchas) to buy an
optimization nothing needs.

### 10.5 Magic links are real

Every V1/V2/V3/V4 body contains a genuine `http://…/portal/<token>` URL produced by `magicLink()`.
**Render them as tappable anchors** (`https?://\S+` → `<a target="_blank">`) — nothing about them is
faked, and this closes `DEMO-SCRIPT.md` FE punch-list item 4.

They need punch-list item 1 (the `/portal/:token` client page) to land somewhere, which is **not a
blocker for this feature**: the quick-reply digits give the same demo beat a click whether or not
the portal page ships (§2, §12.2). Family templates carry **no links** by design.

Per repo convention, **no UI tests** on either side of this contract.

---

## 11 · Simulation seams — and a production design sketch

Labeled clearly: **the resolver below is a design sketch, not built and not tested.** It is written
in earnest because "we'd figure out routing later" is the honest answer to a hard question, and a
sketch is a better one.

### 11.1 The seams, plainly

| Seam | Simulation | Reality |
|---|---|---|
| **Reply→question binding** | `reply_to_message_id` comes from the emulator, which rendered the thread and therefore knows | A carrier delivers `From`, `To`, `Body`. **No reference to what is being answered.** §11.2 |
| **Identity** | A thread is a row id | A thread is a phone number, and phone numbers are reassigned, shared by a warehouse, and forwarded |
| **Delivery** | Insert succeeds ⇒ delivered | Queued / sent / delivered / undelivered / failed, asynchronously, with carrier filtering. See `IVR-SIM-SPEC.md` §10 |
| **Consent** | `contact_ok` starts at 1 | STOP/HELP are legally mandated and carrier-enforced; opt-in provenance must be recorded |
| **Landlines** | Every number is textable | Roughly half a hospice rolodex cannot receive SMS at all. That is what the IVR channel is for — `IVR-SIM-SPEC.md` §10 (Twilio Lookup routing) |
| **Timing** | Instant | Seconds to minutes; a reply can arrive after the thing it answers is obsolete |
| **The other inbound route** | `/orders/:id/condition-reply` takes the order in the URL | Nobody hands you an order id over SMS. §1.4 |

### 11.2 Production reply routing — design sketch

**Thread identity = (sender number, our Twilio number).** Not vendor, not patient — a number. A
vendor's dispatch phone and a caregiver's cell are both just numbers; the mapping to a party is a
lookup, and one number may map to several open orders. Everything below keys off the thread.

**Resolution order for an inbound `1`:**

1. **Exactly one unanswered question in the thread within the expiry window → answer it.** This is
   the overwhelmingly common case, and §1.3 rule 3 makes it structurally common: a thread that is
   only ever allowed one open question cannot be ambiguous. *The simulation's rule and production's
   rule are the same rule* — the sim just gets to enforce it perfectly.
2. **Expiry.** A digit cannot answer a question older than `REPLY_EXPIRY_HOURS` (proposal: 12 for
   vendors, 48 for households — a family may not look at their phone for a day). An expired-only
   match is not applied; it triggers a re-ask ("Just to confirm which one — reply 1 if the bed has
   arrived") or, if we have already re-asked once, the review queue.
3. **Two or more open questions → never guess.** Send one clarifying text that makes the answer
   unambiguous ("Which order? Reply 1042-1 or 1043-1"), and open a review item at the same time so a
   human sees it whether or not the vendor answers. The clarifier is rate-limited to one per thread
   per hour — a confused vendor must never be able to trigger a loop.
4. **No open question at all → review queue,** with the thread's recent history attached. An
   unprompted "1" from a vendor is meaningless and an unprompted text from a household ("he passed
   this morning") is the most important message the system will ever receive. Both need a person;
   only one is urgent, and telling them apart is a human's job.
5. **Never a model in this path.** Free text may reach the parse gate; digit routing may not. The
   entire value of a digit is that it did not require interpretation.

**Also required, absent here:** `X-Twilio-Signature` validation · idempotency on `MessageSid`
(carriers retry) · a `messages_threads` table keyed by the number pair, since `messages.vendor_id`
would stop being the identity · STOP/START/HELP handling that writes back to `contact_ok` · a
branded caller ID / short code so a hospice text is not mistaken for spam (`IVR-SIM-SPEC.md` §10) ·
quiet hours per §1.3 rule 5, which in production is a compliance question, not a manners one ·
and per-thread rate limits so no household can receive more than N messages a day regardless of how
many orders are open.

**HIPAA:** unchanged from `IVR-SIM-SPEC.md` §10 — Twilio is HIPAA-eligible and signs BAAs, and the
minimum-necessary payload rules in §3 are designed in, not retrofitted. The household templates are
*stricter* than the vendor ones: no order number, no name, no address.

---

## 12 · Demo beats

The phone emulator opens in a **second browser window**, so scenarios 2 and 3 become split-screen:
board left, phones right. Nothing is narrated that is not on screen. (Beats are written against the
message flow, not against the emulator's layout — its owner may render these differently.)

### 12.1 Scenario 2 — the nurse in the home (reshaped)

Replaces steps 2-5 of `DEMO-SCRIPT.md` §4. Same length, three additional visible artifacts.

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | Nurse taps **Ruth Nakamura → Patient has died** | one tap, one confirm | *(unchanged)* |
| 2 | *(phones window)* | Wasatch's thread: two pickup texts appear, each with **1 · Today** / **2 · Later** and a link | "Two pickup requests, sent by the software. Nobody in that house made a call." |
| 3 | Tap **1 · Today** on one | Board flips to Pickup; the **Nakamura household** thread lights up with F3: *"someone will be by today… there's nothing you need to do."* | "And the family gets told, once, in a sentence that doesn't ask them for anything." |
| 4 | `/driver` → complete pickup → sign | Board → Done | *(unchanged)* |
| 5 | *(phones window, household thread)* | F4p appears: *"the equipment has been picked up. There's nothing else you need to do. We're thinking of your family."* | **"Ruth's family made zero phone calls. That's the product — and that's every message they got. Two. Neither one needed an answer."** |

The closing line now points at rendered text instead of an event type. This is `DEMO-SCRIPT.md` FE
punch-list item 6, solved as a side effect.

### 12.2 Scenario 3 — the cold-start vendor (reshaped, and de-risked)

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | Point at #1060 | brand-new vendor, no history | *(unchanged)* |
| 2 | *(phones window)* → **Timpanogos** | the order request, with **1 · Accept** / **2 · Can't fill** and the real magic link | "This is everything we send them. Two ways to answer, and they pick." |
| 3 | Tap **1 · Accept** *(or tap the link if the portal page shipped)* | Board: `ordered → dispatched` live. Ledger: **confidence 100%, auto-applied, actor `vendor`** | "One digit. No model ran — a `1` under a known question means exactly one thing. Claude is in this product for prose, and a `1` isn't prose." |
| 4 | Thread list, **Beehive** | **1** unanswered badge; the nag arrived under an order request that still shows two untapped buttons | "Nobody answered this one. So the software nagged them — the case manager didn't." |
| 5 | Board | escalation banner | *(unchanged silence beat)* |

Step 3 is the de-risking: `DEMO-SCRIPT.md` calls the missing `/portal/:token` page the highest-value
FE item in the repo and notes the climax has no click without it. Now it has two, and neither
depends on the other.

### 12.3 The F1 dark path — optional Q&A beat (~25s)

Keep in the pocket for *"vendors could just lie by text."* Do not spend pitch time on it.

1. Phones window, vendor thread: type **"delivered, all set"**. Parsed, auto-applied → board flips
   to Delivered — **badged `Vendor-reported`, not `✓ Verified`**, with an escalation: *"marked
   delivered by the vendor without proof of delivery."*
2. Household thread: F1 has already appeared. *"So we ask the only person who can actually see the
   living room."*
3. Tap **2 · No**. The escalation reason **changes** to *"Vendor reports order #1042 delivered; the
   family says it has not arrived."*
4. Line: *"They can lie to us. They can't lie to the family and the ledger at the same time — and
   the case manager knew inside a minute, not at the next phone call."*
5. If asked the other way: tap **1 · Yes** → the badge becomes **Family-confirmed** — *not*
   `✓ Verified`, because a text is not a signature — and the condition check follows in the same
   thread. *"Three levels of evidence, and we never promote a claim past what we can prove."*

---

## 13 · Test plan

New `tests/sms.test.ts`, following the `beforeEach(seedFixtures)` + `seedOrder()` pattern with
`delete process.env.ANTHROPIC_API_KEY` (as `messaging.test.ts` and `silence.test.ts` do). **Core
logic only; UI stays test-free; routes remain untested as they are today** — every assertion drives
`handleReply()` / the send helpers directly.

`tests/helpers.ts` needs two lines: a `caregiver_phone` and `contact_ok = 1` on the fixture patient,
plus a second patient with `contact_ok = 0` for the opt-out case.

**Table integrity** (cheap, catches the drift that would break everything else)
- Every `apply` action's intent exists in `INTENT_EVENT` (the test that stops someone adding a
  `decline` row to the table and shipping a throw).
- Every template in `REPLY_ROUTES` is a valid `MessageTemplate`; every informational template is
  absent from it.

**Vendor digits**
- V1 `1` → state `dispatched`, `order_events` has `vendor_accepted` actor `vendor`, message row is
  `confidence: 1` / `auto_applied`, and the question row's `answered_at` is set.
- V1 `2` → exactly one open escalation, state still `ordered`, **no** new `order_events` row.
- V3 `1` → `eta_at === target_at`, state unchanged.
- V3 `2` → `outcome: 'prompt'`, no `order_events` row, one outbound row with `template IS NULL`.
- **V4 `1` → `eta_at` unchanged** (the §6.4 clock guard — this is the test that stops someone
  "helpfully" setting an ETA there later; assert alongside `pickupAnchor` still measuring from
  `pickup_triggered`).
- Replying `1` twice → second is `needs_review`, nothing applied, no `TransitionError`.
- Digit `9` on V1 → `needs_review`.
- A digit against an informational template (`f_pickup_notice`) → `needs_review`.

**Family**
- F1 `1` → `family_confirmed` event with actor `'family'`; `order.family_confirmed` true;
  **`delivery_verified` still false**; the "without proof of delivery" escalation is resolved; a
  `f_condition_check` row now exists.
- F1 `2` → the no-POD escalation is resolved **and** a new open escalation matches
  `/family says it has not arrived/`. *(This test fails against the naive implementation because
  `escalate()` dedupes — §6.3. Write it first.)*
- F1 is sent by `applyParsed`'s `delivered` branch, and is **not** sent when `delivery_verified` is
  true.
- `f_condition_check` digit `3` → one `condition_reports` row, `source: 'caregiver'`; digit `1` →
  a row scored 1 **and** an escalation (proving the `1`-means-two-things case in §4 resolves by
  template, not by digit).
- Household free text ("who is this?") on a non-condition thread → `needs_review`, `parsed IS NULL`,
  and — asserted explicitly — no API key was needed to get there.
- Gate: patient `deceased` → no F1 and no condition check, but `f_pickup_notice` still sends.
  `contact_ok = 0` → nothing sends at all.

**Regression guards**
- `GET`-shaped query in `routes.ts`: filtering by `vendor_id` excludes `recipient_type = 'family'`
  rows (§9.3). Assert against the SQL builder or a direct `db` query mirroring it.
- The silence ladder nags exactly once across three ticks **after the nag body has been mutated in
  the DB** — fails under body equality, passes under `template = 'v_ack_nag'` (§9.2).
- `tests/silence.test.ts`, `tests/messaging.test.ts`, `tests/condition.test.ts`,
  `tests/evidence.test.ts`, `tests/pickup-clock.test.ts`, `tests/reports.test.ts` all stay green
  **untouched**. If `reports.test.ts` pins `calls_avoided`, §1.5 is not optional — fix it in this
  branch.

---

## 14 · Seed changes

**Effectively none — this is the happy consequence of §0.7.** `scripts/seed.ts` already gives all
twelve patients a `caregiver_name`, a `caregiver_phone`, and `contact_ok = 1`, and the scenario
patients the demo script names (Margaret Osei → Kwame Osei, Ruth Nakamura → Ken Nakamura) are
already covered.

Optional, one line each:

- Set `contact_ok = 0` on one non-demo patient (say #8) so the opt-out gate has a real subject to
  demonstrate via §7.2 rather than only in a test.
- If the F1 dark path (§12.3) is rehearsed often, seed an `in_transit` order in scenario 1 so the
  "delivered, all set" text has a target without disturbing the existing beats — e.g.
  `seedOrder(1044, 3, 2, BED, 'in_transit', 10, 6)`.

No new columns, no historical backfill. Family message rows are created live during the demo, which
is the point — an empty thread that fills up while the audience watches is more convincing than a
seeded conversation.

---

## 15 · Effort and cut order

Targets **3-5 hours**. The emulator UI is already built and owned elsewhere, so the FE lane that
would have cost ~1h15 is **already spent** — what remains is ~3h of backend and tests, plus a merge
reconciliation against the real emulator (§10).

| Lane | Work | Est. |
|---|---|---|
| **Backend — routing** | `shared/types.ts` (Actor, event type, templates, `SmsReplyResult`) · four `messages` columns + the `CREATE` body · `server/sms.ts` (`REPLY_ROUTES`, `handleReply`) · `POST /messages/reply` · §9.3 filter guard · §1.5 reports fix | ~1h15 |
| **Backend — templates & triggers** | V1/V2/V4 copy edits, V3 new, six family strings · `sendToFamily` + `householdGate` · trigger call sites (watchdog V3, `applyParsed` F1/F2, POD F4, portal F2/F3) · `family_confirmed` derived column | ~1h00 |
| **Tests** | `tests/sms.test.ts` per §13 · `helpers.ts` caregiver columns | ~45m |
| **Merge reconciliation** | Align §10's contract with the emulator as pushed: endpoint path/field names, thread grouping, digit labels | ~15m |

**Sequencing:** the routing lane ships `shared/types.ts` and the `POST /messages/reply`
request/response shape first, since that is the emulator's only hard dependency — get it in front of
the emulator's owner within the first 20 minutes so any mismatch surfaces while both sides are still
cheap to change. The tests lane starts with the two failing-first cases (F1 digit 2 under
`escalate()`'s dedupe, V4 digit 1 leaving `eta_at` alone) because both are traps the implementation
will otherwise walk into.

**Cut in this order if time collapses:**

1. **Quiet hours** (§1.3 rule 5) — already only a sketch.
2. **`POST /api/messages/send`** (§7.2) — the presenter can fire V3 by moving `ETA_CHECK_HOUR`.
3. **V3 (`v_eta_check`) entirely** — the only wholly new vendor template, and the morning-of clock
   condition is the fiddliest thing in the watchdog. The other three templates carry the demo.
4. **F2 (`f_eta_notice`)** — the least emotionally load-bearing family message; the household
   learning an ETA is nice, learning about the pickup is the thesis.
5. **The `family_confirmed` derived column** — the badge can read the events array.
6. **The whole household thread except F1** — F1 is the one that makes the vendor-lie argument, and
   §1.2's chain into the condition check is what makes the household channel coherent at all.

**What must survive every cut:** an outbound text with a `template`, a tappable digit that routes
through the table into `applyEvent`, at confidence 1.0 with no model call, rendered as a thread in a
second window — plus §9.3's filter guard, which is a correctness fix, not a feature.
