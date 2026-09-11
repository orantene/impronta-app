# fidelity-polish1: a second, exacting pass on the two screens the owner opens first

**Group.** `POSCounter` (1194x834) with the till's own mode switch
`M33_ModeSwitch`, and `Main` (the Overview, 1440x900) with the shell around
it (rail W36/W37, top bar). Each folder holds `board.png` (the board's HTML
rendered at its viewport), `before.png` (this branch's parent,
`program/fidelity`, on the isolated database) and `after.png` (this branch),
all from a local `next dev` on `qa-journeys`, signed in as the fixture owner,
the dev-only identity banner hidden. Nothing was written on any tenant by
the screenshots; the Playwright cases write to the fixture workspace as they
always have.

**Branch.** `work/fid-polish1` off `program/fidelity` (`096e70128`). Nothing
pushed; production never read or written; `npm run db:push` never run.

## Method

Board and live were rendered at the same viewport and measured element by
element (`getBoundingClientRect` + computed font, padding, radius, colour)
with a throwaway Playwright script, then compared. The difference list
below is what that measurement found; every item is either fixed here or
named under "What remains" with the reason.

## POSCounter: the difference list

| # | Difference (before) | Cause | Now |
|---|---|---|---|
| 1 | The workspace top bar (56px: breadcrumb, Workspace/POS switch, Create, bell, plan, avatar) sat above the till; the board has none. Every POS region was 56px lower and the basket 56px shorter. | The shell's POS chrome branch still mounted `TulalaIdentityBar`. | **Fixed.** No bar inside the till; every mode's frame is the full viewport (`100vh - cbar`). The M33 menu and the rail's `Workspace` door are the two doors the bar offered (D-POS-67). |
| 2 | The `MODE · Counter` chip was a label; the board's M33 menu opened only from the top bar. | No provider. | **Fixed.** The chip is a button; `PosRailModeMenu` draws M33 (title, subtitle, rows with their states, the two unbuilt modes, `Make this the default here`, the footer) over the same `usePosModeMenuModel` the W00 switch uses. `M33_ModeSwitch/after.png`. |
| 3 | The rail carried a sixth row, `Customer display`; the board's rail is five destinations, Lock, Workspace. | A rail link. | **Fixed.** The display door is under the cashier chip with Devices and Connection, as a real new-window link; the spec's door updated, assertion unchanged. |
| 4 | Every text block was taller than the board (line-height 1.65 from the admin body vs the board's `normal` ~1.2): header subtitle 21px vs 16px, category chips 44px vs 40px, tile price 26px vs 18px, basket line 62px vs 64px with the price 27px tall. | Inherited `line-height`. | **Fixed.** The frame sets `leading-[1.2]`; chips, tiles, lines, totals now measure the board's heights. |
| 5 | No `Options` badge on any tile; no chooser. | Variants were never read. | **Fixed.** `Options` when the offering has more than one variant; the chooser lists them with their price delta; the pick is sold as the line's `variant_id`. On this fixture only `QA Night ticket` (General admission / Paid admission) qualifies; the `Prove class`/`Door night`/`POS class` packages have ONE `Seat`/`Entry` variant and rightly show nothing. |
| 6 | No `N left` / `Sold out`. | Stock never read. | **Fixed** from the capacity mirror (`inventory_qty` with a `capacity_pool_id`); the fixture has no counted offering, so none renders here (unit-tested in `counter-model.test.ts`). |
| 7 | A second tap on the same item made a second identical line; the board's `2 · Latte · $90 each` never appeared. | `addLine` on every tap. | **Fixed.** Same offering + variant + session on an unsent line adds a unit through `posUpdateLine`; the `$x each` second line renders. |
| 8 | `Tax · None` on every sale. | The row read a number, and a zero read as "none". | **Fixed.** The row reads the tax OUTCOME (`orderTax`): `Not set up` / `Sin configurar` / `Non configurée` while no line can carry a tax category; a figure only when one does. |
| 9 | `Held until` never rendered. | Holds never read. | **Fixed** from live `capacity_allocations` on the sale's lines (earliest expiry); nothing on this fixture holds a place, so it does not show here. |
| 10 | The basket's second line for a variant (`Oat milk · Extra shot`) had no source. | | **Fixed**: the line's variant label rides `variantLabel`. |
| 11 | `Saved hh:mm` was empty until the screen wrote something. | Client-only state. | **Fixed.** Starts from the sale row's `updated_at`. |
| 12 | Header `Sale #65C2 · QA Journeys Owner`, location chip = workspace name, cashier chip `· No drawer`. | Settled (D-POS-15, fixture facts). | Unchanged: matches the board's structure with the fixture's words. |

Matched after this pass: rail (chip, five rows with counts, Lock, Workspace),
64px header, search-or-scan, chips (Favorites disabled per D-POS-31, then
All + the catalog's kinds), 4-up 112px tiles with price + badge, the basket
(Customer · Booking · Here/To go, lines with quantity pill / label / second
line / held chip / total / each, Subtotal · Discount · Tax · Total, Charge,
Hold sale · Send N items, Saved hh:mm). **Verdict: matched.** What differs
is data: the fixture's catalog is 40 long QA titles at $0.00.

## Main (Overview): the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | The page column was 1180px wide (content began at x=278, the board at 268). | `max-w-[1200px]`: 268. |
| 2 | Line-height 1.65 everywhere: the subline 21px vs 16px, KPI label 19px vs 13px, queue title/detail 21/20px vs 16/15px, Today rows 43px, readiness card 111px vs 94px. | `leading-[1.2]` on the board; measured heights now the board's. |
| 3 | Row actions (`Issue the missing tickets`, `Finish setup`) rendered 34px/13px; the board draws 30px/12px. | `h-[34px]` in the base string beat the override; size and tone are separate strings now. |
| 4 | The page scrolled as one long column (22 queue rows), pushing the readiness bar below the fold; the board is one screen. | The board is the viewport's height; the queue scrolls inside its card; Today and readiness stay in view. |
| 5 | `Open orders` read `Could not read this right now` on this workspace. | `loadWorkspaceOrders` sent 500 order ids in one `in()` (a 19 KB request line, refused by undici); the related reads now go in batches of 150. It reads `187 · 17 in preparation · 5 ready`. |
| 6 | The rail's tenant chip and group eyebrows were a few px taller than drawn. | `leading-[1.2]` on both. |

Unchanged and already matched (fidelity-fid-shell): greeting + date + "N
things need you", the three actions, five KPI cards with the coloured second
lines, the queue's dot / title / detail / destination chip / one action,
Today's tabs and time · name · service · pill rows, the readiness bar and
`Missing: …` line. **Verdict: matched**; the words are the fixture's.

## Not wired

- M33's per-mode live hints ("14 today · 2 balances due") and the location /
  device line in the menu header (D-POS-67, no locations or devices table).
- Favorites (D-POS-31).
- A tax category on an offering (no column yet; the row says so).

## Gates (private lane, 2026-09-11, real exit codes; `runs/`)

| Gate | Exit |
|---|---|
| `TSC_QUEUE_LOCK=… npm run typecheck` | first run 2 (11 errors in the new hook, fixed); rerun `tsc --noEmit` with the heap flag: 0 errors |
| `npm run lint` | first run 1 (React compiler refused two hand-written `useCallback`s; removed); rerun 0 |
| `npm run test:design-system` | 0 |
| `npm run test:tenant-isolation` | 0 |
| `npm run test:size-ratchet` | 0 |
| `npm run test:phase1-i18n` | 0 |
| `test:money` files touched (`counter-model.test.ts` 12 pass incl. the new badge test, `pos-page-wire.static.test.ts` 12 pass after pointing the sessions-read assertion at `counter-catalog.ts`) | 0 |

Playwright (`--workers=1`, dev server on `qa-journeys` behind the host proxy
`localhost:3161 → qa-journeys.local`, forwarding the browser's own origin and
the HMR websocket; the proxy without the websocket forward never hydrated):

- `pos-scanner.spec.ts`: **passed** (pw1).
- `pos-customer-display.spec.ts`: **passed** (pw2) through the new cashier-menu door.
- `POS-counter-cash-sale.spec.ts`: **not green here.** Run pw1's main case got
  through the shift, both items, the line editor, cash, the paid screen and
  the receipt link, then hit the 180s test budget on the anonymous receipt
  page's cold compile. Six reruns (pw2 to pw6) failed at five DIFFERENT
  steps, each a 20 or 30s expectation waiting on a server action or refresh
  the dev log shows taking 5 to 26s (machine load 8 to 10 with three dev
  servers up, remote branch database). None of the failures is on the code
  this branch changed; the same latency class is documented in
  prove-counter and fidelity-fid-shell. Reported, not patched: no timeout was
  raised and no assertion weakened. The spec's selectors are untouched.
