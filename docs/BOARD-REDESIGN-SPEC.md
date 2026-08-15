# Hospice Board Redesign — build brief (v8, locked 2026-08-14)

Rebuild `/hospice` per the locked mockups in `.superpowers/brainstorm/*/content/full-board-v8.html`
(desktop) and `board-mobile.html` (phone). Design register: **elementary-simple, adult palette** —
one idea per row, no sentences to read on the surface, no metadata above the fold. Everything
stripped from the surface lives one tap in.

## Page structure — three sections, one flat list each

1. **Needs you · N** — orders with an open escalation OR risk_score ≥ RISK_THRESHOLD.
   Sorted most-blown first: overdue (largest elapsed) → soonest deadline.
2. **On the way · N** — every other live order (`ordered`, `dispatched`, `in_transit`,
   `pickup_pending` not overdue). Sorted soonest deadline first. Orders due beyond 6 days collapse
   into one row: "N more, nothing due before {weekday} — show ▾".
   **Patient grouping:** when one patient has >1 live order, they get ONE row — Item slot reads
   "3 items", pill reads "2 of 3 moving"; tap expands to per-item lines.
3. **Done · N this week** — one summary row: "Every delivery had a photo and a signature." +
   green pill "✓ N of M" (M = completions this week, N = with POD). "history ▸" expands a dense
   ledger (one line each: #id · item · patient · ✓ Verified chip · timestamp). No urgency, no dates
   beyond the timestamp, no other adornment.

Gone from this page entirely: the 5 kanban columns, the stat counters (203/203/106 — reports
territory), the always-open EMR simulator (moves to `/demo`, see below), the coral hero panel,
all URGENT chips. Review queue: when empty, one footer whisper line ("Review queue is empty");
when non-empty, it appears as a card at the END of "Needs you": "N vendor replies need review —
open ▸" linking to the existing queue UI.

## Row anatomy — the five-slot grid (desktop ≥640px)

`grid-template-columns: 1.2fr .9fr 1.1fr 1fr 160px`, gap 16px, on a white rounded-14 card:

| Slot | Content | Rules |
|---|---|---|
| **Who** | Patient full name | font-weight 750, the only bold on the row |
| **Action** | `Delivery` or `Pickup` | plain ink |
| **Item** | Equipment plain name, or "N items" for groups | muted ink `#5C6B75` |
| **When** | See date rules | **regular weight always**; ink `#CB3E3A` when overdue/at-risk, `#93A0AA` otherwise. Never bold. |
| **Pill** | 160px, one shape | see pill grammar |

Faint uppercase column headers (`WHO · ACTION · ITEM · WHEN`) appear once above the first section
only. First-section cards get slightly larger type (15px vs 14.5px) and shadow — no other
distinction; NO red borders/rails (the section + pill carry urgency).

## Pill grammar (the only status vocabulary on the page)

Same shape always: border-radius 10, 160px wide desktop / full-width bottom-of-card mobile,
centered, font-weight 700.

- **Filled coral `#E27B5E` = tap me** (an action exists): `Swap vendor`, `Call the vendor`,
  `+ New order` (header — links to `/order`).
- **Green tint `#E6F4EC`/`#3E9C6B` = good**: `Confirmed ✓`, `Accepted ✓`, `On the truck`,
  `2 of 3 moving`, `✓ 36 of 36`.
- **Grey tint `#EEF1F3`/`#5C6B75` = waiting**: `Waiting on vendor`.

State→pill mapping: `ordered` → grey "Waiting on vendor" · `dispatched` → green "Accepted ✓" ·
`in_transit` → green "On the truck" · `pickup_pending` with vendor confirmation (eta/pickup_scheduled
event) → green "Confirmed ✓", without → grey "Waiting on vendor". Crisis rows replace the status
pill with the action button: delivery-phase crisis → **Swap vendor** (opens the dialog below);
pickup crisis → **Call the vendor** (opens the detail view with the vendor's phone prominent and a
"Send another nudge" action → existing nag/sendTemplate machinery if wired, else the detail alone).

## Date rules (one format everywhere)

- Future: **day only** — `Today` · `Tomorrow` · `Friday` (weekday word within 6 days) · `Aug 22`
  beyond. No clock times on the board (amended post-build); exact times live in the row's
  tap-open detail.
- Overdue: elapsed, not date: `3 days overdue` / `5h overdue`.
- Pickup rows show elapsed-in-home when overdue; promised time otherwise.

## Details-on-tap (where the stripped metadata went)

Tapping any row expands (inline expansion or dialog — implementer's choice, match repo patterns)
to show: vendor name, need-by vs promised (side by side, red only if promise misses need),
last-heard-from + nudge history ("asked 1h ago · nudge at 2h" — from messages), risk reasons in
sentences, evidence chips (✓ Verified / Vendor-reported), POD thumbnails when present, and the
event timeline. Reuse the existing expanded OrderCard content where it fits; restyle to match.

## Swap-vendor dialog (scenario 1's centerpiece)

v8 language: a simple dialog listing the OTHER vendors as big uniform cards — vendor name + ONE
plain line of decision support from `vendor_stats`: "91% on-time for hospital beds on {weekday}"
(fall back to overall rate; the cold-start vendor shows "New — no history yet"). One tap → existing
`POST /orders/:id/swap-vendor` → dialog closes, row leaves "Needs you" via SSE refetch. No
free-text, no second confirm.

## Mobile (<640px)

Each row restacks: Who (top-left, bold) + When (top-right, same ink rules) / "Action · Item" grey
line / pill full-width at bottom. Nothing else changes. One component, one breakpoint.

## `/demo` page (separate task)

New route `/demo` ("Demo controls", kept OUT of the main nav or visually de-emphasized): the EMR
simulator (patient list, Discharge/Deceased buttons → existing `POST /api/emr/patient-status`)
plus any presenter conveniences already scattered (e.g. templated-send escape hatch if trivial).
The board loses the simulator entirely.

## Constraints

- shadcn/ui hand-authored primitives + existing atoms only; NO `shadcn init/add`; no legacy
  `ui.tsx` imports in new code (migrate what's touched).
- Design tokens per `docs/DESIGN-SYSTEM.md` (coral/navy/green/greys as used in the mockups).
- Plain-English only on screen; `useLive()` SSE refetch as everywhere else; UI stays test-free;
  `npm test` + `npm run typecheck` + `npm run build` green; scenario1/2/3 seeds must all render
  correctly (verify by running).
- Red ink appears ONLY in: the "Needs you · N" count and When-slot values that are overdue/at-risk.
  Nothing else on the page is red. Coral is not red — buttons/brand only.
