# Trip Batching (Tier 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. One fresh
> worktree agent per task, orchestrated from the main session; steps use checkbox syntax.
> Authority: `docs/SMS-BATCHING-SPEC.md` **as amended by Daymon** (`46462e4`, merged to main in
> wave 0) — the amendment supersedes the original §4 (do NOT build the count-gate) and reframes
> tier 3. TDD per superpowers:test-driven-development for all server work; UI stays test-free.

**Goal:** One text per trip. Ruth dies with two items in the house → the vendor gets ONE message
("2 items from one home … reply 5 if you can get both today"), one reply pair, and a digit that
fans out to per-order events — commitments cascade down the trip, evidence never does.

**Architecture:** Outbound-only batching on top of the shipped rotating reply pairs. A group
message is a normal `sendVendorQuestion()` question that owns one pair and anchors to its first
order; a `message_orders` join table carries the full manifest; the affirmative route fans out
per order with `payload.source: 'group reply'`. No coalescing window: a tier-2 group IS one
`setPatientStatus()` call. No new digest: exhaustion (`maybeSendBacklogDigest`) subsumes tier 3.

**Tech stack:** existing only — Express 5 + better-sqlite3, vitest, React 19 client. No new deps.

## Global constraints (every task inherits)

- Gates: `npm test` (213 at baseline) · `npm run typecheck` · `npm run build`. Never leave red.
- Worktrees branch from ORIGIN: **every agent's step 0 is `git merge main`** (the LOCAL branch).
- NO pushes. Commits imperative, no AI attribution. Comment budget ~0.
- PHI: group bodies name counts/items/areas, never patients (spec §7.4).
- Evidence invariants (spec §7): group replies cap at vendor-reported; PODs/`family_confirmed`
  never cascade; per-order events, clocks, escalations untouched.
- Pair discipline (spec §7.6): a group consumes exactly ONE pair.
- Verify-first: teammates push constantly; re-check each claim against the merged tree.

## Recorded decisions (do not re-litigate in-task)

1. **§10.4 resolved: no burst trigger, no `v_pickup_digest`.** Tier 2 makes the five pairs count
   *stops*; the shipped exhaustion digest already fires when a burst outruns the pairs (each
   failed `sendVendorQuestion` attempts it, rate-limited 4h). Exhaustion subsumes burst. Wave 0
   records this in the spec.
2. **Group link = the vendor portal link** (`magicLink`/`portalLink(vendorId)`), not a per-order
   `/o/` link — an `/o/` page shows one order; a trip is several.
3. **Group anchor**: the message row keeps `order_id` = first order in the group (existing
   single-order code paths degrade safely); `message_orders` carries every id, and fan-out reads
   the join table with fallback `[order_id]`.
4. **Partial-failure rule**: the group affirmative applies per order; an order whose state can't
   accept `pickup_scheduled` is skipped (recorded in the result), never aborts the rest.
5. **Driver stop view (spec §6): NOT in this plan** — Angel ruled spec-only on 08-14 and this
   plan builds the messaging layer. Revisit only on an explicit new decision.
6. **§10.1 (group nag)**: moot for pickups — the ack-nag ladder targets `ordered` state; pickup
   accountability is the per-order `pickup_overdue` clock, which is untouched. Note it, build
   nothing.

---

## Wave 0 — Foundation contract (main session, inline, ~10 min)

- [ ] **0.1** Merge `origin/spec/sms-batching` into local main (brings Daymon's amendment).
- [ ] **0.2** Append the §10.4 resolution + decisions 2–6 to `docs/SMS-BATCHING-SPEC.md` §10.
- [ ] **0.3** Contract commit, exact definitions all tasks share:
  - `shared/types.ts`: `'v_pickup_group'` added to `VendorTemplate` (line ~150);
    `SmsReplyResult` gains optional `group_order_ids?: number[]`.
  - `server/db.ts`: after the messages table —
    ```sql
    CREATE TABLE IF NOT EXISTS message_orders (
      message_id INTEGER NOT NULL REFERENCES messages(id),
      order_id   INTEGER NOT NULL REFERENCES orders(id),
      PRIMARY KEY (message_id, order_id)
    )
    ```
  - Gates green (nothing consumes these yet; typecheck must pass).

## Wave 1 — Build (TWO PARALLEL agents, disjoint files)

### Task 1A: Server tier-2 — agent `batch-server` (opus, worktree)
**Files:** `server/messaging.ts`, `server/pickups.ts`, `server/sms.ts`, `tests/sms.test.ts`,
`tests/pickups.test.ts` (or the existing home of `setPatientStatus` tests).
**Interfaces produced (wave 2 relies on these exactly):**
- `pickupGroupText(orders: Order[], patientArea: string | undefined, [yes, no]: SlotDigits): string`
  — body shape: `Pickup needed — 2 items from one home (hospital bed, oxygen concentrator), area
  Ogden. Family is present — please schedule promptly. Reply 5 if you can get both today, 6 to
  give us a window: <portal link>` (item names via the shortened equipment convention; count and
  "both/all N" agree with manifest size).
- `sendVendorQuestion(vendorId, anchorOrderId, 'v_pickup_group', render)` + a
  `message_orders` insert for every order id in the group (same transaction as the message row).
- `VENDOR_ROUTES.v_pickup_group: [affirmative, problem]` — affirmative applies
  `pickup_scheduled` (eta **null**, spec §5 anti-gaming) to EVERY order in `message_orders`,
  each with `payload.source: 'group reply'`; sends `f_pickup_notice` ONCE per household;
  `SmsReplyResult.group_order_ids` lists the applied ids. Problem position: prompt
  `"When can you collect them? Text back a day and time."`
- `setPatientStatus()`: group the triggered orders **per vendor**; size 1 → existing single
  path unchanged; size >1 → one group question per vendor.
**TDD steps (write each test first, watch it fail, implement, watch it pass, commit):**
- [ ] group send: two delivered orders, one patient, one vendor → exactly ONE outbound message,
      template `v_pickup_group`, body names both items + "2 items from one home", ONE pair
      consumed (`liveQuestions().length === 1`), `message_orders` has both ids.
- [ ] two vendors: one order each → two singles, no group.
- [ ] affirmative fan-out: digit at the group's affirmative → BOTH orders get
      `pickup_scheduled` events with `payload.source: 'group reply'`, eta stays null on both,
      `f_pickup_notice` inserted once, slot closed once.
- [ ] partial failure: one group order already `picked_up` → the other still applies; result
      records the skip; no throw.
- [ ] evidence cap: after a group affirmative, `delivery_verified`/`pickup_verified` unchanged.
- [ ] exhaustion under groups: 6 stops queued → 5 questions + digest fires (existing
      `v_backlog_digest`, no new template) — pins the §10.4 resolution.
- [ ] problem position → prompt recorded, nothing applied.
**Gates**, commit(s) on the worktree branch.

### Task 1B: Client rendering — agent `batch-client` (opus, worktree)
**Files:** `client/src/components/QuickReplies.tsx`, `client/src/pages/VendorPhone.tsx` (only if
receipt copy needs the group count), `client/src/components/board/RowDetail.tsx` /
`client/src/lib/domain.ts` (ledger label). **Stay out of every 1A file.**
**Consumes (from wave 0 + 1A's interface block above):** template literal `'v_pickup_group'`,
`SmsReplyResult.group_order_ids`.
- [ ] Vendor phone thread renders the group question like any question (body already carries its
      digits); the digit-label helper maps `v_pickup_group` to labels in the register of
      `Yes — the whole stop` / `Give us a window` (check how `digitLabel`/answer labels key off
      template and follow that mechanism).
- [ ] Reply receipt for a group shows the scope: "applied to 2 orders · no model needed" when
      `group_order_ids.length > 1` (graceful when absent).
- [ ] Order timeline: `payload.source: 'group reply'` renders as "group reply · no model"
      alongside the existing source labels.
- [ ] Verify by SSR probe or CDP against an isolated stack; UI stays test-free.
**Gates**, commit on the worktree branch.

- [ ] **1.1** Fire 1A + 1B in parallel.
- [ ] **1.2** Merge 1A → gates → merge 1B → gates.

## Wave 2 — Verify + sync (TWO PARALLEL agents after 1.2)

### Task 2A: Docs & pitch sync — agent `batch-docs`
**Files (docs only):** `docs/SMS-BATCHING-SPEC.md` (mark tier 2 BUILT with file:line receipts),
`docs/SMS-SIM-SPEC.md` (template + route rows), `docs/FEATURES.md` (move trip batching §3 → §1;
re-run the verify block, correct counts), `docs/deliverables/DEMO-SCRIPT.md` scenario 2 ("two
pickup texts land" → ONE group text; quote the real body), `docs/PITCH-draft-0.md` (scenario-2
line + "one death, one text, one trip"), `docs/deliverables/SLIDES.md` show-off inbox line.
Derive every claim from the merged tree, not this plan.

### Task 2B: E2E spot re-verify — agent `batch-e2e`
Isolated stack (never :3001/:5173), no source edits. Walk: scenario 2 nurse tap → ONE vendor
text for Ruth's two items → group digit affirmative → both board rows move, evidence stays
vendor-reported → driver PODs each item individually → per-item Verified. Also: single-pickup
patient still gets the single template; digest fires past five stops; narration/board unaffected
(one toast per order event is expected — note what it actually does). Punch list or clean bill
appended to `docs/E2E-WALKTHROUGH.md`.

- [ ] **2.1** Fire 2A + 2B in parallel; merge both; final gates; reseed; report to Angel.

## Cut order if time collapses

1. Wave 2B shrinks to a manual scenario-2 walk by Angel at rehearsal.
2. Client receipt count (1B second checkbox) — the receipt still says "applied".
3. Never cut: the 1A invariants tests, the honest DEMO-SCRIPT update (a script narrating two
   texts while the phone shows one is a stage failure).
