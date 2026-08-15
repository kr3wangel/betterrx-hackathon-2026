# Page map and navigation flow

**What this is:** every page in the app as a labelled box, with arrows showing where each user can
actually go from where.

**How this was verified — read this before trusting the arrows.** Every arrow below is a real
navigation affordance found in the code, not an inferred user journey. The search that produced it:

```bash
grep -rnE "useNavigate|navigate\(|window\.location|<Link|<NavLink|href=" client/src/pages/ client/src/components/
```

That returns **exactly two** programmatic navigations in the entire application. Everything else is
the global nav bar. An earlier draft of this document drew vendor and driver arrows that were really
*system events*, not navigation — those now live in §4, clearly separated.

**Viewing:** mermaid renders on github.com natively; in VS Code use *Markdown Preview Mermaid
Support* + `Cmd+Shift+V`. All diagrams here were rendered through `mermaid-cli` v9 and v10 before
committing, not eyeballed.

Read with [FEATURES.md](FEATURES.md) and
[deliverables/DIFFERENTIATION.md](deliverables/DIFFERENTIATION.md).

---

## 1 · Every page, one line each

**11 routes, 10 page components** (`VendorPortal` serves both `/vendor-portal` and `/portal/:token`).

### Hospice staff — 4 pages

| Route | Persona in code | What the page is |
|---|---|---|
| `/order` | Admissions Nurse | Blank order form: patient, equipment, qty, needed-by, urgency, vendor |
| `/hospice` | Case Manager | The board. Orders by state, escalation bar, risk flags, AI review queue, vendor swap, inline order form, EMR simulator |
| `/nurse` | Field Nurse | Two taps: pick patient, then discharged/deceased. Fires the pickup trigger |
| `/reports` | Director of Nursing | Vendor scorecards, condition stats, calls avoided, pickup latency, DME spend, **and the cost-approval queue** |

### Vendor side — 5 pages

| Route | What the page is |
|---|---|
| `/portal/:token` | Magic link, no login. One order: Confirm, Set ETA, Can't fill it |
| `/vendor-portal` | Same component, no token — the demo entry |
| `/status/:token` | Read-only vendor status view |
| `/vendor` | Dispatcher board + in-page phone simulator |
| `/vendor-phone` | Full-screen SMS simulator, shows parse intent + confidence |

### Field & household — 2 pages

| Route | What the page is |
|---|---|
| `/driver` | Phone-sized. Today's stops, POD capture: photo, signature, condition checklist |
| `/caregiver` | Family's phone. Condition check arrives, reply 1-5 |

### Proposed — 2 more

| Route | What it would be | Why |
|---|---|---|
| `/approvals` | The DON's queue, sorted by how long each order has waited | Today it's a card buried on a weekly-reading page |
| `/my-patients` | Admissions nurse's "did my stuff arrive" list | She can place an order and then has nowhere to look |

---

## 2 · The navigation map

`App.tsx:103` splits the app in two. `/caregiver` and `/vendor-phone` render **outside** the Shell —
no nav bar, full-screen phone simulators. Everything else renders **inside** the Shell and gets the
same seven-link nav bar.

```mermaid
graph TD
  NAV["GLOBAL NAV BAR<br/>7 links, on every page inside the Shell<br/>identical for every role"]

  subgraph Inside the Shell - has the nav bar
    BOARD["/hospice<br/>the board"]
    ORDER["/order<br/>place an order"]
    NURSE["/nurse<br/>patient status"]
    REPORTS["/reports<br/>scorecards + approvals"]
    VBOARD["/vendor<br/>dispatcher board"]
    VPORTAL["/vendor-portal<br/>demo entry"]
    DRIVER["/driver<br/>POD capture"]
    PORTAL["/portal/:token<br/>magic link"]
    VSTATUS["/status/:token<br/>read-only"]
  end

  subgraph Outside the Shell - no nav bar
    CARE["/caregiver<br/>condition reply"]
    VPHONE["/vendor-phone<br/>SMS simulator"]
  end

  NAV --> BOARD
  NAV --> ORDER
  NAV --> NURSE
  NAV --> REPORTS
  NAV --> VBOARD
  NAV --> VPORTAL
  NAV --> DRIVER

  BOARD ==>|"+ New order button<br/>Hospice.tsx:39"| ORDER
  ORDER ==>|"View board toast<br/>Order.tsx:100"| BOARD

  SMS["SMS link to vendor"] -.-> PORTAL
  SMS -.-> VSTATUS
  TYPED["typed URL, demo only"] -.-> CARE
  TYPED -.-> VPHONE
```

Thick arrows are the only two real in-app jumps. Thin arrows are the nav bar. Dashed arrows are
external entry — a texted link or a URL typed by the presenter.

**Three things this makes visible:**

1. **`/nurse` and `/reports` have no exit at all.** No button, no link, no redirect. You leave by
   clicking the nav bar or you don't leave.
2. **The two real jumps use different mechanisms.** `/hospice` uses
   `window.location.href = '/order'` — a **full page reload** that drops SSE and re-fetches
   everything. `/order` uses React Router's `navigate()`. One of these is a bug.
3. **`/portal/:token` renders inside the Shell**, so a vendor who taps a no-login magic link is
   shown the hospice's full internal nav — Board, Reports, Driver. We pitch "the vendor logs into
   nothing"; the demo hands them the hospice's own navigation. See §5.

---

## 3 · Where each user can actually go

Roles now exist in the app — see §5 — so "can go" still means the same seven links for everyone.
These diagrams show where each role *needs* to go, with the gap called out.

### Admissions nurse

```mermaid
graph LR
  A["/order<br/>place an order"]
  B["/my-patients<br/>PROPOSED"]
  C["/hospice<br/>everyone's patients"]
  A ==>|"View board toast"| C
  A -->|"form resets<br/>place another"| A
  A -.->|"proposed"| B
```

**One page, and its only real exit lands her on the wrong screen.** The "View board" toast sends her
to the case manager's board showing every patient in the hospice, not hers. `/my-patients` is the
missing box.

### Case manager

```mermaid
graph LR
  A["/hospice<br/>the board"]
  B["/order"]
  C["/nurse"]
  D["/reports"]
  A ==>|"+ New order"| B
  B ==>|"View board"| A
  A -->|"inline order card<br/>stays on page"| A
  A -->|"nav bar only"| C
  A -->|"nav bar only"| D
```

**The only well-connected role.** Both real navigations in the app belong to her, and the board has
its own inline order form so the common case never leaves the page. This is the one journey that was
actually designed.

### Director of nursing

```mermaid
graph LR
  A["/reports"]
  B["/approvals<br/>PROPOSED"]
  C["/hospice"]
  A -->|"scroll to find<br/>the approvals card"| A
  A -->|"nav bar only"| C
  A -.->|"proposed"| B
```

**One page doing two jobs.** Approving orders is daily; reading scorecards is weekly. They share a
screen and the daily task is the one you scroll to find.

### Field nurse

```mermaid
graph LR
  A["/nurse<br/>who changed?"]
  B["/nurse<br/>discharged / deceased"]
  A --> B
  B -->|"no navigation<br/>after confirm"| B
```

**Two taps and a dead stop.** The screen fires the pickup trigger and then shows her nothing about
what she just set in motion. The consequences all land on the case manager's board, which she has no
reason to open.

---

## 4 · System events — NOT navigation

These are the arrows I previously drew on the navigation map by mistake. Nobody clicks these; they
are events propagating through the backend and out over SSE. Keeping them separate is the point.

```mermaid
graph LR
  N["field nurse taps<br/>deceased / discharged"]
  P["every delivered order<br/>flips to pickup"]
  T["vendor texted<br/>24h clock starts"]
  E["/hospice<br/>overdue escalates"]
  V["vendor taps<br/>magic link"]
  B["/hospice<br/>board updates live"]
  D["driver captures POD"]
  C["/caregiver<br/>condition text sent"]
  R["/reports<br/>vendor scorecard"]
  N --> P
  P --> T
  T --> E
  V --> B
  D --> C
  C --> R
```

---

## 5 · Roles: identity shipped, authorization did not

**This changed under us mid-build.** Commit `16e242e feat(client): mock role-based login in the
shell` landed while this document was being written, so an earlier version of it — pushed as
`098edfa` — claimed there was no role state anywhere. That claim is now wrong.

**What exists** (`client/src/lib/auth.tsx`): a `ROLES` array of **six** roles — Case Manager,
Admissions Nurse, Field Nurse, Dispatcher, Driver, Director of Nursing — plus `AuthProvider`,
`useAuth()`, sign in, sign out, switch role, persisted to `localStorage`.

**What it does:** changes the avatar initials and the name in the top-right corner.

```bash
grep -rn "useAuth" client/src --include="*.tsx" --include="*.ts" | grep -v "lib/auth"
# client/src/App.tsx:47   <- the dropdown itself, and nothing else
```

`useAuth` has **exactly one consumer: the dropdown that sets it.** `surfaceLinks.map()`
(`App.tsx:148`) is not filtered. No page branches on role. No route guards. Signed in as Driver, you
still see Board, Reports, and every hospice screen.

That is **identity without authorization** — and it's genuinely half the work done. The remaining
half is one `.filter()` on the nav array plus a redirect guard.

**The deeper gap is unchanged:** `shared/types.ts:26` has
`Actor = 'hospice' | 'vendor' | 'driver' | 'system' | 'ai' | 'family'`. **`hospice` is one undivided
value.** Six roles now exist in the client and the ledger still cannot record which of them acted.
We tell judges the append-only ledger captures who acted and through which channel. For vendors
that's true; for hospice staff it isn't.

---

## 6 · The approval gate — what's real, what isn't

**Cost approvals already exist**, correcting another earlier error of mine: `mocks.ts` defines
`COST_APPROVAL_THRESHOLD_USD = 150` and `mockApprovals()`, and `Reports.tsx:437` renders
`CostApprovals` with working Approve/Deny buttons. My first grep covered only `server/` and
`shared/` for `*.ts` and missed the client `.tsx` entirely.

**But it is a mock, and the seam matters.** `decide()` (`Reports.tsx:450`) calls `setDecisions` —
local React state. No API call, no persistence, no ledger event, and **nothing gates dispatch**. An
order over $150/mo goes to the vendor whether or not the DON ever looks. The UI is real; the control
is not. **Don't demo the approve button as though it gates anything.**

Making it real means a `pending_approval` state ahead of `ordered`:

```
[pending_approval] -> ordered -> dispatched -> in_transit -> delivered -> pickup_pending
```

And that has a consequence worth a slide:

**An approval step is the first delay in this system that is the hospice's own fault.** Everything
we've built measures the vendor — silence ladder, on-time rate, unproven claims, condition. If a DON
sits on an approval for six hours, the bed is six hours late and **not one of our metrics would show
it.** Worse, if the SLA clock starts at *approval*, the vendor absorbs a delay they didn't cause and
the scorecards we ask a hospice to choose vendors with go quietly wrong.

So: **the clock starts at order placement**, approval latency is its own span attributed to the
hospice, and it shows on `/reports` beside the vendor scorecards. The DON's own screen shows the
DON's own drag. That's the honest version of "balance between care and cost" — a system that only
measures the vendor flatters whoever bought it.

**On the number:** `$150/mo` is real in the code but **not validated against any hospice**. Per
FAQ §6 we say that rather than let it read as researched.

---

## 7 · Build plan

| # | Item | Size | Why |
|---:|---|:--:|---|
| 1 | **Filter `surfaceLinks` by `role`** | **XS** | Identity already shipped in `16e242e`. This is one `.filter()` and it makes the whole role model visible on stage |
| 2 | Split `Actor: 'hospice'` into the six roles that already exist in `auth.tsx` | **S** | The ledger can finally name our own people. Client already has the enum |
| 3 | Give `/nurse` and `/reports` an exit | **XS** | Both are dead ends. A "back to board" button each |
| 4 | Fix `window.location.href` on `Hospice.tsx:39` to `navigate()` | **XS** | Full page reload drops SSE mid-demo |
| 5 | Show cost + threshold warning on `/order` | **S** | CMS amounts are in `shared/catalog.ts`; the form never reads them |
| 6 | `/approvals` page — move `CostApprovals` off `/reports` | **S** | Component exists. Mostly a move plus queue sorting |
| 7 | Persist approvals: server state + `pending_approval` + dispatch gate | **M** | Turns the mock into the feature |
| 8 | Approval latency on `/reports` | **S** | The honesty beat in §6 |
| 9 | `/my-patients` | **M** | Needs a patient-to-staff assignment the seed doesn't have |

**Items 1, 3 and 4 are XS and together they fix the demo's worst UX moments.** Item 1 in particular
is now nearly free: a teammate already built the hard half.

---

## 8 · Open questions

1. **Does the vendor magic link need its own chrome?** `/portal/:token` renders inside the hospice
   Shell today, showing an external vendor our full internal nav. Either move it outside the Shell
   like `/caregiver`, or accept it and don't dwell on it during the demo.
2. **Six roles in `auth.tsx` but three in the pitch.** Dispatcher, Driver and Field Nurse are in the
   switcher. Do we present six personas or three plus supporting cast?
3. **Can the case manager approve** under a lower second threshold? Currently modelled DON-only.
4. **Is $150/mo right?** Real in code, unvalidated against any hospice.
5. **Two order forms** — `/order` and the inline card on `/hospice`. They should share a component.
6. **`/vendor` vs `/vendor-phone`** — pre-existing naming collision, FEATURES.md §8.1. The demo
   driver needs to know which to open.
