# UX / UI audit — pre-production polish pass

**Date:** 2026-08-14 · **Scope:** every file under `client/src/` (pages, components, components/ui,
components/board, hooks, lib) plus `client/index.html` and `client/src/index.css`.
**Method:** code-level read (no browser tooling available). Every finding was grepped, then the hit
was read in context; where a claim depends on runtime data the shape was checked against
`shared/types.ts` and `server/`. `npm run build` was run on this worktree and passes clean
(typecheck + vite build, 1951 modules, exit 0) — so this audit is of what actually ships.
**Baseline:** `abfb54c`, identical to `origin/main` (0 ahead / 0 behind).

**Benchmarks used:** `docs/PROBLEM-THESIS.md` north stars ("your mom's least technical friend",
plain words everywhere, one obvious next action, big touch targets) and `docs/DESIGN-SYSTEM.md`
(tokens, spacing, type, ≥44px targets, plain-English status vocabulary).

**Severity key**
- **P0** — a judge will hit it inside five minutes of driving the demo.
- **P1** — a production reviewer blocks the PR on it.
- **P2** — polish; do it if there's time.

**Effort key** — XS ≈ under 15 min · S ≈ under an hour · M ≈ half a day.

---

## P0 — will embarrass us in the demo

### ~~P0-1 · The board says "Nothing needs a person right now" before the data lands~~
**FIXED (wave 1A, 2026-08-15):** board is now skeleton-gated until all queries resolve, before any empty-state copy renders.

`client/src/pages/Hospice.tsx:14-18, 48-52, 69-73` · root cause `client/src/lib/useLive.ts:9`

All five queries start at `data === null`, and the page coalesces every one of them to `[]`
(`orders ?? []`, `escalations ?? []`, `queue = reviewQueue ?? []`). `buildBoard([], [], …)` returns
empty sections, so the very first paint renders the two reassurance lines — *"Nothing needs a person
right now."* and *"Nothing in motion."* — plus *"Review queue is empty"* (`Hospice.tsx:124-126`),
before flipping to the real rows.

**What a user experiences:** every hard refresh flashes an all-clear board and then repopulates with
a red at-risk row. The demo script's standing rule is *hard-refresh after every seed*
(`docs/E2E-WALKTHROUGH.md` punch #4), so this is on screen at the start of every scenario. It reads
as a bug on the one screen the judging weight sits on.

**Fix sketch:** treat `null` as loading — render a 3-row `Skeleton` block (the primitive already
exists, `components/ui/skeleton.tsx`) until `orders && patients && escalations` are all non-null;
only then allow the empty copy. **Effort: S**

### ~~P0-2 · Any failed fetch leaves the same all-clear board up forever, with no error anywhere~~
**FIXED (wave 1A, 2026-08-15):** `useLive` now exposes a `failed` flag; the board shows a "Can't reach the server" alert.

`client/src/lib/useLive.ts:17, 21` — `.catch(console.error)`

`useLive` swallows every error into the console and leaves `data` at `null`. Nine surfaces use it
(`Hospice`, `Vendor`, `Driver`, `Reports`, `Caregiver`, `VendorPhone`, `Demo`, `RowDetail`,
`SwapVendorDialog`). Combined with P0-1, a dead or restarting server produces a board that
confidently states nothing needs attention.

**What a user experiences:** server hiccup mid-demo = a silently wrong screen, not an error. Nobody
on stage can tell the difference between "all clear" and "the API is down".

**Fix sketch:** return `{data, error, loading}` from `useLive`, and render one shared inline error
strip ("Couldn't reach the server — retrying") on the pages that consume it. Minimum viable version:
add an `error` flag and let `Hospice`/`Reports` show it. **Effort: M** (S if only `Hospice` is
wired).

### ~~P0-3 · The escalation sentence is fetched and never rendered~~
**FIXED (wave 1A, 2026-08-15):** escalation reason now rendered in RowDetail, deduped against risk-reason duplicates.

`client/src/components/board/RowDetail.tsx:15, 37` (declared in `OrderDetail.escalations`, consumed
nowhere in the file)

`GET /api/orders/:id` returns `escalations: Escalation[]` with a `reason: string`
(`shared/types.ts`). `RowDetail` types it, fetches it, and renders `risk_reasons` instead
(`RowDetail.tsx:90-96`). The watchdog's best line — *"No response to the automated check-in — order
#1061 is still unconfirmed 5h after placement"* — exists only in the API.

**What a user experiences:** scenario 3's climax has to be narrated instead of read. The row moves
into **Needs you** for a reason the screen never states. Known-open item (DEMO-SCRIPT FE punch #9,
`docs/deliverables/DEMO-SCRIPT.md:531`); confirmed still open.

**Fix sketch:** in `RowDetail`, above the risk-reason list, render
`detail.escalations.filter(e => e.status === 'open').map(e => <p className="text-destructive">{e.reason}</p>)`.
**Effort: XS**

### ~~P0-4 · The calls-avoided breakdown doesn't add up to the calls-avoided number~~
**FIXED (wave 1C, 2026-08-15):** breakdown now prints `household_confirmations` and sums to the hero.

`client/src/pages/Reports.tsx:157-159`

`server/reports.ts:96` computes `calls_avoided` as the sum of **all four** breakdown fields. The hero
prints only three of them: `auto_applied_messages`, `vendor_self_service_updates`,
`auto_triggered_pickups`. `household_confirmations` is computed, typed
(`shared/types.ts` `ReportSummary.calls_avoided_breakdown`), and dropped on the floor.

**What a user experiences:** in the last measured run (`docs/E2E-WALKTHROUGH.md`) the hero read
**209** over a breakdown reading 2 · 205 · 0 = **207**. A judge who adds the three numbers under a
5xl coral hero finds a two-count hole in the one number the leadership beat is built on — on a page
that otherwise goes out of its way to label its provenance. Known-open item (DEMO-SCRIPT punch #8
aside).

**Fix sketch:** append `· {summary.calls_avoided_breakdown.household_confirmations} household
confirmations` to the same line. **Effort: XS**

### ~~P0-5 · Clicking the "URGENCY" caption silently marks the order STAT~~
**FIXED (wave 1B, 2026-08-15):** `Field` labels are now `htmlFor`-based; the URGENCY caption click is inert.

`client/src/pages/Order.tsx:214-236` with `client/src/pages/Order.tsx:311-316`

`Field` without an `htmlFor` wraps its caption, children **and** helper note in a single
`<label className="block">`. For the Urgency field the children are three `<button>`s. `button` is a
*labelable* element, so the label's implicit control is the first descendant button — **STAT**.
Clicking the word "URGENCY", or anywhere on the long helper sentence under it (`note` is inside the
label too, `Order.tsx:299`), fires a click on the STAT button: `chooseUrgency('stat')` runs, and the
"Needed by" field is silently rewritten to now + 4 hours.

**What a user experiences:** the least-technical-friend user taps near a caption and the order
becomes a 4-hour STAT with a new deadline, with no dialog and no undo. This is a state change from a
click on static text.

**Fix sketch:** in `Field`, render the caption/note in a `<div>` (not `<label>`) whenever the child
isn't a single labelable control — or simply give the Urgency field a `role="group"` +
`aria-label="Urgency"` `<div>` instead of a `<label>`. **Effort: XS**

### ~~P0-6 · "Start delivery" can be double-fired and fails silently~~
**FIXED (wave 1B, 2026-08-15):** pending/disabled state plus an error toast added.

`client/src/pages/Driver.tsx:151-158`

```tsx
onClick={() => api.post(`/api/orders/${job.id}/events`, { type: 'out_for_delivery', actor: 'driver' })}
```
No `await`, no `.catch`, no pending flag, no `disabled`. The second tap hits `applyEvent` on an order
already in `in_transit` → `TransitionError` 409 → an unhandled promise rejection in the console and
nothing on screen.

**What a user experiences:** a presenter who taps twice (normal on a laggy laptop mid-demo) gets
zero feedback either time; the card only changes when the SSE broadcast arrives. If the POST fails,
the button just… doesn't do anything, forever.

**Fix sketch:** hoist a `const [starting, setStarting] = useState(false)`, `disabled={starting}`,
and `.catch(() => toast.error("That didn't go through — tap again."))` — the page already imports
nothing from sonner, so add the import. **Effort: S**

### ~~P0-7 · "Confirm delivery" is disabled with no explanation until you tap "Capture signature"~~
**FIXED (wave 1B, 2026-08-15):** auto-captures on draw-end; Clear emits null; the separate capture button is gone.

`client/src/pages/Driver.tsx:189` + `client/src/components/SignaturePad.tsx:61`

The POD confirm button is `disabled={!signature || submitting}`, and `signature` is only set by the
separate **Capture signature** button inside `SignaturePad`. Drawing on the canvas sets `dirty`, not
`signature`. So a driver who signs and then reaches for "Confirm delivery" finds it greyed out with
no hint, no helper text, and no visual link between the two controls.

**What a user experiences:** the demo stalls on stage during scenario 1 step 5b and scenario 2's
pickup — the exact beats where POD is the point.

**Fix sketch:** either auto-capture on `onPointerUp` (call `onCapture(toDataURL())` there and drop
the button), or add a helper line under the disabled button: *"Draw a signature above, then tap
Capture signature."* **Effort: S**

### ~~P0-8 · Swap vendor: no pending state, dialog closes optimistically, failure is invisible~~
**FIXED (wave 1A, 2026-08-15):** now awaits the post, disables while pending, toasts on success/failure, and closes only on success.

`client/src/components/board/SwapVendorDialog.tsx:32-35`

```tsx
api.post(`/api/orders/${order.id}/swap-vendor`, { vendor_id: card.vendor.id }).catch(console.error)
onOpenChange(false)
```
The dialog closes before the request resolves, the option buttons never disable, and a failure goes
to the console.

**What a user experiences:** scenario 1's climax is "click the coral pill, pick Canyon, watch the
banner clear". If the POST fails or is slow, the dialog closes and the board simply doesn't change —
indistinguishable from "the swap didn't do anything". Also no success confirmation: the only signal
is the SSE-driven repaint.

**Fix sketch:** `await` the post with a per-button `busy` flag, `toast.success('Sent to {vendor} —
they've been texted.')`, `toast.error(...)` on failure, and close only on success.
**Effort: S**

### ~~P0-9 · The Dispatcher's "Portal" nav link is a permanent dead end~~
**FIXED (wave 1C, 2026-08-15):** `/vendor-portal` and `/vendor` links retired from nav (routes remain typed-URL-only); Dispatcher nav now anchors to `/driver`.

`client/src/App.tsx:43, 256` + `client/src/pages/VendorPortal.tsx:152-162`

`surfaceLinks` gives the `dispatcher` role a **Portal** tab pointing at `/vendor-portal`. That route
renders `VendorPortal` with **no `:token` param**, so `useParams()` returns `{}` and the component
short-circuits to the *"Open the link we texted you"* empty state — every time, by construction.

**What a user experiences:** a judge signs in as Dispatcher, clicks the second nav item, and lands on
a screen that tells them to go find a text message. The real portal only works at
`/portal/:token`.

**Fix sketch:** either drop `/vendor-portal` from `surfaceLinks` and the route, or make the
tokenless route redirect to `/portal/${vendorToken(1)}` for the demo. **Effort: XS**

---

## P1 — a prod reviewer blocks on it

### States

**P1-1 · `/reports` shows a skeleton forever if any of its five calls fails**
`client/src/pages/Reports.tsx:56-70, 77, 92-93` — `loadReports()` is a `Promise.all` of five
requests, consumed through `useLive`, so one failure swallows all five and `data` stays `null`
forever, rendering `<ReportsSkeleton/>` in perpetuity. No error branch exists on the page.
*Fix:* surface `useLive`'s error (see P0-2) and render an `EmptyState` with a retry.
**Effort: S**

**P1-2 · `/nurse` flashes "No active patients" on every load**
`client/src/pages/Nurse.tsx:49, 110-114` — `patients` starts `[]`, so `activePatients.length === 0`
is true on first paint and the `EmptyState` renders before the fetch resolves. Same class of bug as
P0-1, on scenario 2's primary trigger screen.
*Fix:* add `const [loaded, setLoaded] = useState(false)`; gate the `EmptyState` on it. **Effort: XS**

**P1-3 · `/caregiver` flashes "No household threads yet…"**
`client/src/pages/Caregiver.tsx:46-48, 75-82` — three `useLive` queries default to `[]`, so
`households` is empty on first paint and the fallback screen (which tells you to go capture a POD)
renders before the data lands.
*Fix:* render nothing (or a spinner) until `messages && patients` are non-null. **Effort: XS**

**P1-4 · `/vendor` (Dispatcher board) has no loading state at all**
`client/src/pages/Vendor.tsx:13-20, 44, 80` — `"No open orders."` and `"No messages yet."` both
paint before data arrives, and both are raw `<div className="text-xs text-slate-400">`, not
`EmptyState`.
*Fix:* gate on non-null and swap to `EmptyState`. **Effort: S**

**P1-5 · `/vendor-phone` can get stuck on "Loading…" permanently**
`client/src/pages/VendorPhone.tsx:75-79` — `vendor` is looked up by hard-coded `vendorId = 1`; if the
vendors fetch fails, or a seed ever renumbers vendors, `vendor` stays `undefined` and the page never
leaves the loading string. There's no error path.
*Fix:* fall back to `vendors?.[0]` and render an error state when the fetch fails. **Effort: S**

### Async / double-submit

**P1-6 · Review queue Apply/Dismiss: no pending state, no error handling, double-submittable**
`client/src/components/board/ReviewQueueDialog.tsx:65-74` — both buttons call `api.post(...)` bare:
no `await`, no `.catch`, no `disabled` while in flight. The row stays in the dialog until the SSE
refetch, which invites a second click and a second POST.
*Fix:* local `busy` state + `disabled` + `.catch(toast.error)`. **Effort: S**

**P1-7 · "Send another nudge" is silently repeatable and silently failable**
`client/src/components/board/RowDetail.tsx:78-84` — `.catch(console.error)`, no disable, no success
toast. A case manager can text a grieving family's vendor five times and see nothing happen either
way.
*Fix:* `busy` flag + `toast.success('Nudge sent.')`. **Effort: S**

**P1-8 · POD submission has no catch**
`client/src/pages/Driver.tsx:99-122` — `try { … } finally { setSubmitting(false) }` with no `catch`.
A failed POD (or a failed follow-up `GET /api/orders/:id`) throws into the void; the button
re-enables and the driver has no idea whether the delivery was recorded.
*Fix:* add `catch { toast.error("Couldn't save that proof — try again.") }`. **Effort: XS**

**P1-9 · Portal actions on `/status/:token` fail silently**
`client/src/pages/VendorStatus.tsx:86-94` — `run()` is `try/finally` with no `catch`. Accept, Set ETA
and Decline all report nothing on failure. (Note: the richer `/portal/:token` page does this
correctly — see the GOOD list.)
*Fix:* mirror `VendorPortal`'s `act()`: toast on both branches. **Effort: XS**

**P1-10 · Both phone simulators swallow send failures**
`client/src/pages/Caregiver.tsx:140-159` and `client/src/pages/VendorPhone.tsx:120-143` — `try` +
`finally`, no `catch`. On a failed POST the draft is not cleared, the send button re-enables, and
nothing explains why the message didn't appear. This is the live-typing beat of scenario 3.
*Fix:* `catch` → render a red "Message not sent — tap send again" line under the composer.
**Effort: S**

### Micro-interaction / a11y

**~~P1-11 · Board rows are clickable `<div>`s with no keyboard access~~**
**FIXED (wave 1A, 2026-08-15):** rows now `role="button" tabIndex={0}`, plus an `aria-live` count region.

`client/src/components/board/BoardRow.tsx:52` and `:113-115` — both carry `cursor-pointer` and
`onClick` but no `role`, no `tabIndex`, no `onKeyDown`, no focus style. The row-expand interaction
(where `risk_reasons` and the whole detail live) is mouse-only, and the same is true of the grouped
sub-rows. `OrderCard.tsx:71-77` has the identical problem on an `<article>`.
*Fix:* `role="button" tabIndex={0} onKeyDown={e => (e.key==='Enter'||e.key===' ') && toggle()}` plus
a `focus-visible:ring-2 focus-visible:ring-ring` class. **Effort: S**

**P1-12 · Nothing on the board is announced — no `aria-live` anywhere in the app**
Grep over `client/src/` returns zero `aria-live` regions. The board is entirely SSE-driven: rows move
into **Needs you**, counts change, the escalation appears — all silently for a screen-reader user,
and with no motion cue for a sighted user who looked away.
*Fix:* wrap the "Needs you" `SectionTitle` + rows in `<div aria-live="polite" aria-atomic="false">`
at `Hospice.tsx:46-55`. **Effort: XS**

**~~P1-13 · `client/index.html` has no favicon~~**
**FIXED (wave 1C, 2026-08-15):** inline SVG coral-pill favicon added, plus theme-color and description meta.

`client/index.html:1-12` — `<title>BetterRX DME</title>` is set (good), but there is no
`<link rel="icon">`. The browser requests `/favicon.ico`, 404s, and the demo tab shows the generic
default globe next to a product that is otherwise carefully branded. There is also no
`<meta name="theme-color">` and no `<meta name="description">`.
*Fix:* inline a coral-pill SVG data-URI favicon in `<head>`. **Effort: XS**

### Content robustness

**~~P1-14 · "1 are still waiting on a photo." — and a claim about zero deliveries~~**
**FIXED (wave 1A, 2026-08-15):** pluralized, plus a zero-completions branch added.

`client/src/pages/Hospice.tsx:91-97` — the sentence is
`` `${completions - withPod} are still waiting on a photo.` `` with no singular form. Separately, when
`completions === 0` the equality branch wins and the board asserts *"Every delivery had a photo and a
signature."* over a `✓ 0 of 0` chip — a proof claim about nothing, on the screen whose entire pitch
is evidence discipline.
*Fix:* pluralize, and add a `completions === 0` branch ("No deliveries closed out this week yet.").
**Effort: XS**

**P1-15 · Raw HCPCS code in the DON's routing recommendation**
`client/src/pages/Reports.tsx:303-309` — *"Beehive runs late on Saturday **E0260** orders (32%
on-time)"*. `docs/DESIGN-SYSTEM.md` and the second north star both forbid codes on screen where a
name exists, and `byCode()` from `@/lib/domain` already maps it.
*Fix:* `byCode(worstCell.hcpcs_code)?.equipment_name ?? worstCell.hcpcs_code`. **Effort: XS**

**P1-16 · Raw intent enum on the vendor phone**
`client/src/pages/VendorPhone.tsx:57-59` — `read as {m.parsed.intent.replace(/_/g, ' ')}` renders
*"read as eta update"*, *"read as out for delivery"*, *"read as unknown"*. `intentLabel()` exists for
exactly this (`lib/domain.ts:95-109`) and is used correctly by `Vendor.tsx:71` and
`ReviewQueueDialog.tsx:45`. This screen is scenario 3's stage.
*Fix:* `intentLabel(m.parsed.intent)`. **Effort: XS**

**P1-17 · "1 deliveries measured"**
`client/src/pages/Reports.tsx:279-281` — no singular form on the scorecard sub-label.
*Fix:* `{n} {n === 1 ? 'delivery' : 'deliveries'} measured`. **Effort: XS**

### Layout / responsive

**~~P1-18 · Long patient names have nothing to stop them from blowing out the board grid~~**
**FIXED (wave 1A, 2026-08-15):** grid template now uses `minmax(0,…)` tracks and the who/item spans truncate.

`client/src/components/board/BoardRow.tsx:15, 54` — `ROW_GRID` is
`sm:grid-cols-[1.2fr_.9fr_1.1fr_1fr_160px]`. At the 640px breakpoint the "Who" column resolves to
roughly 96px of the ~560px inner card width, and the name span has **no `truncate` and no `min-w-0`**
— and `1.2fr` carries an automatic min-content floor. A long name (or a long `plainItem()` result)
therefore pushes the track wider and the row overflows its card horizontally in the 640–768px band.
`Nurse.tsx:141-144` gets this right with `min-w-0` + `truncate`; the board doesn't.
*Fix:* `minmax(0,1.2fr) minmax(0,.9fr) …` on the grid template and `truncate` on the who/item spans.
**Effort: S**

**P1-19 · Touch targets under the 44px floor on primary controls**
`docs/DESIGN-SYSTEM.md` mandates ≥44×44px. Measured from the classes:
- `BoardRow.tsx:86` pill button — `py-2.5` + `text-[13px]` ≈ **39px** (the *Swap vendor* CTA).
- `ReviewQueueDialog.tsx:53-57` order `<select>` — `h-9` = **36px**, at `text-xs` = 12px (below the
  14px mobile minimum in the design system).
- `components/ui.tsx:16` legacy Button — `py-1.5 text-sm` ≈ **30px** (used on `/vendor`).
- `PhoneScreen.tsx:79-85` send button — `py-2 text-[13px]` ≈ **35px**.
*Fix:* `py-3` on the board pill; swap the review-queue `<select>` for the shadcn `Select`.
**Effort: S**

**P1-20 · Phone simulators will zoom on a real handset**
`client/src/components/PhoneScreen.tsx:72-78` — the composer input is `text-[14px]`. iOS Safari
auto-zooms the page on focus for any input under 16px. The file's own header comment says these
screens are meant to be opened *"on a real handset over the venue LAN"*. There is also no safe-area
padding (`pb-2.5` only), so on a notched phone the composer sits under the home indicator.
*Fix:* `text-[16px]` on the input; `pb-[calc(0.625rem+env(safe-area-inset-bottom))]` on its wrapper.
**Effort: XS**

### Consistency

**P1-21 · `/vendor` is the one off-brand page in the product**
`client/src/pages/Vendor.tsx:4` imports the legacy `components/ui.tsx`, which `docs/DESIGN-SYSTEM.md`
explicitly says to migrate off. The page then paints in a completely different palette: `slate-300`
borders (`:27`), `slate-500` text (`:35`), **`bg-blue-600` message bubbles** (`:65`), `slate-100`
received bubbles, `slate-400` empty text (`:44, :80`). `components/ui.tsx:4-6, 32-36` is a
slate/blue/green/red/amber palette with zero token usage.

**What a user experiences:** the demo's tab 2 looks like a different product than tabs 1 and 3 —
grey-blue chat on a coral-and-navy brand.
*Fix:* migrate `Vendor.tsx` to `ui/card`, `ui/button`, `ui/badge` + `PhoneScreen`'s `Bubble`, then
delete `components/ui.tsx` (it would then have no importers). **Effort: M**

**~~P1-22 · Cost-approval decisions are theatre and don't say so~~**
**FIXED (wave 1C, 2026-08-15):** card now labeled synthetic, with "Design preview — decisions aren't saved yet."

`client/src/pages/Reports.tsx:460-535` — `decide()` writes to component state only; the row then
renders **Approved · by S. Reyes, DON** with no persistence and no API call. Navigating away and back
resets it. Nothing on screen marks it as a mock, while the two panels above it are meticulously
labelled `CMS data` / `synthetic`.
*Fix:* add a `synthetic` chip to the card header matching `SpendBar`'s treatment (`Reports.tsx:434`),
or disable the buttons with a "not wired yet" tooltip. Known-open item (DEMO-SCRIPT:468).
**Effort: XS**

---

## P2 — polish

**Design-token drift (raw hex / off-palette Tailwind).** All bypass `index.css`:
- Coral-deep hover as a literal: `ui/button.tsx:12` `hover:bg-[#d2694c]`, `:13`
  `hover:bg-[#22303d]`, `Hospice.tsx:40`, `BoardRow.tsx:10`. → add `--primary-hover` /
  `--secondary-hover` tokens.
- Ad-hoc tints: `BoardRow.tsx:11-12` `bg-[#E6F4EC]` / `bg-[#EEF1F3]`, `Hospice.tsx:95`
  `bg-[#E6F4EC]`, `OrderCard.tsx:92,107,131,223`, `RowDetail.tsx:163`, `Driver.tsx:145,222`,
  `Order.tsx:347,400,410,411`, `Nurse.tsx:189`, `dialog.tsx:20`.
- Whole off-brand palettes: `components/ui.tsx` (all), `Vendor.tsx` (see P1-21),
  `PhoneScreen.tsx`, `PhoneKeyboard.tsx`, `QuickReplies.tsx`, `SignaturePad.tsx:29`,
  `PhotoInput.tsx:8,28`, `Caregiver.tsx:77,90,178,208,227,229,231`, `VendorPhone.tsx:27-36,47-70`.
  The phone sims are arguably deliberate (they imitate iMessage) — the rest are not.
**Effort: M** for the lot, **XS** for the two hover tokens.

**Date formats differ on every page** — six live formatters, no shared vocabulary:
`lib/board.ts:89-98` "Today"/"Tomorrow"/"Friday" · `lib/useLive.ts:26` + `lib/atRisk.ts:8`
"Aug 14, 3:05 PM" · `Order.tsx:51` "Thu, Aug 14, 3:05 PM" · `DeadlineBadge.tsx:32-38` +
`PortalOrderCard.tsx:116` "Thu, 3:00 PM" · `Caregiver.tsx:36` / `VendorPhone.tsx:39` "3:05 PM".
The board's relative style is the one that matches the north star; the rest read like logs.
*Fix:* export `formatWhen` from `lib/board.ts` and use it for anything user-facing. **Effort: M**

**Order-ID format drift** — `#1042` (`RowDetail.tsx:52`, `Hospice.tsx:111`, `OrderCard.tsx:86`,
`Demo.tsx:178`) vs `DME-1042` (`Reports.tsx:505-507`). Pick one. **Effort: XS**

**Raw enums still reaching the screen (lower-traffic surfaces):**
- `OrderCard.tsx:174` — `({e.actor})` renders `(ai)`, `(vendor)`, `(hospice)`, `(system)`.
- `OrderCard.tsx:89` and `PortalOrderCard.tsx:97` — bare HCPCS codes beside the equipment name
  (defensible on vendor-facing surfaces; not on the hospice one).
- `RiskBadge.tsx:16` — `Risk 100` is an unexplained magic number for a non-technical user; the
  human sentences live in `risk_reasons` right underneath.
**Effort: S**

**Focus ring suppressed with no replacement** — `Caregiver.tsx:90` and `VendorPhone.tsx:87` both put
`outline-none` on the thread-picker `<select>` and add nothing back. Everywhere else that suppresses
focus supplies a ring (`combobox.tsx:105/124`, `dropdown-menu.tsx:88`, `input.tsx:12`). **Effort: XS**

**Unlabelled form controls** — four raw `<select>`s with no `<label>` and no `aria-label`
(`Driver.tsx:40`, `Vendor.tsx:26`, `Caregiver.tsx:89`, `VendorPhone.tsx:86`) and one unlabelled text
input (`Vendor.tsx:96`, placeholder only). **Effort: XS**

**Orphan `<label>`s that label nothing** — `Driver.tsx:169, 177, 185` and `VendorStatus.tsx:160` are
`<label>` elements with no `htmlFor` and no labelable child (the controls are siblings). They read as
captions to sighted users and as nothing to assistive tech. **Effort: XS**

**Raw `<select>` instead of the shadcn `Select`** — `Driver.tsx:40`, `Vendor.tsx:26`,
`ReviewQueueDialog.tsx:53`, plus the two phone pickers. Shape and focus treatment drift from
`Order.tsx` / `Reports.tsx` / `Demo.tsx`, which all use the primitive. **Effort: S**

**Button shape drift** — `Hospice.tsx:40` and `BoardRow.tsx:86` use `rounded-[10px]`; `ui/button.tsx`
uses `rounded-md` (12px); `SwapVendorDialog.tsx:31` uses `rounded-[14px]`; the design system says
buttons are 11px. **Effort: XS**

**ASCII glyphs where the app otherwise uses lucide icons** — `Hospice.tsx:64` `open ▸`, `:105`
`history ▸ / ▾`, `:178` `show ▾ / hide ▴`, `Nurse.tsx:146` `›`, `PhoneKeyboard.tsx:60,78,99`
`⇧ ⌫ ⌄`. The disclosure buttons also lack `aria-expanded`. **Effort: XS**

**No hover state on the board's own disclosure buttons** — `Hospice.tsx:57-65` (review queue) and
`:170-179` (Later row) are full-width clickable cards with `transition`-less, hover-less styling; the
only affordance is the `▸` glyph. **Effort: XS**

**`/driver` still defaults to vendor 1** — `Driver.tsx:24`. After scenario 1's swap to Canyon the page
reads "Route's clear" until the picker is changed. Known-open (E2E punch #9). *Fix:* default to the
first vendor that actually has jobs. **Effort: S**

**Vendor thread doesn't scroll to the newest message** — `Vendor.tsx:60` is a `max-h-96 overflow-y-auto`
list with no auto-scroll; the phone sims do this correctly (`PhoneScreen.tsx:43-45`). New replies land
below the fold. **Effort: XS**

**Message bubbles have no `break-words`** — `PhoneScreen.tsx:115-119` (`max-w-[82%]`) and
`Vendor.tsx:64` (`max-w-[85%]`) rely entirely on the browser's break-after-slash behaviour to wrap
the 48-character magic links they carry (`http://localhost:5173/portal/` + a 20-char token,
`server/portal.ts:11-18`). It happens to hold in Chrome; a `PORTAL_BASE_URL` change or a longer token
turns it into horizontal overflow on a phone-width screen. *Fix:* add `break-words`. **Effort: XS**
*(Lower confidence than the rest — this is a robustness gap, not a reproduced overflow.)*

**POD images have no error fallback** — `RowDetail.tsx:139-151` and `OrderCard.tsx:199-211` render
`<img src="/api/pods/…">` with good `alt` text but no `onError`; a missing file shows a broken-image
icon inside the evidence panel. **Effort: XS**

**`PhotoInput.tsx:28`** — `alt="captured"` on the preview is not a description. **Effort: XS**

**Vendor phone number isn't tappable** — `RowDetail.tsx:73` renders `vendor.phone` as plain text on
the pickup row whose whole call to action is *"Call the vendor"* (`board.ts:129`), and that pill
merely expands the row. On a tablet in a nurse's hand, `<a href="tel:">` is the obvious move.
**Effort: XS**

**Nurse confirm can be double-tapped** — `Nurse.tsx:198-205` has no pending state; `apply()` is async
and unguarded. Verified against `server/pickups.ts:setPatientStatus`: the second call finds no
`delivered` orders left, so **no duplicate pickup is created** — but the user gets two identical
"Pickup … is scheduled" toasts, the second of which is untrue. **Effort: XS**

**Demo EMR buttons can be double-fired** — `Demo.tsx:114-119`, same shape, presenter-only surface.
**Effort: XS**

**Condition-check button fires bare** — `Caregiver.tsx:176-181` — `api.post()` with no await, catch,
or disable. **Effort: XS**

**Scorecard "worst cell" has no sample-size guard** — `Reports.tsx:245-248` sorts `stats` purely by
`on_time_rate`, so a one-sample cell can win and produce *"runs late on Sunday E0260 orders (0%
on-time)"* from n=1. `board.ts:108-113` guards this exact case with `cell.sample_size > 0` before
quoting a percentage. Whether it can fire depends on the seed's derived sample sizes — worth the
one-line guard regardless, given FAQ §6 on manufactured precision. **Effort: XS**

**`Button` has no default `type`** — `ui/button.tsx:44-51` renders a bare `<button>`, which is
`type="submit"` inside a form. **Audited: no live instance** — the only `<form>`s are
`Order.tsx:154` (whose in-form buttons all set `type="button"` explicitly, `:219`, and whose combobox
clear button does too, `combobox.tsx:128`), `Vendor.tsx:82` and `PhoneScreen.tsx:65` (single submit
button each). Flagging as a latent trap, not a bug: add `type={props.type ?? 'button'}`.
**Effort: XS**

**Faint text on tinted backgrounds** — `--faint: #93A0AA` on `--card: #FFFFFF` is ≈2.6:1, under the
4.5:1 AA floor for body text. It is used for timestamps and order IDs at 10–13px in
`Hospice.tsx:111,115,125`, `BoardRow.tsx:21,58`, `RowDetail.tsx:52,110,126`, `Reports.tsx:279,505`.
Same story for `text-slate-400` on white in the phone sims. Small dim type is the single most common
"looks unfinished on a projector" failure. *Fix:* darken `--faint` to ~`#6B7A85` (≈4.6:1).
**Effort: XS**

**Bundle is a single 532 kB chunk** — build warns; irrelevant on LAN, worth one line of
`manualChunks` if anyone demos over hotel wifi. **Effort: XS**

---

## (a) Count summary per page

| Surface | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| `pages/Hospice.tsx` (+ `components/board/*`, `lib/board.ts`) | 4 | 5 | 7 | 16 |
| `pages/Reports.tsx` | 1 | 4 | 3 | 8 |
| `pages/Order.tsx` | 1 | 0 | 2 | 3 |
| `pages/Driver.tsx` | 2 | 1 | 4 | 7 |
| `pages/Vendor.tsx` (Dispatcher board) | 0 | 2 | 4 | 6 |
| `pages/VendorPortal.tsx` | 1 | 0 | 1 | 2 |
| `pages/VendorStatus.tsx` | 0 | 1 | 1 | 2 |
| `pages/Nurse.tsx` | 0 | 1 | 2 | 3 |
| `pages/Caregiver.tsx` | 0 | 2 | 4 | 6 |
| `pages/VendorPhone.tsx` | 0 | 2 | 3 | 5 |
| `pages/Demo.tsx` | 0 | 0 | 1 | 1 |
| `components/ui/*` + `components/ui.tsx` | 0 | 1 | 4 | 5 |
| `lib/useLive.ts` (systemic) | 1 | 0 | 0 | 1 |
| `client/index.html` | 0 | 1 | 0 | 1 |
| **Total** | **9** | **22** | **~36** | **~67** |

Cross-cutting findings are counted against the surface where a judge would see them; `useLive`'s
silent-failure default (P0-2) is listed once but affects nine surfaces.

## (b) Top ten by value-per-effort — ready to hand to a fix agent

- [x] **1.** `pages/Reports.tsx:157-159` — append `household_confirmations` to the calls-avoided
      breakdown so the three printed numbers actually sum to the hero. *(P0-4, XS)*
- [x] **2.** `components/board/RowDetail.tsx:37` — render `detail.escalations` (open ones, `.reason`)
      above the risk-reason list. *(P0-3, XS)*
- [x] **3.** `pages/Order.tsx:311-316` — stop `Field` wrapping non-labelable children in a `<label>`,
      so clicking the "URGENCY" caption no longer marks the order STAT. *(P0-5, XS)*
- [x] **4.** `App.tsx:43,256` — remove the Dispatcher's tokenless `/vendor-portal` nav link + route
      (or redirect it to a real token). *(P0-9, XS)*
- [x] **5.** `pages/Hospice.tsx:48-73` — gate the "Nothing needs a person right now." / "Nothing in
      motion." copy on data actually having loaded; show skeleton rows until then. *(P0-1, S)*
- [x] **6.** `components/board/SwapVendorDialog.tsx:32-35` — await the swap, disable the option while
      in flight, toast success/failure, close on success only. *(P0-8, S)*
- [x] **7.** `pages/Driver.tsx:151-158` — add pending + disabled + error toast to "Start delivery";
      and `:189` add the missing "capture your signature first" hint. *(P0-6 / P0-7, S)*
- [ ] **8.** `pages/VendorPhone.tsx:57` — use `intentLabel()` instead of `intent.replace(/_/g,' ')`;
      `pages/Reports.tsx:306` — use `byCode(...).equipment_name` instead of the raw HCPCS code.
      *(P1-16 / P1-15, XS)*
- [x] **9.** `client/index.html` — add an inline SVG data-URI favicon (coral pill). *(P1-13, XS)*
- [x] **10.** `pages/Hospice.tsx:91-97` — fix "1 are still waiting on a photo." and add a zero-
      completions branch so the board stops claiming proof for deliveries that don't exist.
      *(P1-14, XS)*

Eight of the ten are XS. Items 1–4 and 8–10 together are well under an hour and remove every
finding a judge can read off the screen.

## (c) Verified GOOD — demo-safe, do not re-audit

- **`/portal/:token` (`pages/VendorPortal.tsx`) is the best-built surface in the app.** Skeleton
  loading (`:176-189`), a distinct no-token state (`:152-162`), a distinct broken-link state
  (`:164-174`), an empty state (`:249-255`), per-order `busy` flags, optimistic `pending` state that
  self-reconciles against the server (`:98-110`), and success **and** failure toasts with plain-English
  copy (`:114-133`). Its `act()` is the pattern the rest of the app should copy.
- **`pages/Order.tsx` submit path** — `loadError` state, `submitting` state, `disabled={!canSubmit}`,
  success toast with a "View board" action, error toast, and a form reset that keeps the
  equipment/urgency choices. The only defect on the page is the label bug (P0-5).
- **`components/ui/combobox.tsx`** — genuinely good a11y: `role="combobox"`, `aria-expanded`,
  `aria-controls`, `aria-activedescendant`, arrow/Enter/Escape/Tab handling, `Enter` correctly
  `preventDefault`s so selecting an option can't submit the surrounding form, `min-h-11` options,
  focus-within ring on the wrapper, labelled clear button.
- **Plain-English vocabulary layer** (`lib/domain.ts:9-18, 48-53, 56-69, 95-109`) is complete and
  correct — `STATE_LABEL`, `REVIEW_STATUS_LABEL`, `EVENT_TYPE_LABEL`, `INTENT_LABEL`. `StatusPill`
  and `EvidenceBadge` are token-clean and used consistently. The only leaks are the four listed
  above (P1-15, P1-16, and two P2s).
- **Null/date safety** — `fmt()` (`lib/useLive.ts:24-27`) guards null → `—` and is used everywhere a
  timestamp can be missing; `RowDetail.tsx:58-63` renders "No deadline set" / "Nothing promised yet";
  `Reports.tsx:165,171,284,287` all render `—` for null rates. **No path found that can print
  `null`, `undefined`, `NaN` or `Invalid Date`.** Every `new Date(x).toISOString()` call site is
  behind a non-empty guard.
- **Evidence-source rendering is done** — `RowDetail.tsx:103-106` and `OrderCard.tsx:162-165` read the
  real `payload.source` through `eventSourceNote()` and only fall back to `mockEvidenceSource` for
  seeded rows with no payload. `docs/E2E-WALKTHROUGH.md` punch #7 is **stale — this shipped.**
- **SSE plumbing** — `hooks/useEventStream.ts` is ref-counted to one `EventSource` per origin with a
  documented rationale; both shells surface a live/disconnected dot (`App.tsx:182-187, 228-233`) that
  correctly flips on `onerror`. Disconnect is visible, if not announced.
- **External links are safe** — `App.tsx:108` uses `rel="noopener noreferrer"`;
  `PhoneScreen.tsx:143` uses `rel="noreferrer"` (which implies `noopener`). No unsafe `target=_blank`.
- **`EmptyState`, `PersonaHeader`, `ConditionChecklist`, `DeadlineBadge`, `StatusPill`,
  `EvidenceBadge`** are all token-clean, correctly composed, and used as intended.
- **`ui/table.tsx:5-11`** already wraps every table in `overflow-x-auto`, so the Reports and
  Equipment tables scroll inside themselves rather than breaking the page at phone width.
- **`components/ui/button.tsx` and `input.tsx`** meet the 44px floor by default (`h-11`) and carry
  `focus-visible` rings; `size="lg"` is `h-12`.
- **`npm run build` is green** on this baseline — typecheck + vite build, exit 0.
