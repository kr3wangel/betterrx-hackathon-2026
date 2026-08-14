# Simulated IVR Call Channel — Design Spec

A second rung-1 channel for vendors who will reply to a phone call but never to a text. Same
pipeline, same state machine, same review queue — only the input device changes.

Build is **simulation-only**: a call panel inside the existing vendor phone simulator, browser
`speechSynthesis` for the voice, keypad buttons for DTMF. No telephony provider, no network
dependency beyond the free-text branch.

---

## 0 · Deviations from the brief's assumptions

The brief for this spec made a few assumptions the codebase contradicts. The codebase wins; here's
where and why.

1. **Outbound sends are not side effects of transitions.** `CLAUDE.md` says "outbound SMS templates
   fire as side effects of transitions," but in the code `sendToVendor()` is called from
   `server/routes.ts` at three explicit call sites (`POST /orders`, `POST /orders/:id/swap-vendor`,
   `POST /emr/patient-status`). `server/messaging.ts` owns only the templates and the insert.
   Call *placement* is clock-driven, not transition-driven, so it lives in `server/watchdog.ts`
   (the only clock in the system) plus an explicit route for demo control — **not** in
   `messaging.ts`.
2. **`computeRisk()` cannot see silence.** It is a pure `(order, stats, now)` function in
   `server/risk.ts` with no access to `messages`. "Vendor silence becomes a risk flag" is today only
   indirectly true, via the `vendor has not accepted and deadline is in ${h}h` rule. A no-answer
   therefore becomes a **watchdog escalation**, not a new risk reason — `risk.ts` and
   `tests/risk.test.ts` stay untouched. (Stretch option in §8.)
3. **There is no vendor-simulator component file.** `PhoneSimulator` is a local function component
   at the bottom of `client/src/pages/Vendor.tsx`. New UI goes in the same file, matching
   `Hospice.tsx` (five local components in one file).
4. **`messages` has no channel column, and there is no migration path.** `server/db.ts` uses
   `CREATE TABLE IF NOT EXISTS`, so adding a column does **not** apply to an existing `data/app.db`.
   Anyone pulling this change must run `npm run db:reset && npm run seed`.
5. **`decline` has no event mapping.** `INTENT_EVENT` in `messaging.ts` has no `decline` key and
   `applyParsed()` throws `intent decline has no event mapping`. The press-2-at-acceptance path must
   escalate directly (mirroring the decline branch in `handleInbound`), not route through
   `applyParsed`.
6. **No `ServerEvent` change is needed.** `useLive()` refetches on *every* SSE event and
   `sendToVendor()` already broadcasts `{ type: 'message' }`. The client derives "a call is ringing"
   from the refetched message list, which also means a ringing call survives a page refresh.
7. **DTMF events are actor `'vendor'`, not `'ai'`.** The brief is right that they bypass `llm.ts`;
   the actor should reflect that no model participated. A keypress is the vendor speaking directly.

---

## 1 · Feature summary

The vendor adoption ladder in `docs/PROBLEM-THESIS.md` has rung 1 as "replies to a text from their
customer." That's one channel standing in for a general claim. This feature makes **rung 1
channel-agnostic**: the vendor either texts back or presses 1 on a call, and both land as the same
structured order event through the same `applyEvent()`.

The pitch line: *the vendor does not adopt a channel — we adopt theirs.* A dispatcher who answers
the phone all day but never reads texts is a full participant from call one, with the same zero
onboarding.

The voice channel is also structurally necessary, not just a preference accommodation: a large share
of the numbers in a hospice's vendor rolodex are **office landlines, which cannot receive SMS**.
Voice reaches every phone number ever issued. Without this channel, rung 1 of the adoption ladder
silently excludes exactly the phone-only regional vendors the thesis claims to reach — in
production, a carrier lookup classifies each number and routes text vs voice automatically (§10).

There is a second, sharper argument the DTMF path buys us: **a keypress is deterministic**. Digit
`1` at a known lifecycle moment has exactly one meaning, so the event is applied at confidence 1.0
with no model call at all. The AI-safety story gets a nice shape — Claude is used only where rules
genuinely cannot go (reading free human text), and the moment the input becomes structured, the
model steps out of the loop entirely. This is demonstrable offline, with no `ANTHROPIC_API_KEY` set.

---

## 2 · Lifecycle moments and scripts

A call moment is a **pure function of the order's current state**, which is why nothing about the
moment needs to be persisted — the server re-derives it at keypress time.

```ts
// server/calls.ts
export function resolveMoment(order: Order): CallMoment | null
```

| Moment | Order states | Clock condition to place the call |
|---|---|---|
| `acceptance_check` | `ordered` | ≥ `CALL_ACCEPT_WAIT_MINUTES` (default 120) since the order's last `order_events` row |
| `eta_check` | `dispatched`, `in_transit` | `target_at` falls on today's local date **and** `now.getHours() >= CALL_ETA_HOUR` (default 8) |
| `pickup_confirm` | `pickup_pending`, `pickup_overdue` | ≥ `CALL_PICKUP_WAIT_MINUTES` (default 120) since the order's last `order_events` row |
| — | `delivered`, `picked_up`, `cancelled` | never call |

Env vars follow the `PICKUP_WINDOW_HOURS` idiom already in `watchdog.ts`
(`Number(process.env.X ?? default)`). For the demo, set the wait minutes to `0` in `.env` so a call
arms on the first tick — or just use the manual placement route (§4.1), which is what the presenter
should actually click.

Shared guard on all three, so a vendor is never called twice for the same situation: **skip if an
outbound `channel = 'voice'` message already exists for this order created after the order's most
recent `order_events` row.** Any state change (accept, ETA set, delay) re-arms calling; nothing else
does.

### Script templates

Live in `server/calls.ts` next to the moment logic, mirroring the plain-function style of
`orderRequestText()` / `pickupRequestText()` in `messaging.ts`. Deadlines format with the same
`new Date(iso).toLocaleString()` idiom `orderRequestText` uses.

```ts
export function callScriptText(order: Order, moment: CallMoment, patientName?: string): string
```

**`acceptance_check`**
> JobNimbus Hospice calling about order 1062, one hospital bed, due by Aug 14, 2:00 PM.
> Press 1 to confirm you can fill it. Press 2 if you can't. Press 3 to leave a message.

**`eta_check`**
> JobNimbus Hospice calling about order 1060, one hospital bed, due today by 2:00 PM.
> Press 1 if you're on schedule today. Press 2 if it'll be delayed. Press 3 to leave a message.

**`pickup_confirm`**
> JobNimbus Hospice calling about order 1050, a hospital bed pickup, area Cedar Hills.
> Press 1 if you're picking up today. Press 2 if it'll be later. Press 3 to leave a message.

Keep them at two sentences. They get read aloud on a projector, and a long script is dead air in a
five-minute pitch. Press 3 is offered at every moment for a uniform keypad — a small deliberate
simplification over the brief, which only listed it for acceptance.

**Payload discipline (PHI):** patient names and street addresses never appear in a call script or
SMS body — order number, equipment, deadline, and area only, matching `orderRequestText`'s existing
`area ${patientArea}` convention. SMS and plain voice are open channels; the full name/address lives
behind the authenticated driver/dispatch link. This is the minimum-necessary rule from the start,
not a retrofit — say so if a judge raises HIPAA.

---

## 3 · Data model changes

Smallest change that carries the feature: **one column, one type field, one type alias.**

### `server/db.ts` — `messages` table

```sql
channel TEXT NOT NULL DEFAULT 'sms',
```

Added after `direction`. The default means every existing insert site and every seeded row keeps
working untouched. ⚠️ `CREATE TABLE IF NOT EXISTS` will not add this to an existing
`data/app.db` — `npm run db:reset && npm run seed` is required after pulling.

### `shared/types.ts`

```ts
export type MessageChannel = 'sms' | 'voice'

export type CallMoment = 'acceptance_check' | 'eta_check' | 'pickup_confirm'
export type CallDigit = '1' | '2' | '3'

export interface Message {
  // …existing fields
  channel: MessageChannel
}

export interface CallKeypressResult {
  message_id: number
  moment: CallMoment
  digit: CallDigit
  outcome: 'applied' | 'prompt' | 'unmapped'
  intent: MessageIntent | null
  prompt: string | null
  order: Order | null
}
```

`rowToMessage()` in `server/store.ts` needs **no change** — it spreads the row, so `channel` arrives
as soon as the column and the type field exist.

Not added, on purpose:
- **No `calls` table.** A call *is* an outbound message whose channel is `voice`; a keypress *is* an
  inbound message whose channel is `voice`. Reusing `messages` means the vendor thread, the review
  queue, the `GET /orders/:id` bundle, and the SSE broadcast all work with zero new plumbing.
- **No stored moment.** Derived from order state on every read (§2).
- **No new `ServerEvent` variant.** See deviation 6.

### Optional (cut first)

Add `'voice'` to `Vendor['channel']` (currently `'sms' | 'email' | 'portal'`) and set vendor 3 to it
in the seed, purely so the UI can badge a vendor "phone-only" and the presenter has an obvious
vendor to pick. **The scheduler does not branch on it in v1** — every vendor is callable.

---

## 4 · Endpoints

### 4.1 `POST /api/calls/place` — place a simulated call

Demo control and the manual trigger the presenter clicks. Same code path the watchdog uses.

```
Request:  { order_id: number }
Response: 201 { message_id, moment, script }
          400 { error: "order 1050 is delivered — no call moment applies" }
          404 { error: "order not found" }
```

Implementation is four lines in `routes.ts` delegating to `placeCall(order)` in `calls.ts`, which
resolves the moment, renders the script, and calls
`sendToVendor(order.vendor_id, order.id, script, 'voice')`. The existing broadcast inside
`sendToVendor` is what makes the client ring.

### 4.2 `POST /api/calls/keypress` — DTMF, confidence 1.0, no model

```
Request:  { order_id: number, digit: '1' | '2' | '3' }
Response: 200 CallKeypressResult
          409 TransitionError passthrough (handled by the existing error middleware)
```

`vendor_id` is derived from the order rather than accepted from the client — one less field to get
wrong, and the vendor of record is authoritative anyway.

`handleKeypress(orderId, digit)` in `server/calls.ts`:

1. Load the order, `resolveMoment(order)`. No moment → `outcome: 'unmapped'`, nothing applied.
2. Look up the digit in the moment's response table.
3. Insert an inbound message row: `channel = 'voice'`, `direction = 'in'`, body a readable ledger
   line — `[Call] Pressed 1 — confirmed they can fill order #1062`.
4. Apply, per the table below.
5. Return `CallKeypressResult`.

| Moment | Digit | `MessageIntent` | Applied via | Resulting transition |
|---|---|---|---|---|
| `acceptance_check` | 1 | `accept` | `applyParsed(id, parsed, 'vendor')` | `vendor_accepted` → `dispatched` |
| `acceptance_check` | 2 | `decline` | `escalate()` **directly** (see deviation 5) | none; escalation opens |
| `acceptance_check` | 3 | — | none | prompt for free text |
| `eta_check` | 1 | `eta_update` (`eta_iso = order.target_at`) | `applyParsed` | `eta_set`, state unchanged |
| `eta_check` | 2 | — | none | prompt for the new date |
| `eta_check` | 3 | — | none | prompt for free text |
| `pickup_confirm` | 1 | `pickup_scheduled` (`eta_iso = null`) | `applyParsed` | `eta_set`, state unchanged |
| `pickup_confirm` | 2 | — | none | prompt for the new date |
| `pickup_confirm` | 3 | — | none | prompt for free text |

The synthesized parse is a real `ParsedMessage`, stored on the row like any other:

```ts
{ order_ref: String(orderId), intent, eta_iso, notes: '<script label>', confidence: 1 }
```

with `review_status = 'auto_applied'`. It reuses `INTENT_EVENT` and `applyParsed()` verbatim, so the
DTMF path and the SMS path converge on the exact same mapping table — there is no second
intent→event map to keep in sync.

Two behaviors worth pinning down because the code makes them non-obvious:

- **`pickup_confirm` press 1 sends `eta_iso: null` deliberately.** The pickup watchdog anchors the
  overdue clock to the `pickup_triggered` event, but honors an `eta_set` that lands *after* the
  trigger — so writing an ETA on a pickup confirmation would silently restart the 24h overdue
  clock, and a vendor could stay "not overdue" forever by pressing 1 once a day. Leaving `eta_at`
  untouched keeps the clock honest. (The old order-creation-time quirk here was fixed —
  `pickupAnchor()` in `server/watchdog.ts`.)
- **`eta_check` press 1 sets `eta_at = target_at`,** i.e. "on schedule" means "I'm committing to the
  deadline." `applyParsed()` rewrites `eta_update` → `accept` when state is `ordered`, but the ETA
  moment never fires in `ordered`, so the rewrite can't bite here.

### 4.3 Press-2 / press-3 free text — existing endpoint, two optional fields

The spoken-date branch reuses `POST /api/messages/inbound` with no new route. Typed text in the
simulator is the "transcript."

```
Request: { vendor_id, body, channel?: 'sms' | 'voice', order_id?: number }
```

`handleInbound(vendorId, body, opts?: { channel?: MessageChannel; order_id?: number })`:

- `channel` flows into the INSERT (defaults `'sms'`, so all existing callers are unaffected).
- `order_id` is used **only as a fallback** when the parse returns `order_ref: null` — it supplies
  the order the call was about, which the transcript ("Friday morning") usually won't name.

**The confidence gate is untouched.** `parsed.confidence >= CONFIDENCE_THRESHOLD` still has to hold
for auto-apply; supplying the order context does not lower the bar, it only removes an
order-matching failure that has nothing to do with whether we understood the vendor. A vague
transcript still lands in the review queue, which is exactly the demo beat we want.

Ledger note: the press-2/3 keypress row itself gets `review_status = 'auto_applied'` with
`parsed = null`. Nothing about "the vendor pressed 2" needs human review — the *content* they then
speak is the reviewable artifact, and it goes through the gate as its own message.

---

## 5 · Where scheduling lives

`server/watchdog.ts`, inside the existing `tick(now)` loop — it is the only clock, it already
iterates every order, and it already owns the other time-based behavior (risk recompute, pickup
overdue). One new block per order:

```ts
// placement
const moment = resolveMoment(order)
if (moment && callDue(order, moment, now) && !calledSinceLastEvent(order.id)) {
  placeCall(order, moment)
}

// no answer
for (const call of unansweredCalls(order.id, now, CALL_NO_ANSWER_MINUTES)) {
  escalate(order.id, `No answer on the automated check-in call for order #${order.id} — vendor has not responded by phone or text`)
}
```

`escalate()` already no-ops when an open escalation exists on the order, so the no-answer rule can't
spam. `tick()` is wrapped in try/catch by `startWatchdog()`, so a bad call placement can't kill the
loop.

**SSE:** nothing new. `sendToVendor()` broadcasts `{ type: 'message', message_id, vendor_id,
direction: 'out' }`; `useLive()` refetches `/api/messages?vendor_id=` on any event; the client sees
a `channel: 'voice'` outbound row appear and rings. Because the ring is *derived from persisted
rows* rather than from a transient event, refreshing the page mid-call keeps the phone ringing —
which is the behavior you want on a demo machine.

*(Optional refinement, only if you want a one-shot sound effect that must not replay on refresh: add
`channel` to the existing `message` variant of `ServerEvent`. Mind the `DistributiveOmit` gotcha in
`server/sse.ts`. Not needed for anything in this spec.)*

---

## 6 · Client

All of it in `client/src/pages/Vendor.tsx`, alongside the existing local `PhoneSimulator`.

### Ring derivation

`PhoneSimulator` already receives `messages: Message[]`. Add:

```ts
const activeCall = useMemo(() => {
  const last = messages[messages.length - 1]
  return last?.channel === 'voice' && last.direction === 'out' ? last : null
}, [messages])
```

The last message being an unanswered outbound voice row *is* the ringing state — any keypress or
transcript appends a later row and clears it. No timers, no local call state to desync.

### `<CallPanel>` — new local component in the same file

Renders above the message thread when `activeCall` is set, inside the existing `Card`, using
`Button` / `Badge` from `../components/ui`:

- **Ringing:** `📞 Incoming call — JobNimbus Hospice` with an **Answer** and a **Decline** button.
- **Answered:** the script text in a bubble, plus a 1 / 2 / 3 keypad (`Button` with
  `className="h-12 w-12 text-lg"`, in a `grid grid-cols-3 gap-2`), each labeled with its meaning
  from the script.
- **Press 2 / 3:** keypad swaps for the prompt line ("Say the new date and time after the tone") and
  a text input that posts to `/api/messages/inbound` with `channel: 'voice'` and the order id — i.e.
  the existing free-text form, relabeled.

### speechSynthesis

```ts
const utterance = new SpeechSynthesisUtterance(activeCall.body)
utterance.rate = 0.95
window.speechSynthesis.speak(utterance)
```

- **Speak on Answer, not on ring.** Chrome blocks speech synthesis until the page has had a user
  gesture; the Answer button *is* that gesture. This also matches how a real call works and keeps
  the demo from silently failing on a fresh tab.
- `window.speechSynthesis.cancel()` on keypress, on decline, and in the effect cleanup — otherwise
  the script keeps talking over the presenter after they've pressed 1.
- Guard with `'speechSynthesis' in window`; the panel must stay fully usable with the audio dead,
  because venue laptops are venue laptops. The script is on screen either way.

### Thread rendering

Give `channel === 'voice'` bubbles a distinguishing treatment in the existing message map —
a `📞` prefix and `bg-slate-800 text-white` for outbound voice vs the current `bg-slate-100` for
SMS. The existing parse footer (`→ {intent} · {confidence}% · {review_status}`) already renders for
inbound rows and will show `→ accept · 100% · auto_applied` for a keypress with no changes.

Per repo convention, **no UI tests.**

---

## 7 · Silence handling

An unanswered call is the same signal as an unanswered text, and it reuses the same machinery.

An outbound `voice` message with no message on that order carrying a greater `id`, older than
`CALL_NO_ANSWER_MINUTES` (default 10; set to 1 for the demo), produces:

```
No answer on the automated check-in call for order #1060 — vendor has not responded by phone or text
```

That string follows the escalation-reason style already in the codebase — sentence case with an em
dash — matching `Pickup not completed after 26h — family is still waiting` in `watchdog.ts` and
`Vendor declined order #1042: …` in `messaging.ts`. Note that this is deliberately *not* the
lowercase, fragment style used for **risk** reasons in `risk.ts` (`vendor has not accepted and
deadline is in 16.0h`, `vendor is 72% on-time for hospital beds on this weekday (n=25)`), because
this is an escalation, not a risk factor.

Risk itself is untouched: an order that is `ordered` near its deadline is already scoring +25 with
the `vendor has not accepted and deadline is in ${h}h` reason, and the watchdog already escalates on
threshold crossings. A vendor ignoring the call escalates *twice as fast* through the existing
mechanism — no new scoring rule required.

**Stretch (not in v1):** extend `computeRisk(order, stats, now, unansweredCalls = 0)` with a +20
band and the reason `vendor did not answer ${n} automated check-in calls`. This breaks the pure
`(order, stats, now)` signature and requires touching `tests/risk.test.ts`, so it's out of scope for
a hackathon build.

---

## 8 · Demo beat

**A fourth beat appended to scenario 3, not a fourth scenario.** Scenario 3 is already the
cold-start-vendor closer, and channel-agnostic rung 1 is the same argument told a second way. A
standalone fourth scenario would cost ~60 seconds of a five-minute pitch to make a point the
audience just heard.

Runs ~35 seconds, after the "cant do it this week, truck's down" decline beat:

> "That vendor texts. This one doesn't — Priya's shop answers the phone and that's it. Watch what
> her onboarding looks like."

1. Click **Place call** on order #1062 (or let the watchdog do it and narrate the wait). The vendor
   phone rings; hit **Answer** and let the laptop read the script aloud. *This is a browser speaking
   — in production it's Twilio, and the vendor's actual phone rings.*
2. Press **1**. Hospice board flips `ordered → dispatched` live. Point at the ledger entry:
   **confidence 100%, auto-applied, actor `vendor`** — *no model ran. A keypress means one thing;
   we don't need Claude to read a 1.*
3. One line to close the ladder: *text back or press 1 — the hospice board can't tell the
   difference, and neither can the state machine.*

### Seed changes — `scripts/seed.ts`

Scenario 3 currently seeds 1060 (`dispatched`, target +20h, vendor 1) and 1061 (`dispatched`, +44h,
vendor 1). Add one order so the acceptance moment is available on cue without disturbing the
existing beats:

```ts
seedOrder(1062, 5, 3, 0, 'ordered', 8, null)   // Ruth Nakamura · Canyon Home Medical · bed · 8h out
```

Vendor 3 (Canyon Home Medical, Priya) is a different vendor from the SMS beats, so switching the
simulator's vendor dropdown is itself the "different vendor, different channel" visual. `target_at`
at +8h keeps it `urgent` per `seedOrder`'s own rule (`< 24` → urgent) and puts it comfortably inside
the risk engine's interesting range.

Order 1060 stays `dispatched` and doubles as the `eta_check` fallback if you want to show the
press-2 → spoken-date → review-queue path as an encore.

If you take the optional `Vendor['channel'] = 'voice'` change from §3, also flip vendor 3's channel
in the seed insert. Everything else in the seed is unchanged.

---

## 9 · Test plan

New file `tests/calls.test.ts`, following the `beforeEach(seedFixtures)` + `seedOrder()` pattern from
`tests/statemachine.test.ts` and `tests/messaging.test.ts`. **UI stays test-free** per repo
convention; routes remain untested, as they are today.

**Moment resolution** (pure, cheap, catches the state-table drift that would break everything else)
- `ordered` → `acceptance_check`; `dispatched` and `in_transit` → `eta_check`; `pickup_pending` and
  `pickup_overdue` → `pickup_confirm`; `delivered`, `picked_up`, `cancelled` → `null`.

**Script templates** (mirrors the existing "outbound templates" describe block)
- Contains `#${id}`, the equipment name, and all three digit options.

**Keypress → state machine**
- `acceptance_check` + `1` → state `dispatched`; `order_events` has `vendor_accepted` with actor
  `vendor`; the message row has `channel: 'voice'`, `confidence: 1`,
  `review_status: 'auto_applied'`.
- `acceptance_check` + `2` → one open escalation, state still `ordered`, no new `order_events` row.
- `eta_check` + `1` → `eta_at === target_at`, state unchanged.
- `eta_check` + `2` → `outcome: 'prompt'`, **no** new `order_events` row.
- `pickup_confirm` + `1` → `eta_at` unchanged (the overdue-clock guard from §4.2 — this is the test
  that stops someone "helpfully" setting an ETA there later).
- A digit with no mapping at that moment → `outcome: 'unmapped'`, nothing applied.

**The offline claim** — the whole AI-safety point of the DTMF path
- With `delete process.env.ANTHROPIC_API_KEY` (as `tests/messaging.test.ts` already does in its
  `beforeEach`), a keypress still yields `review_status: 'auto_applied'` at confidence 1, where the
  equivalent SMS yields `needs_review`. Assert both in the same test so the contrast is explicit.

**Watchdog integration** — no separate watchdog test file exists today, so keep these in
`calls.test.ts`, driving `tick(now)` with a shifted `now`
- Call placed when the moment and clock condition hold; **not** placed twice before the next
  `order_events` row.
- No-answer past `CALL_NO_ANSWER_MINUTES` → exactly one open escalation with the §7 reason string.

Existing suites must stay green untouched — the `channel` default and the optional `handleInbound`
options object are both backward-compatible by construction.

---

## 10 · Production path

The simulation is a faithful stand-in for Twilio Programmable Voice; the seams line up almost
one-to-one.

- **Placing the call:** `POST /2010-04-01/Accounts/{sid}/Calls.json` with `To = vendors.phone` (we
  already store it) and a TwiML URL. `placeCall()` becomes the Twilio client call; script rendering
  is unchanged.
- **The script + DTMF:** `<Say>` wrapped in
  `<Gather input="dtmf" numDigits="1" action="/api/calls/keypress" timeout="8">`. Twilio POSTs
  `Digits` and `CallSid` to the same endpoint shape we already built — `handleKeypress()` needs a
  thin adapter to read Twilio's form-encoded body and reply with TwiML instead of JSON. The mapping
  table, `applyParsed()`, and the state machine are untouched.
- **Press-2 spoken date:** `<Record transcribe="true">` or `<Gather input="speech">`. The transcript
  string Twilio returns is exactly what the simulator's text input produces today, so it feeds
  `handleInbound()` with no changes and hits the same 0.8 confidence gate.
- **No answer:** replaces our timer entirely. Twilio's status callback reports `no-answer`, `busy`,
  `failed`, or an `AnsweredBy` of `machine_start` — richer than "nobody pressed anything," and it
  distinguishes voicemail from a real miss. The escalation reason gets more specific; the escalation
  itself is the same call.
- **Channel routing:** Twilio Lookup classifies each rolodex number (landline vs mobile) so the
  system texts the textable and calls the rest — same pipeline either side of the fork. This is what
  makes rung 1 genuinely channel-agnostic rather than SMS-with-a-fallback.
- **Also required in production, absent here:** webhook signature validation
  (`X-Twilio-Signature`), a real caller ID the vendor recognizes, retry/voicemail-drop policy, and a
  check on automated-call consent rules for business-to-business calling.
- **HIPAA:** Twilio is HIPAA-eligible and signs BAAs covering Programmable Voice/SMS. Combined with
  the minimum-necessary payload rule in §2 (no names or street addresses on the open channel; full
  detail behind the authenticated link), the compliance story is a designed-in constraint, not an
  open question.

**Cost — approximate, verify before quoting on a slide.** Twilio's published US outbound voice rate
is on the order of $0.013–0.015/minute, which puts a 30-second IVR check-in at roughly **1–2 cents**.
Speech transcription is billed separately and is the expensive part (a few cents per minute), but it
only runs on the press-2 branch. Even calling every order twice, this is far below the labor cost of
the phone call a coordinator makes today. *These figures are from memory and Twilio changes pricing
— pull the current rates from their pricing page before this goes in a deliverable.*

---

## 11 · Effort and cut order

Whole feature targets **2–4 hours** inside the 24h event. Roughly 3.5 person-hours, ~1.5h wall clock
with the three lanes running in parallel.

| Lane | Work | Est. |
|---|---|---|
| **Backend** | `shared/types.ts` additions · `channel` column · `server/calls.ts` (moment, scripts, keypress table, `placeCall`, `handleKeypress`) · two routes · `sendToVendor`/`handleInbound` optional params · watchdog block | ~1h30 |
| **Data/tests** | `tests/calls.test.ts` · seed order 1062 · `.env` demo values for the wait/no-answer minutes · verify `db:reset` flow | ~45m |
| **Frontend** | `CallPanel` in `Vendor.tsx` · ring derivation · keypad · speechSynthesis + cancel · free-text branch · voice bubble styling | ~1h15 |

**Sequencing:** backend ships `shared/types.ts` and the two route shapes in the first 20 minutes so
frontend can build against them with a hand-inserted voice message row. Data lane writes tests
against `calls.ts` as it lands.

**Cut in this order if time collapses:**

1. The optional `Vendor['channel'] = 'voice'` badge — pure garnish.
2. Watchdog auto-placement. Keep only `POST /api/calls/place` behind a button; the presenter clicks
   it, and "in production the watchdog places this on a schedule" is one narrated sentence.
3. Press 3 (leave a message). Keep 1 and 2 — 3 duplicates a path the SMS demo already showed.
4. The no-answer escalation. The existing risk engine already escalates an unaccepted order near its
   deadline, so the silence story survives without it.
5. The press-2 spoken-date branch. Loses the "voice transcript hits the same gate" beat, which is a
   real loss — cut this only if you're down to minutes.

**What must survive all cuts:** place a call → the laptop speaks the script → press 1 → the hospice
board moves, at confidence 1.0, with no model call. That single loop is the entire argument, and
it's about 90 minutes of work on its own.
