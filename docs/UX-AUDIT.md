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

**Status, 2026-08-15.** All nine P0s and all 22 P1s are closed. Of the ~36 P2s, all but five are
closed; the five parked ones each carry a **PARKED** note with its reason, and the one worth taking
in the morning is called out as such (`--faint` contrast). Fixes are attributed by wave —
1A/1B/1C, 2A, the teammate rotating-reply-slots merge, and wave 3 (this sweep). Wave 3 verified
every remaining finding against the live tree before touching it, so several entries below read
**ALREADY FIXED** or **NOT A DEFECT as the tree now stands** rather than being struck as new work.

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

**~~P1-1 · `/reports` shows a skeleton forever if any of its five calls fails~~**
**FIXED (wave 3, 2026-08-15):** the page now reads `useLive`'s `failed`/`reload` — a failure with no
data renders an `EmptyState` with a "Try again" button; a failure over stale data renders a
`role="alert"` strip above the KPIs.

`client/src/pages/Reports.tsx:56-70, 77, 92-93` — `loadReports()` is a `Promise.all` of five
requests, consumed through `useLive`, so one failure swallows all five and `data` stays `null`
forever, rendering `<ReportsSkeleton/>` in perpetuity. No error branch exists on the page.
*Fix:* surface `useLive`'s error (see P0-2) and render an `EmptyState` with a retry.
**Effort: S**

**~~P1-2 · `/nurse` flashes "No active patients" on every load~~**
**FIXED (wave 3, 2026-08-15):** `patients` now starts `null` and the empty state is gated behind
three skeleton rows. (The `loadError` branch had already landed; the first-paint flash had not.)

`client/src/pages/Nurse.tsx:49, 110-114` — `patients` starts `[]`, so `activePatients.length === 0`
is true on first paint and the `EmptyState` renders before the fetch resolves. Same class of bug as
P0-1, on scenario 2's primary trigger screen.
*Fix:* add `const [loaded, setLoaded] = useState(false)`; gate the `EmptyState` on it. **Effort: XS**

**~~P1-3 · `/caregiver` flashes "No household threads yet…"~~**
**FIXED (wave 3, 2026-08-15):** loading and failure both speak before the fallback copy can — a
phone has no chrome to hang a spinner on, so all three states render through one `PhoneNotice`.

`client/src/pages/Caregiver.tsx:46-48, 75-82` — three `useLive` queries default to `[]`, so
`households` is empty on first paint and the fallback screen (which tells you to go capture a POD)
renders before the data lands.
*Fix:* render nothing (or a spinner) until `messages && patients` are non-null. **Effort: XS**

**~~P1-4 · `/vendor` (Dispatcher board) has no loading state at all~~**
**FIXED (wave 3, 2026-08-15):** folded into the P1-21 migration — both lists now skeleton while
`null` and use `EmptyState` when genuinely empty.

`client/src/pages/Vendor.tsx:13-20, 44, 80` — `"No open orders."` and `"No messages yet."` both
paint before data arrives, and both are raw `<div className="text-xs text-slate-400">`, not
`EmptyState`.
*Fix:* gate on non-null and swap to `EmptyState`. **Effort: S**

**~~P1-5 · `/vendor-phone` can get stuck on "Loading…" permanently~~**
**FIXED (wave 3, 2026-08-15):** falls back to `vendors?.[0]`, and loading / fetch-failed / no-vendors
are now three distinct messages instead of one permanent "Loading…".

`client/src/pages/VendorPhone.tsx:75-79` — `vendor` is looked up by hard-coded `vendorId = 1`; if the
vendors fetch fails, or a seed ever renumbers vendors, `vendor` stays `undefined` and the page never
leaves the loading string. There's no error path.
*Fix:* fall back to `vendors?.[0]` and render an error state when the fetch fails. **Effort: S**

### Async / double-submit

**~~P1-6 · Review queue Apply/Dismiss: no pending state, no error handling, double-submittable~~**
**ALREADY FIXED (wave 2A):** `busy` flag, `disabled`, success and failure toasts. Verified against
the current tree; wave 3 changed nothing but the control sizing (see P1-19).

`client/src/components/board/ReviewQueueDialog.tsx:65-74` — both buttons call `api.post(...)` bare:
no `await`, no `.catch`, no `disabled` while in flight. The row stays in the dialog until the SSE
refetch, which invites a second click and a second POST.
*Fix:* local `busy` state + `disabled` + `.catch(toast.error)`. **Effort: S**

**~~P1-7 · "Send another nudge" is silently repeatable and silently failable~~**
**ALREADY FIXED (wave 2A):** `nudging` flag plus success/failure toasts in `RowDetail.nudge()`.

`client/src/components/board/RowDetail.tsx:78-84` — `.catch(console.error)`, no disable, no success
toast. A case manager can text a grieving family's vendor five times and see nothing happen either
way.
*Fix:* `busy` flag + `toast.success('Nudge sent.')`. **Effort: S**

**~~P1-8 · POD submission has no catch~~**
**ALREADY FIXED (wave 1B):** `submitPod()` now catches and toasts.

**~~P1-9 · Portal actions on `/status/:token` fail silently~~**
**ALREADY FIXED (wave 2A):** `run()` was replaced by `act()`, which mirrors `VendorPortal` —
optimistic pending state, rollback, success and failure toasts.

**~~P1-10 · Both phone simulators swallow send failures~~**
**ALREADY FIXED (teammate, rotating-reply-slots):** both threads carry a `sendFailed` flag and an
inline "Didn't send — try again" line. Wave 3 added `role="alert"` to those lines so they are
announced too (neither phone sim has a Toaster).

### Micro-interaction / a11y

**~~P1-11 · Board rows are clickable `<div>`s with no keyboard access~~**
**FIXED (wave 1A, 2026-08-15):** rows now `role="button" tabIndex={0}`, plus an `aria-live` count region.

`client/src/components/board/BoardRow.tsx:52` and `:113-115` — both carry `cursor-pointer` and
`onClick` but no `role`, no `tabIndex`, no `onKeyDown`, no focus style. The row-expand interaction
(where `risk_reasons` and the whole detail live) is mouse-only, and the same is true of the grouped
sub-rows. `OrderCard.tsx:71-77` has the identical problem on an `<article>`.
*Fix:* `role="button" tabIndex={0} onKeyDown={e => (e.key==='Enter'||e.key===' ') && toggle()}` plus
a `focus-visible:ring-2 focus-visible:ring-ring` class. **Effort: S**

**~~P1-12 · Nothing on the board is announced — no `aria-live` anywhere in the app~~**
**FIXED (wave 3, 2026-08-15)** — completing what waves 1A and 2A started. Coverage as it now stands,
re-derived by grep rather than recalled:
- Board: `Hospice.tsx` has an `sr-only aria-live="polite"` "Needs you" count (wave 1A) and a
  `role="alert"` server-unreachable strip (wave 1A).
- Every toast on the four Toaster-bearing shells lands in sonner's own `aria-live="polite"` region
  (verified in `node_modules/sonner`), which covers swap-vendor, review-queue, nudge, POD, nurse,
  EMR, portal and status actions (wave 2A + narration layer).
- `/reports` gained a `role="alert"` strip this wave.
- The two phone simulators have no Toaster by design, so their inline "Didn't send" and condition-
  check lines got `role="alert"` / `role="status"` this wave.
- `/driver` gained an `sr-only aria-live` route-count line this wave: scenario 2's payoff is a pickup
  appearing on that page over SSE with nobody touching anything, and it was the last silent one.

Deliberately **not** announced: individual board rows moving section (the count says it without
narrating every row), and the phone sims' reply receipts (a real SMS app doesn't announce those
either, and these screens exist to imitate one).

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

**~~P1-15 · Raw HCPCS code in the DON's routing recommendation~~**
**FIXED (wave 3, 2026-08-15):** now `byCode(...)?.equipment_name`, and the sentence carries its own
sample size ("32% on-time across 25 deliveries") so the claim can't outrun its evidence.

**~~P1-16 · Raw intent enum on the vendor phone~~**
**FIXED (wave 3, 2026-08-15):** `intentLabel(m.parsed.intent).toLowerCase()` — *"read as sharing an
ETA"*, not *"read as eta update"*.

**~~P1-17 · "1 deliveries measured"~~**
**FIXED (wave 3, 2026-08-15):** pluralized.

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

**~~P1-19 · Touch targets under the 44px floor on primary controls~~**
**FIXED (wave 3, 2026-08-15):** board pill → `flex min-h-11 items-center justify-center`;
review-queue `<select>` → `h-11 text-sm` (its Apply/Dismiss buttons dropped `size="sm"` to match);
legacy Button → gone with `components/ui.tsx` (P1-21); phone composer input **and** send button →
`min-h-11`. `PhotoInput`'s "Take photo" label also went to `min-h-11` while it was being tokenized.

**~~P1-20 · Phone simulators will zoom on a real handset~~**
**FIXED (wave 3, 2026-08-15):** composer input is `text-[16px]`, and its wrapper carries
`paddingBottom: calc(0.625rem + env(safe-area-inset-bottom))`. The input also gained an `sr-only`
`<label>` — it had only a placeholder.

### Consistency

**~~P1-21 · `/vendor` is the one off-brand page in the product~~**
**FIXED (wave 3, 2026-08-15):** `Vendor.tsx` rebuilt on `ui/card`, `ui/button`, `ui/badge`, `ui/input`
and `PhoneScreen`'s `Bubble`; **`client/src/components/ui.tsx` is deleted** — it had no importers
left. That one migration also carried P1-4 (loading states), the legacy-Button half of P1-19, the
page's two unlabelled controls, its missing thread auto-scroll and its missing `break-words`.

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

> **Wave 3 pass, 2026-08-15.** Every item below was re-checked against the tree after waves 1–2 and
> the teammate merge. Fixed items are struck; the four **PARKED** ones are listed with the reason.

**Design-token drift (raw hex / off-palette Tailwind).** All bypass `index.css`:
- ~~Coral-deep and navy-deep hovers as literals~~ — **FIXED (wave 3):** `--primary-hover` /
  `--secondary-hover` added to `index.css` and mapped through `@theme inline`; all five call sites
  (`ui/button.tsx` ×2, `BoardRow.tsx`, `Hospice.tsx`, `OrderCard.tsx`'s STAT flag) now use
  `hover:bg-primary-hover` / `hover:bg-secondary-hover` / `text-primary-hover`.
- ~~`components/ui.tsx` (whole off-brand palette)~~ — **FIXED (wave 3):** file deleted, see P1-21.
- ~~`Vendor.tsx` (whole off-brand palette)~~ — **FIXED (wave 3):** migrated, see P1-21.
- ~~`SignaturePad.tsx:29` / `PhotoInput.tsx:8,28`~~ — **FIXED (wave 3):** both are on the driver's
  demo path, so they went to `border-input` / `bg-card` / `bg-secondary` while nearby findings were
  being fixed.
- **PARKED:** the remaining ad-hoc tints (`bg-[#E6F4EC]`, `text-[#8a4a2e]`, `text-[#8e2a27]`,
  `text-[#24734f]`, `dialog.tsx`, `Order.tsx`, `Nurse.tsx:189`, `RowDetail.tsx`) and the phone-sim
  palettes. Naming ~8 new semantic tokens is a design-system decision, not a mechanical swap, and
  `docs/DESIGN-SYSTEM.md` is the source of truth for it — this is a morning call, not overnight
  work. The phone sims' slate/blue is deliberate iMessage imitation and should stay.

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

**Date formats differ on every page** — **PARKED (wave 3).** The fix is a copy change on nine
surfaces at once, hours before code freeze, with no test coverage to catch a regression and the
demo script quoting some of these strings verbatim. Real, but it belongs after the hackathon.
Six live formatters, no shared vocabulary:
`lib/board.ts:89-98` "Today"/"Tomorrow"/"Friday" · `lib/useLive.ts:26` + `lib/atRisk.ts:8`
"Aug 14, 3:05 PM" · `Order.tsx:51` "Thu, Aug 14, 3:05 PM" · `DeadlineBadge.tsx:32-38` +
`PortalOrderCard.tsx:116` "Thu, 3:00 PM" · `Caregiver.tsx:36` / `VendorPhone.tsx:39` "3:05 PM".
The board's relative style is the one that matches the north star; the rest read like logs.
*Fix:* export `formatWhen` from `lib/board.ts` and use it for anything user-facing. **Effort: M**

**~~Order-ID format drift~~** — **FIXED (wave 3):** `Reports.tsx`'s approvals table now prints
`#1042` like everywhere else; `DME-0042` is gone.

**Raw enums still reaching the screen (lower-traffic surfaces):**
- ~~`OrderCard.tsx:174` — `({e.actor})`~~ — **FIXED (wave 3):** new `ACTOR_LABEL` / `actorLabel()` in
  `lib/domain.ts`; `ai` reads **Claude** and `system` reads **automatic**.
- `OrderCard.tsx:89` and `PortalOrderCard.tsx:97` — bare HCPCS codes beside the equipment name.
  **NOT A DEFECT as the tree now stands (wave 3):** the audit itself calls these defensible on
  vendor-facing surfaces, and since wave 1C retired `/vendor` and `/vendor-portal` from the nav,
  `OrderCard` renders only on `/vendor` and `PortalOrderCard` only on `/portal/:token` — both
  vendor-facing. No hospice surface prints a bare code.
- ~~`RiskBadge.tsx:16` — `Risk 100` is an unexplained magic number~~ — **FIXED (wave 3):** reads
  **Risk 100 of 100** with a title explaining the 70 threshold.

**~~Focus ring suppressed with no replacement~~** — **FIXED (wave 3):** both phone-picker `<select>`s
gained `focus-visible:ring-2`.

**~~Unlabelled form controls~~** — **FIXED (wave 3):** `aria-label` on `Driver.tsx`,
`Caregiver.tsx`, `VendorPhone.tsx` and `ReviewQueueDialog.tsx`'s selects; `sr-only <label>` +
`htmlFor` on `Vendor.tsx`'s select and reply input and on the phone composer.

**~~Orphan `<label>`s that label nothing~~** — **FIXED (wave 3):** `Driver.tsx`'s three became
`<div>` captions; `VendorStatus.tsx`'s got `htmlFor` + a matching `id` on the `Input`.

**Raw `<select>` instead of the shadcn `Select`** — **PARTLY FIXED / PARKED (wave 3).** All five now
carry the token palette, the 44px floor and a focus ring, so the *visible* drift the finding
describes is gone. Swapping in the Radix primitive is parked: it changes keyboard and touch
behaviour on `/driver` and both phone sims hours before a demo, and a phone simulator should use
the native picker anyway — that is what a real handset does.

**Button shape drift** — **PARKED (wave 3):** the three values in the tree (10px / 12px / 14px) and
the 11px in `docs/DESIGN-SYSTEM.md` are four different answers. Picking one is a design call and the
design system is the authority; not an overnight decision.

**~~ASCII glyphs where the app otherwise uses lucide icons~~** — **FIXED (wave 3):** `Hospice.tsx`'s
three disclosures and `Nurse.tsx`'s row chevron now use lucide `ChevronRight`/`ChevronDown`/
`ChevronUp`, and all three disclosure buttons gained `aria-expanded`. `PhoneKeyboard.tsx`'s
`⇧ ⌫ ⌄` are left alone on purpose — they are what a phone keyboard actually prints.

**~~No hover state on the board's own disclosure buttons~~** — **FIXED (wave 3):** both gained
`transition-colors`, a hover wash and a focus ring.

**~~`/driver` still defaults to vendor 1~~** — **FIXED (wave 3):** opens on the first vendor with a
driver-actionable order, settled once so finishing the last job doesn't slide the page to another
route mid-demo. It also now honours a highlight handoff — "See the pickups" from `/nurse` or
`/demo` selects the vendor that owns the handed-off order, which the old hard-coded 1 silently got
wrong whenever the pickup wasn't vendor 1's.

**~~Vendor thread doesn't scroll to the newest message~~** — **FIXED (wave 3):** `Vendor.tsx` now
has the same `scrollIntoView` end-ref the phone sims use.

**~~Message bubbles have no `break-words`~~** — **FIXED (wave 3):** `break-words` + `min-w-0` on
`PhoneScreen`'s `Bubble`, which `/vendor` now also renders through, so both call sites are covered
by the one change.

Original finding — `PhoneScreen.tsx:115-119` (`max-w-[82%]`) and
`Vendor.tsx:64` (`max-w-[85%]`) rely entirely on the browser's break-after-slash behaviour to wrap
the 48-character magic links they carry (`http://localhost:5173/portal/` + a 20-char token,
`server/portal.ts:11-18`). It happens to hold in Chrome; a `PORTAL_BASE_URL` change or a longer token
turns it into horizontal overflow on a phone-width screen. *Fix:* add `break-words`. **Effort: XS**
*(Lower confidence than the rest — this is a robustness gap, not a reproduced overflow.)*

**~~POD images have no error fallback~~** — **FIXED (wave 3):** new
`client/src/components/PodImage.tsx` swaps a failed load for a dashed "Photo missing" /
"Signature missing" tile; both `RowDetail` and `OrderCard` render through it. A gap in the evidence
trail should say so in words on the screen whose whole pitch is evidence discipline.

**~~`PhotoInput.tsx:28` `alt="captured"`~~** — **FIXED (wave 3):** now *"The equipment you just
photographed"*.

**~~Vendor phone number isn't tappable~~** — **FIXED (wave 3):** `<a href="tel:…">` with the
non-digits stripped, underlined, with a focus ring.

**~~Nurse confirm can be double-tapped~~** — **FIXED (wave 3):** a `saving` flag disables both
buttons and the CTA reads "Saving…".

**~~Demo EMR buttons can be double-fired~~** — **FIXED (wave 3):** a page-level `busy` id disables
every row's buttons while one is in flight.

**~~Condition-check button fires bare~~** — **ALREADY FIXED (teammate, rotating-reply-slots):**
`sendConditionCheck` awaits, disables and renders sending / sent / failed inline.

**~~Scorecard "worst cell" has no sample-size guard~~** — **FIXED (wave 3):** the worst cell is now
picked from `stats.filter(s => s.sample_size > 0)` (the same guard `board.ts:108-113` already used),
and the sentence prints its own n — *"32% on-time across 25 deliveries"*. Checked against a live
`scenario1` seed: all 84 of the worst vendor's cells have support today, so this changes no demo
copy; it is a guard against a reseed, not a repair.

**~~`Button` has no default `type`~~** — **FIXED (wave 3):** `type={props.type ?? 'button'}`, applied
after the prop spread and skipped when `asChild` (a `Slot` may wrap an `<a>`). Still no live
instance — this closes the latent trap.

**Faint text on tinted backgrounds** — **PARKED (wave 3).** The fix is a one-line token change, but
`--faint` paints timestamps, order IDs and captions on every screen in the product, and
`docs/DESIGN-SYSTEM.md` is the source of truth for the palette. Re-toning the whole app's secondary
text overnight, with no way to eyeball the result before the demo, is a worse risk than the finding.
**Recommend taking this in the morning** — it is the highest-value item left on this list, it is one
line (`--faint: #6b7a85`), and "looks unfinished on a projector" is a real judging cost.

**Bundle is a single 554 kB chunk** — **PARKED (wave 3):** the audit's own note says it is
irrelevant on LAN, and touching `manualChunks` the night before a demo trades a real risk (a
mis-split chunk breaking the boot) for a benefit nobody in the room will observe.

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
- [x] **8.** `pages/VendorPhone.tsx:57` — use `intentLabel()` instead of `intent.replace(/_/g,' ')`;
      `pages/Reports.tsx:306` — use `byCode(...).equipment_name` instead of the raw HCPCS code.
      *(P1-16 / P1-15, XS)* — done wave 3.
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
