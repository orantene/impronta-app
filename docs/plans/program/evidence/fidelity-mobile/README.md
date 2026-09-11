# fidelity-mobile: the workspace at 390x844, against the MW boards

**Group.** MOBILE: the phone chrome (MW00 bottom tabs + More sheet, MW01
workspace switch, the 52px top bar with its back-header variant), the
Overview on the phone (MW02), and the same screens the desktop groups built,
at phone width: Issues (MW03/04), Search (MW05), the client record and its
Collect sheet (MW06/07/08), Projects (MW09-12), Appointments (MW13-16), Orders
(MW17-20), Catalog (MW21-23), Spaces (MW24), Events tickets (MW25), My work
(MW26-31), invitations and link states (MW32-34, MW36), notifications (MW35),
a keyboard form (MW37) and the till on a phone (POSHandheld).

Every `<Board>.board.png` is the board's HTML rendered at 390x844 (device
scale 2); every `<Board>.live.png` is this branch on a local `next dev` (port
3230, proxied as the registered host `qa-journeys.local` on 3231 by the
websocket-forwarding proxy from `fidelity-catalog/runs/host-proxy-ws.mjs`,
isolated database `qa-journeys`), Playwright at 390x844, device scale 2,
`isMobile`, iPhone 13 user agent, signed in as the fixture owner through
`/api/dev/signin`, the dev-only identity banner hidden. Where the board says
Casa Nube, Laura or $1,255 the live frame says what the fixture holds (QA
Journeys, Nadia Varela, $31.25). Nothing was written on any tenant: every
frame is read-only, and the Collect sheet was opened but never continued.

**Branch.** `work/fid-mobile` off `program/fidelity`. Nothing pushed;
production never read or written; `npm run db:push` never run.

**Not forked.** No route or component was duplicated for the phone. The
phone's look is responsive classes (`max-[720px]:`, the shell's own
breakpoint) on the existing components, one `MobileChromeStyles` sheet for
what the shell owns (the identity bar's height, the notifications popover and
the record sheets becoming bottom sheets), and five small shell modules:
`MobileTopBar` (MW00's bar, drawn by the identity bar below 720px),
`WorkspaceSwitchSheet` (MW01), `MobileSheet` (the bottom sheet, card, row,
pill, chip and action-bar primitives every phone screen shares),
`mobile-header-store` (a record page publishes its back header; the identity
bar draws it, the same shape as the Overview's snapshot store) and the
`MobileBottomNav` rewrite. A record page's decisive action rides
`MobileActions`, the fixed 50px bar above the tabs.

## Boards

| Board | Verdict | Live frame | What differs, and why |
|---|---|---|---|
| MW00_MobileNav | **matched** | `MW00.live.png` | Bar: Today · Calendar · Clients · Sales · More from the registry (D-POS-67), 44px pill on the active tab, badge on Messages in the sheet. More sheet: grabber, the workspace row with the role, groups Operate · Sell & manage · Relationships · Money · Grow as chips (the four on the bar are not repeated), Search · Notifications · Open POS, "Settings · owner only", Send feedback. Differs: the board's workspace row says "Casa Nube · Centro" (a location); ours says the workspace (D-POS-18). |
| MW01_WorkspaceSwitch | **partial** | `MW01.live.png` | Workspaces from `actionLoadUserWorkspaces` with role · plan and the `Current` pill; the note sentence. Locations is one disabled row (the workspace itself) with the reason: no locations table (D-POS-71). The fixture owner belongs to one workspace, so the list has one row. |
| MW02_OwnerToday | **matched** | `MW02.live.png` | Greeting, "date · N arrivals · N things need you", three numbers (Collected · Due · Arrivals; Open orders and Exceptions stay desktop-only), NEEDS YOU as an eyebrow over a card of rows with a toned chip and the action as a line, the first five rows then "N more in Issues", Today as the next card. Every number is the reader's. The board's "Next up" list is the Today card (Arrivals · Classes · Tables tabs). |
| MW03_IssueDetail | **matched** | `MW03.live.png` (+ `MW03.list.live.png`) | The Issues list as one card of rows with the severity pill; a row opens the sheet: the severity and owner over the detail, Since · Attempts · Who owns it, WHAT YOU CAN DO with the resume verb (its sentence) and Open, the primary action 50px in the footer. Copy is the queue's own words, not the board's Mercado Pago sample. |
| MW04_IssueResolved | **partial** | (no separate frame) | After a resume the sheet shows the runner's answer as a note and "Back to the list"; the row keeps its result, as the desktop does. Not exercised live: pressing the verb writes (arms a worker), and live-tenant QA writes nothing. The board's "Resolved by · Notification · Receipt" facts have no reader on an exception row. |
| MW05_Search | **partial** | `MW05.live.png` | Full-screen search: the 48px brand-outlined field, groups as cards with counts (Clients · 8, Sales · 8 ...), rows with a chevron. Differs: the overlay covers the top bar rather than sitting under it; the results are what the RLS-scoped reader returns for "qa". |
| MW06_ClientRecord | **matched** | `MW06.live.png` | Back header "Name / Client", initials + name + contact line, three 40px icon buttons (tel:, mailto:, new booking; disabled with the reason when there is no phone or email), Due now · Next booking, the tab chip strip, Upcoming and Recent as cards, Collect $X on the fixed bar. Active projects and the right column fold away (Details tab shows the column). |
| MW07_ClientCollect | **matched** | `MW07.live.png` | The W44 sheet as a bottom sheet: grabber, Unpaid records (stacked on the phone), Allocation, the note, then Continue to payment · $X, Send payment link (disabled, D-POS-27), Cancel, each 50px full width. |
| MW08_LinkSent | **not wired** | | No sender for a payment link (D-POS-27); the result banner has nothing to report. |
| MW09_ProjectsList | **matched** | `MW09.live.png` | "Projects" with the "Needs action · N" pill beside it, the segment chips scrolling with a fade, the search field, one card of rows: project · client, deadline · due, the status pill. The header buttons (From inquiry or offer, New project) wait on the desktop; owner/status/deadline filters are hidden on the phone (owner is D-POS-44 anyway). |
| MW10_ProjectDetail | **matched** | `MW10.live.png` | Back header "Client · Project / Projects id", title + status pill, meta line, Agreement · Collected · Due now · Remaining as a 2x2, the approval banner when a milestone waits, the tab chips, Upcoming milestones and Blockers, the one primary action on the fixed bar. |
| MW11_RecordApproval | **partial** | | The approval banner's "Record verbal approval" is the engine's writer (`approveProjectDeliverable`); the board's sheet (Approved by · How · Note) has no columns to write, so the button writes the approval without them. Not pressed live (writes). |
| MW12_ApprovalResult | **partial** | | After an approval the banner reads "M due now" and the action bar offers Collect; the payment-link half is D-POS-27. Not exercised live (writes). |
| MW13_Agenda | **matched** | `MW13.live.png`, `MW13.calendar.live.png` | Appointments & Classes: the view chips (Appointments · N, Sessions, Series, Waitlist) and one card of rows "time · client · service / professional · place" with the state pill. The Calendar page opens on the agenda on a phone (month grid is unreadable at 390) with rows "time · who / date · kind" and a state pill. The board's per-professional chips (Dani · Ana L. · Vale · Rooms) have no filter on the reader. |
| MW14_Appointment | **matched** | `MW14.live.png` | The appointment panel is a bottom sheet over the list (scrim closes it): the facts card (When · Serving · Room · State · Venue clock) and the Actions grid: Move it, Open the booking, Add a service and Cancel disabled with their reason (D-POS-35). |
| MW15_Reschedule | **partial** | | "Move it" opens the move form inside the same sheet (a datetime field on the venue's clock, the RPC's refusals as sentences). The board's slot grid per chair is not built: no slot reader exists for a phase model (D-POS-2). Not exercised live (writes). |
| MW16_RescheduleDone | **partial** | | The move form's success sentence ("Moved to ...") in the sheet; not exercised live (writes). |
| MW17_OrdersQueue | **matched** | `MW17.live.png` | "Orders" with the intro, the bucket chips scrolling, the per-currency totals card, one card of rows "#id · customer / N items · channel · total · still owed" with the status pill; the totals scope sentence stays. |
| MW18_OrderDetail · MW19_OrderReady · MW20_OrderHandoff | **not wired** | | No route renders one order and nothing records a handoff (D-POS-68); a row opens its conversation when it has one. |
| MW21_CatalogFind | **matched** | `MW21.live.png` | Segments as chips, the phone-scope note ("Full editing ... is on desktop"), one card of rows "item / type · price · availability · channels" with the status pill. Type/location/channel filters and Incomplete only stay as stacked chips. |
| MW22_ItemEssentials | **partial** | `MW22.live.png` | Back header "Item / type · id · state", the tab chips, the Details tab's fields, Save on the fixed bar (Publish + Save draft while unpublished). Differs: the board's compact "Availability · On hand ± · Price · Name · Preparation" card is not built; the phone shows the same seven tabs the desktop editor has, one at a time. |
| MW23_ItemSaved | **partial** | | The fixed-bar button reads "Saving" then "Saved" from the editor's own state; not pressed live (writes). |
| MW24_LayoutOnMobile | **partial** | `MW24.live.png` | The Tables page at phone width: one column of table cards with their state pill and Seat party / Open tab. The board's floor map, versions list and block/unblock have no reader on this page (the layout editor is D-POS-3). |
| MW25_TicketsOnMobile | **partial** | `MW25.live.png` (+ `MW25.list.live.png`) | The events list as phone rows (event · next night / nights, the state pill); the event detail with section chips and the Tickets tab: capacity · sold · remaining · holds as three-up cards, the ticket-type rows. Differs: the ticket-type rows and the Event day card keep the desktop grid; pause/limit per type is the desktop's control. |
| MW26_MyWorkStart | **partial** | `MW26.live.png` | `mywork` is `built: false`; the More sheet's chip opens the sheet with the sentence in three languages (D-POS-69). The fixture owner is not a professional, so the chip is absent in the frame (the frame shows the sheet it lives in); the sheet itself is `dashboard.mobile.myWork.*`. |
| MW27-MW31 (assignments, conflict, earnings) | **not wired** | | No reader or writer (D-POS-69). |
| MW32-MW34 (invitations, states) | **not wired** | | The invite link redeems on GET and redirects; there is no pending-accept state to draw (D-POS-70). |
| MW35_Notification | **partial** | `MW35.live.png` | The bell's popover is a bottom sheet on the phone with Action needed · Updates · System groups and Mark all read. Differs: the board's filter chips (All · Needs action · Money · People) and the "marked read when opened, resolved when done" rule are not on the hub. |
| MW36_LinkStates | **not wired** | | Those states are answered by the routes that own them (D-POS-70). |
| MW37_FormKeyboard | **partial** | | The counter's New customer sheet (`POSCustomerCreateKeyboard`, fidelity-counter) is the form; not re-shot here. |
| POSHandheld | **partial** | `POSHandheld.live.png` | The counter at 390: the phone's 52px top bar, the mode pill, search, category chips, tiles two across, the basket as the bottom sheet with Charge. The board draws the Tables mode's seat chips and course rows; on the counter those are the basket. |

## Not wired (recorded in decisions.md)

- D-POS-67: the bar's four tabs follow the board; role-invariant.
- D-POS-68: an order has no record page; Mark ready / Hand over are not drawn.
- D-POS-69: My work is the sentence; MW27-31 have no reader.
- D-POS-70: invitations and link states are the routes' own answers.
- D-POS-71: one location, the workspace itself.
- Also: a per-client payment link (D-POS-27), the client editor (D-POS-41),
  the per-professional agenda filter, the slot grid for a reschedule
  (D-POS-2), the floor map on the phone (D-POS-3), the notification filter
  chips.

## Copy

Every new sentence is in `web/messages/{en,es,fr}.json` under
`dashboard.mobile.*` (the bar, the switch sheet, My work, the back and close
labels), `dashboard.overviewBoard.kpi.collectedShort/balancesShort` and
`needsYou.moreOnPhone`, `dashboard.issues.sheet.*`, `dashboard.catalog.list.phoneScope`
and `dashboard.catalog.editor.save`. The registry's own words (rail labels,
group names) still go through `dashboard-i18n.ts` as before.

## Tests

- `src/lib/workspace/destinations.test.ts` and
  `page-modules/mobile-bottom-nav.static.test.ts` pin the new bar order
  (Today · Calendar · Clients · Sales); the inline-style ratchet on
  `MobileBottomNav.tsx` went from 13 to 9 attributes (the talent branch's).
- `e2e/journeys/appointments-and-classes.spec.ts` reads
  `[data-testid=appointment-state]`, which stays on the desktop row; the
  phone row carries `appointment-state-phone` so a mobile project sees one
  pill per row, not two.
- The workspace nav's class sheet moved to `mobile-nav-css.ts` so
  `MobileBottomNav.tsx` stays under the 800-line cap; the static test reads
  both files and asserts the component renders the sheet.
- Gates (private tsc lane, 2026-09-11): typecheck exit 0, lint exit 0 (the
  suppression count for MobileBottomNav pruned 13 to 9), test:design-system
  108 pass, test:tenant-isolation 609 pass, test:size-ratchet 173 pass,
  test:phase1-i18n 20 pass.
- Playwright, `--project=mobile-checkout --workers=1` against the local dev
  server: C05 `CUS smoke` and `OP smoke` passed on the warm run (2 passed,
  5.7m). C06's cases and the POS counter spec did not pass here: C06's
  helpers refuse a Playwright shell without the isolated database exported
  and the cold routes exceeded the 30s `page.goto` budget on the loaded
  machine; the POS counter spec enters through the top bar's POS switch,
  which was `hidden md:inline-flex` before this branch, so it cannot pass on
  a 390px project (the phone enters through the More sheet's Open POS row).
  Logs: scratchpad `fid-mobile-pw-mobile*.log`. The coordinator's load
  rule then stopped further runs.

## Environment notes

Two of the Catalog group's findings repeated here: the plain host proxy
drops the HMR websocket (the ws-forwarding one is used), and after Next's
"approaching the used memory threshold, restarting" every route answers 404
until `.next` is moved aside and the server restarted (twice this session).
