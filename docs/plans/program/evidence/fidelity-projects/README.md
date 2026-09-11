# fidelity-projects: PROJECTS, CLIENTS and the POS COLLECT mode, board by board

**Group.** The workspace's Projects list and record with its tabs and sheets
(W45, W42, W46, W47, W48, W49, W50, W51), the client record and its collect
sheet (W41, W44, Customer), the explainer (W43), the settings board (W19),
the journey boards (O03, O04, O05, O06, O07) and the POS Collect mode's own
screens (POSOffice, POSPaymentLink). Boards live at
`tulala-canvas/v3/<Board>.dc.html`; `board.png` in each folder is that HTML
rendered at the board's viewport (1440x900 workspace, 1194x834 POS, 390x844
mobile), `live.png` is this branch at the same viewport on a local `next
dev` (port 3170, proxied as the registered host `qa-journeys.local` on
3171, isolated database `qa-journeys`), signed in as the fixture owner
through `/api/dev/signin`, the dev-only identity banner hidden. Where the
board says Zen Co., Laura Méndez or $18,000, the live frame says what the
fixture holds (Nadia Varela, $800.00 agreed, $500.00 due).

**Branch.** `work/fid-projects` off `program/fidelity`. Nothing was pushed;
production was never read or written; `npm run db:push` was never run.
Live screenshots and the Playwright run wrote only what the existing spec
writes, on the isolated database.

**What changed.**

- `admin/projects/_shared.tsx` is the board's kit for these records
  (buttons, KPI card, list rows, key/value rows, pills, segments, tab
  strip, initials, the record shell with its 320px column); `_sheet.tsx`
  is the 640px right-hand sheet the boards open (W44, W48, W50).
- `admin/projects/page.tsx` (W45), `[projectId]/page.tsx` (W42 header,
  KPIs, banner, tabs) with `record-tabs.tsx` (Overview, Scope, Money, Files
  & activity, Who sees what), `milestones-tab.tsx` + `milestone-decisions.tsx`
  (W47), `team-tab.tsx` + `team-replace.tsx` (W48), `record-menu.tsx`
  (`More ▾` and the W50 close sheet), `record-side.tsx` (Client · Team ·
  Dates).
- `admin/clients/[customerId]/page.tsx` (W41) with `collect-sheet.tsx`
  (W44) and `purchases-table.tsx`.
- `admin/pos/_projects/`: `collect-screen.tsx` (O07 with POSOffice's
  segments), `projects-screen.tsx` (O03, O06), `links-screen.tsx`
  (POSPaymentLink), the client rewired over the counter's `PosFrame`,
  `PosHeader` and `CollectSheet`; the rail gained `links` and `issues`
  (`lib/pos/modes.ts`).
- Judgements added, pure and tested: `project-record.ts` (`nextDeadline`,
  `overdueDays`, `remainingCents`, `projectListBadge`, three new list
  filters, `closeOptions`, the orphaned-shell rule), `client-record.ts`
  (`nextBooking`, `activeProjects`, `lifetimeSpend`, `purchasesByDate`),
  `projects-mode-model.ts` (`collectSegment`). Two readers added beside the
  existing ones: `loadProjectContact` and `loadProjectActivity`
  (`booking_activity_log`). One clock per request: `request-clock.ts`.
- 372 new sentences in `messages/{en,es,fr}.json`; 55 dead keys of the old
  screens deleted from all three.

## Per board

| Board | Verdict | What differs and why |
|---|---|---|
| W45_ProjectsList | partially | Title, intro, `From inquiry or offer` (to Messages), `New project` (disabled, D-POS-35), the five segments with live counts, Status and Deadline filters and the search box (all through the URL), the row card with Project · Client · Owner · Status · Next deadline · Due now · Remaining and the row's door. Owner reads a dash (no owner on the record, D-POS-35). The status pill is the record's judgement (awaiting approval · overdue N days · offer sent vN · the status). The fixture's projects are the e2e's `Nadia Varela — booking` rows; 18 orphaned `POS sale` shells whose orders were deleted by test clean-up were being listed as projects and are now excluded by the shell writer's own title (`isOrderShellBooking`, tested). |
| W42_ProjectRecord | partially | Title with status pill, the meta line (client, payer, owner, next deadline, reference), `More ▾`, the one primary action (`Collect the balance · $500.00` opens the POS Collect mode on this project), the four KPI cards with their notes, the talent-fees sentence, the client-approval banner (`Record approval given verbally` is live; `Request approval` disabled, D-POS-36), the tab strip, Upcoming milestones · Blockers · Recent activity (from `booking_activity_log`), and the right column. Differs: the shell keeps the page inside its 1180px `<main>` so the right column is not flush to the window edge; the breadcrumb is the shell's (`Projects`, not the client and title); a milestone's amount is a dash (D-POS-37). |
| W46_ProjectAgreement (`live.png`, `live-proposed.png` with a sent v4 seeded on the isolated database and reverted) | partially | The version strip (`v3 · accepted (current)`, proposed, superseded), `Propose change` (a link to the conversation when the slot is free, disabled with the refusal otherwise), the accepted card (`Binding`, the assignment lines left, Value · Coordinator fee · Cancellation · Usage rights right), the proposed-change card with its sentence, `Remind` (disabled, D-POS-36) and `Withdraw on the conversation`, the prior-versions sentence. Cancellation and usage rights read "Not recorded on the agreement". The fixture has one version. |
| W47_ProjectMilestones | partially | `Milestones & deliverables` with `Add milestone` and `Upload` (disabled, D-POS-37), one row per deliverable: title with revisions used, when, amount (dash), pill, `Request changes` / `Approve (client)` on a submitted one (live, the engine's `requestRevision` / `approveDeliverable` with every refusal as a sentence), `Edit` disabled otherwise. One list, not two: the same table is the milestone and the deliverable. The fixture project has none, so `live.png` shows the empty sentence. |
| W48_ProjectTeamReplace | not wired | The Assignments rows (name · role/date/units · fee and charge · `Assigned` · `Replace…`), `Assign from People › Bookable` (to the conversation's lineup), and the sheet with `Replacement` disabled, the five impact rows from the record, the note, `Replace and invite` disabled (D-POS-38). `live.png` is the sheet open. |
| W49_ProjectMoney | partially | Client money rows (record · status · collected · total · Owed/Paid pill), `Record bank transfer` and `Send payment link` disabled (D-POS-27), `Refund…` to the orders desk when something was collected, Collect when owed; Allocation (Collected · Allocated per record · Unapplied $0 · Refunded not read · Remaining under vN); Talent fees · separate (earned / payable / paid as `— / cost / —`) with the sentence. Dates and card numbers on the board's rows are not on an order record. |
| W50_ProjectClose | partially | The sheet from `More ▾` and from the primary action when the project is closable: Outstanding (client money · work · talent), the four choices each with its verdict (`Complete` live via `closeBookingAction`, `Cancel` live via `cancelBookingAction`, `Archive` and `Reopen later` refused, D-POS-39), `Back`, `Complete project` / `Cancel project…`. Every engine refusal is a sentence. The fixture project owes money, so Complete reads its reason and Cancel is the live choice; not pressed in the shot (live-tenant QA writes nothing it does not need to). |
| W51_ProjectVisibility | matched | `Who sees what on this project`, the eight rows over Owner · manager / Assigned talent / Client (portal) in the board's words, reached from Team and from `More ▾`, with the rule's sentence under it. |
| W43_ClientsVsProjects | note only | A documentation page with no route and no data; not built. The rule it states is what W41 and W45 now show (a client with no project has `Active projects · None`; a project's client is a link to the client record). |
| W41_ClientRecord | partially | Initials, name, `Person`, phone · email · locale, `Edit` (disabled, D-POS-41), `New ▾` (to the calendar), `Collect $X`; Due now · Next booking · Active projects with the lifetime-spend note; the six tabs; Upcoming (bookings ahead, with pills) and Recent activity (purchases); Contacts & participants, Preferences, Intake (D-POS-41). Differs: the fixture's client is an e2e customer with no name, so the header prints their email as the name; preferences read "Not recorded". |
| W44_ClientCollectSheet | partially (link wired 2026-09-11, wire-pos-money; frame owed) | `Collect from <name>`, Unpaid records with checkboxes (the first ticked), Allocation (Selected · Tip · Pass or credit · Receipt), the note, `Cancel` · `Send payment link` (live for the one ticked record: the panel mints `/pay/<code>`, copies it, hands it to WhatsApp; the record then carries the MW08 line `Payment link sent · expires … · you will be notified when paid`, a frame owed) · `Continue to payment · $X` (opens the counter on that one sale). One record at a time (D-POS-40). |
| Customer.dc.html (WS061) | superseded | The earlier client-record board for the same route; W41 replaces it in the program. `live.png` is the Purchases & balances tab, the part of this board (timeline of source records, outstanding balance) that W41 carries as a tab. Its `Relationships`, `Who sees what` and `Consent & preferences` cards have no reader (D-POS-41). |
| O03_InquiryToBooking | partially | The POS Projects destination with a project open: the four steps (Inquiry · Offer · Agreement · Project) from the record's own ids, versions and assignments, the `MONEY · KEPT DISTINCT` strip (Quoted · Collected · Talent fees · Earned · Paid out) and its sentence, then the milestones and the door to the workspace. `Earned so far` reads "Not recorded" and `Paid out` "Not read here" (D-POS-43). The board's header is the project's name; the mode's header keeps `Projects` and the project's name sits in the pane. |
| O04_TalentAssignment | not built | The assigned professional's mobile view of their assignment lives on the talent surface (`/talent/inbox`), which is outside this group's routes; nothing was skinned there. |
| O05_CustomerProject | not built | The client's mobile view of their project lives on the client portal (`/client/…`), outside this group's routes; nothing was skinned there. |
| O06_Amendment (`live.png`: a sent v4 on top of the accepted v3, seeded on the isolated database for the frame and reverted; `restored accepted` read back) | not wired | Drawn inside the Projects destination when a version is out with the client on top of an accepted one: `Accepted vN · kept`, `Proposed vN`, `If <client> accepts` (outstanding before → after, the accepted version stays on file), `Send vN` and `Discard proposal` disabled (D-POS-43) beside the door to the workspace. The e2e's step 9 makes and reverts the same state and asserts the refusal sentence. |
| O07_ProjectCollect | matched | The Collect landing: search with `Client · project · reference`, `MATCHES · DUE FIRST` when typing (the segments otherwise), one card per project (name, `ref · agreement vN · collected X of Y`, the amount, `Due · accepted` or the reason), the rule sentence; the open project's `DUE NOW` and `AGREEMENT` cards, `Collect for · Client · Not collectable here`, the records the figure comes from, `Open full project in workspace`, `Send payment link` (disabled), and the footer `<cashier> · Drawer open` with `Collect $X`. `live-collect-sheet.png` is the counter's tender screen it opens; `live-es.png` the same landing in Spanish. Refund terms read "Not recorded on the agreement". |
| POSOffice | partially | Its `Due now N · Later N · Needs approval N` segments and the client-or-reference search are on the Collect landing (`live.png` with nothing open); its right pane's milestone breakdown with amounts cannot be drawn (no amount on a milestone), so the pane is O07's; `Record a bank transfer` is disabled (D-POS-27). The board's `Other seller` and `At load-in` rows are states no record carries. |
| POSPaymentLink | wired, frame owed (2026-09-11, wire-pos-money) | The Links destination lists every link this workspace sent (`listWorkspacePaymentLinks`): who and what for, amount · sent · expires, the state pill (`Opened · not paid` / `Paid` / `Expired` / `Cancelled`), and one action per state (`Resend` copies the same link, `View receipt` once paid, `Send new link` opens the sale once it lapsed), over the board's rule. The Collect screen's `Payment link` tab mints one for the balance (`createPaymentLink`, the counter's `PaymentLinkPanel`, D-POS-71). frame owed. |
| W19_ClientWorkSettings | not built | Offer templates, milestone-due and payment-link-expiry rules, prior-version and talent-fee policies: no table holds any of it and no reader or writer exists, and `/admin/projects/settings` is not a destination the registry knows. Building a page of only disabled controls under an unregistered route would be a fork; recorded here instead, with D-POS-35 to D-POS-43 naming the pieces it would need. |

## Not wired (every one is a disabled control with a one-sentence reason in en, es and fr)

New project · Owner filter and column · Request approval / Remind · Add
milestone / Edit / Upload · Replacement and Replace and invite · Archive
and Reopen · Record bank transfer · Send payment link (record, sheet, till)
· Refund when nothing was collected · Edit client · Send vN / Discard
proposal · Links. Decisions D-POS-35 to D-POS-43 in
`docs/plans/program/pos/decisions.md`.

## Selectors changed in the Playwright cases (never an assertion)

- `POS-projects-collect-a-balance.spec.ts`: the project row is the tap
  target (O07 has no `Open` button), so `row.click()` replaces
  `row.getByRole("button", { name: /^open$/i }).click()` twice; the rail
  assertion gains `Links`.
- `MONEY-manager-reads-the-money.spec.ts`: the client's purchases table is
  the record's `?tab=purchases`; the project's due figure is the `Due now`
  KPI (`figureValue(page, "Due now")`) instead of the old `Still owed by
  the client` figure. Every `toHaveText` / `toContainText` is as it was.

## Gates (private lane, 2026-09-11, real exit codes)

| Gate | Exit |
|---|---|
| `TSC_QUEUE_LOCK=… npm run typecheck` (private lane; verdict `/tmp/tulala-tsc.02a4aa88.last` 2026-09-11T08:15:13Z) | 0 |
| `npm run lint` | 0 |
| `npm run test:design-system` | 0 (99 pass) |
| `npm run test:tenant-isolation` | 0 (609 pass) |
| `npm run test:size-ratchet` | 0 (173 pass) |
| `npm run test:phase1-i18n` | 0 (20 pass; 55 dead keys of the replaced screens deleted, none newly dead) |
| Playwright `POS-projects-collect-a-balance.spec.ts` | 0 on the final run (`runs/pw-POS-projects-collect-a-balance.txt`, 1 passed). Three earlier runs: the first found the Projects destination missing the `agreement_awaiting` sentence and the second its `Collect $X` button (both added, no assertion changed); the third died on a Supabase connect timeout from the test's own insert (`UND_ERR_CONNECT_TIMEOUT`), not on the app. |
| Playwright `MONEY-manager-reads-the-money.spec.ts` | 1, in section 2, the COUNTER seed: `counterRail(page, /^shifts$/i)` waits for a rail row the counter re-skin renamed to `Cash` (fidelity-counter, D-POS-26), and the shift-open form it fills next is now the keypad screen. That half of the spec belongs to the counter group and was not re-run green there either. This group's sections (4, the client record; 5, the project) were probed by hand on the same server with the spec's own assertions: the purchases row `fe79f695 · 1 lines · Paid · $5.00 · $0.00`, the sentence "There is nothing to collect. Every record is settled." on the client, the `Due now` figure as the desk's rule and "Collect the balance" present on the project. |

Run against the local dev server on `qa-journeys` behind the host proxy
(`localhost:3171` presenting `qa-journeys.local`), signed in through
`/api/dev/signin`.

## Fixture findings

- 18 `agency_bookings` rows titled `POS sale` with `order_id` null exist on
  `qa-journeys`: shells whose order was deleted by a test's clean-up. They
  passed the projects reader's shell rule and were listed as projects
  with no client and no date. Excluded now by the writer's own title.
- The projects' titles on the fixture are `<name> — booking`, minted by
  `Create booking`; the board's `Brand shoot & launch host` is the offer's
  own title, which the conversion does not copy onto the booking. Not
  changed here (the writer is the inquiry engine's).

## Package 1 wiring (2026-09-11, wire-pos-money)

Frames owed (rows marked "frame owed"): the machine crashed mid-capture and the coordinator's load rule forbade a dev server afterwards; those verdicts rest on the code, the unit lanes and the flows already driven live before the crash (the counter's custom amount, approval, tip, booking link, payment link and lock; the display's tip; B03). They are owed a fresh `live.png` on the next run.
