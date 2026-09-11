# fidelity-fid-shell: the workspace shell and the Overview, against the boards

Group: the shell (rail, top bar, POS switch, Create menu, search) and the
Overview. Boards: Main (WS005), W36, W37, W38, W53, W54, W00, M33. Every
`*.board.png` is the board's HTML rendered at 1440x900 (M33 at 1194x834);
every `*.live.png` is this branch on a local `next dev` (port 3140, proxied as
the registered host `qa-journeys.local`, isolated database `qa-journeys`),
signed in through `/api/dev/signin`, at the same viewport. The dev-only
identity banner is hidden in the live frames so the 900px matches. Nothing was
written on any tenant: every screen here is read-only and the fixture rows are
whatever the isolated database held on 2026-09-11.

Where the board's sample data says Casa Nube, Ana or $65, the live frame says
what the fixture workspace actually holds ("QA Journeys (48-case fixture)",
8 arrivals, $3,241 collected, 22 things in the queue). That is the contract.

## Boards

| Board | Verdict | Live frame | What differs, and why |
|---|---|---|---|
| Main.dc.html (Overview) | **partial** | `Main.live.png` | Layout, regions, order, copy and controls match: greeting + date + "N things need you", Open POS / New appointment / Today, five cards, the queue sorted by consequence with a destination chip and one action per row, Today with Arrivals / Classes / Tables, Setup readiness. Every number is a reader's (see "Readers"). Differs: the queue is as long as the workspace's queue (22 rows on the fixture, five on the board), so the readiness bar sits below the fold when the queue is long; the destination chip on exception rows reads "Issues" (the registry word) where the board writes "Exceptions"; the actions' words are the engine's own verbs ("Issue the missing tickets") rather than the board's samples. |
| W36_NavRegistry | **matched** (the rail half) | `W36_NavRegistry.live.png` | The rail is the registry's projection with the board's groups (Operate · Sell & manage · Relationships · Money · Grow), the board's labels (Appointments & Classes, Events & Tickets, Spaces & Resources; Menu & catalog and Team on a cafe, Appointments and Services on a solo) and counts on Messages and Issues. Preparation and Discounts are children of Orders and Catalog, as the board's "secondary views" column has them. The board's right half, the Settings › Destinations table that edits labels, is not built: labels are per-preset in the registry, not per-workspace (not wired, below). |
| W37_SidebarByPreset | **partial** | `W37_SidebarByPreset.live.png` (workspace B, hybrid, Free) and `Main.live.png` (workspace A, cafe preset on a talent workspace) | The two presets the isolated database has are shown; there is no solo fixture. The talent workspace also draws Pitches, which the board's business presets never have (registry: talent workspaces only). |
| W38_SidebarByRole | **partial** | `W38_SidebarByRole.live.png` (the fixture viewer) | Staff see Overview, Messages, Calendar, Appointments & Classes, Reservations, Orders, Clients, Sales and "Setup is owner-only · ask the owner" at the foot; the POS switch and Open POS are absent/disabled for a rank with no mode. The role ladder cannot tell a cashier from a host, so one staff rail is the union of the board's three (D-POS-13). |
| W53_GlobalSearch | **partial** | `W53_GlobalSearch.live.png` | ⌘K and the top bar's search button open the field; results are grouped Clients · Projects · Sales · Appointments · Catalog · Messages · People from the RLS-scoped reader, the pane on the right shows the selected record with Open record / New appointment, and the footer sentence is the board's. Not wired: the client pane's Due now / Next booking / Pass lines and Collect (D-POS-12; Collect is drawn disabled with the reason). |
| W54_QuickCreateReturn | **partial** | `W54_QuickCreateReturn.live.png` | The "+ Create" menu lists the create actions this person may take, each opening its drawer over the current page so closing it returns there (the menu says so). The board's right half, the New appointment form itself ("Started from Calendar · Tue 8 Sep 15:00"), is the appointments group's board (WS007/NewAppointment); the drawer that opens today is the engine's booking drawer. |
| W00_ModeSwitch | **partial** | `W00_ModeSwitch.live.png` | The centred Workspace | POS · <mode> switch with the board's chrome; the menu lists every mode with its state: usable, "Turned off at <workspace>", "Not your role", and the two modes with no screen disabled ("No screen yet"); "Default here" marks the remembered mode; the footer sentence is the board's. Differs: mode labels are the built modes' own (Counter · Tables · Door · Front desk · Collect), not the board's (D-POS-11); the header says the workspace name where the board says a location and a device (no locations or devices table exists). |
| M33_ModeSwitch | **not wired** (mostly) | `M33_ModeSwitch.live.png` (same menu as W00) | M33 is the POS tablet's own chrome (the MODE pill in the POS rail, the sale/drawer line, the per-mode live hints "14 today · 2 balances due"). The mode list, its disabled states and the safe-switch sentence are the same component as W00 and are built; the POS rail placement and the per-mode live hints belong to the POS group's chrome and are not built here. |

## Readers behind the Overview (nothing is mocked)

`web/src/app/(workspace)/[tenantSlug]/_data-bridge/overview-board.ts`, read by
`/admin/page.tsx` and handed to the shell through a store
(`overview-snapshot-store.ts`), so the seven readers run only on the Overview
and not on every admin navigation.

- Collected today: `loadTenantTakings` with a new `since` window at the venue's
  midnight (`venueDayWindow`), split by the Payments page's method rule
  (cash / card at counter / provider).
- Balances due: `loadTenantOwedOrders`, whole pending_payment set; "due today"
  counts today's appointments with an outstanding order (`loadClassesDay`).
- Arrivals: the host stand's book (`loadHostStand`) when the workspace takes
  reservations, else today's appointments from the front desk's day.
- Open orders: `loadWorkspaceOrders` (draft · quoted · pending payment with a
  balance); in preparation / ready from the kitchen's tickets (`listBoard`).
- Exceptions: `loadExceptions`, the Issues queue; the card says which sources
  could not be read instead of showing a short total.
- Needs you now: those exceptions (critical → high → normal), balances due
  today, unconfirmed bookings today, late reservations; `sortNeedsYou` in
  `lib/overview/model.ts`.
- Today: the book (Arrivals), sessions (Classes, `loadClassesDay`), the floor
  (Tables, `listFloor`); a tab this workspace has no reader for is disabled
  with the reason.
- Setup readiness: six facts (time zone, a catalog item, bookable hours,
  online payments, payout destination, a published website page).
- Issues count on the rail: `issuesOpenCount` added to the overview metrics
  bridge.

Every card whose reader fails says "Could not read this right now" rather than
0. With no snapshot (a clamped deep link) the board draws its loading state.

## Not wired

- W36's Settings › Destinations editor (per-workspace label overrides, Save).
- W53's per-client Due now / Next booking / Pass and Collect from search (D-POS-12).
- W00/M33's location and device in the menu header, and the per-mode live
  hints (no locations/devices table; hints need the mode readers on every page).
- M33's POS-rail MODE pill (POS chrome).
- The switch's mode labels per the board (D-POS-11).

## Copy

Every new sentence is in `web/messages/{en,es,fr}.json` under
`dashboard.overviewBoard`, `dashboard.workspaceShell` and
`dashboard.pos.counter.switch`. The rail's registry words have Spanish rows in
`dashboard-i18n-rail.ts` (the rail's own EN/ES dictionary, as before). The 144
`dashboard.adminOverview.*` and `dashboard.adminShell.pulse.*` keys the old
Overview and pulse chip read were deleted from all three catalogs (the
key-usage guard names dead keys).

## Playwright

`e2e/cases/POS-counter-cash-sale.spec.ts` selects the POS half of the switch
by `/^(pos · )?counter$/i` now that the half reads "POS · Counter", and picks
Counter from the menu when more than one mode is on (the fixture has five on
now; the spec assumed one). Every other rail/switch selector in `e2e/`
(`data-tulala-app-sidebar`, the `workspace or point of sale` group,
`^Sales\b`, `^Spaces\b`, menuitem names) still resolves against the new
structure; menu rows carry `aria-label` = the mode label so
`/^(door|puerta|porte)$/i` and friends keep matching.

Run against this branch's dev server (`PLAYWRIGHT_BASE_URL=http://localhost:3141`,
dev sign-in, isolated database), 2026-09-11:

- "counter: shift open, two items, cash collected, receipt resolved, money
  rows agree" — **passed** (the top-bar entry, the chrome swap, the sale).
- "refusal: an item that needs the customer's name" — **passed** on rerun
  (first run failed on `[data-tulala-app-sidebar]` count 1 for 5s after the
  switch, a timing flake under load; identical helper passes in the case above).
- "refusal: a sale someone else already collected against" and "refusal: a
  sale changed underneath the operator" — **failed, and fail identically with
  this branch's `src/` stashed** (`.fid-shell-repro.mjs` in the scratchpad):
  both open a SECOND tab by hard-loading `/admin/pos?mode=counter&order=…` and
  click Charge / an item as soon as the server-rendered button is visible
  (~180 ms), before hydration; the click is lost and the cash tab never opens.
  The same click a second time works. Not a shell regression; the spec's
  second-tab setup needs to wait for hydration. Reported, not patched here.
