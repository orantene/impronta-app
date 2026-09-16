# fidelity-polish3: the second pass on Projects, Clients and Collect

**Group.** The workspace's Projects list and record with its tabs and
sheets (W45, W42, W46, W47, W48, W49, W50, W51), the client record and its
collect sheet (W41, W44, Customer), and the POS Collect mode's own screens
(O03, O07, POSOffice, POSPaymentLink). Each folder holds `board.png` (the
board rendered at its viewport, 1440x900 workspace, 1194x834 POS, copied
from `fidelity-projects/`) and `after.png` (this branch on a local `next
dev` at port 3170, proxied as the registered host `qa-journeys.local` on
3171 against the isolated database `qa-journeys` /
`fxlankepwnvelxjrahwk`, signed in as the fixture owner through
`/api/dev/signin`, the dev-only identity banner hidden). The first pass's
`live.png` in `fidelity-projects/<Board>/` is the "before".

**Branch.** `work/fid-polish3` off `origin/main` (`371547345`). Production
was never read or written; `npm run db:push` was never run. The one write
the frames needed was a milestone (`Final edits`, due 26 Sep) added through
the screen's own `Add milestone` on the fixture project
`3f4aef11-6cd1-40f4-b4ce-1648158c8001` of the isolated database, and
deleted again after the frames (read back: zero deliverables).

## Method

Board and live at the same viewport, element by element, with the
differences listed before anything was changed (layout, spacing, type,
colour, borders, copy, states, what was missing, what the live had that
the board did not), then measured back (`getBoundingClientRect`,
computed line-height) until the number was the board's. The rule for
money: the platform has ONE money formatter (`lib/orders/money-format.ts`,
"there must not be a second") and the Playwright specs assert `$5.00`
style figures, so the boards' whole-dollar `$12,000` is NOT copied; every
figure keeps its cents. That is the one difference deliberately left on
every board below.

## What changed, shared (`admin/projects/_shared.tsx`, `_sheet.tsx`)

| # | Before | After |
|---|---|---|
| 1 | Line-height 1.65 inherited from the admin body on every row, pill and note. | `leading-[1.2]` on the page shells; rows measure the board's 40px (list), 33px (header), 29px (key/value column), 35px (key/value in a sheet). |
| 2 | 22px page titles, 24px record titles. | 26px, as the board's `Projects` / `Brand shoot & launch host` / `Laura Méndez`. |
| 3 | 22px KPI figures on a 14px inset. | 24px figures on the board's 16px inset. |
| 4 | Every status a 22px compact chip. | A list cell's status is the board's block pill: 17px tall, fills its column, label left (`Pill block`). The compact chip stays beside a title. |
| 5 | Dates read `Sat, Sep 26, 06:00` (en-US) or `2026-09-10` (ISO, POS). | Day first as the boards print it: `Sat 26 Sep 06:00`, `10 Sep`. en-GB would say `Sept`, so the parts are reassembled, not the locale swapped. es/fr unchanged. |
| 6 | Right column 320px inside the main column's rule at 28px. | 280px, 30px past the rule: the main column measures the board's 822px at 1440. The column still ends 8px short of the board's 1420 because the shell's `<main>` is 1200px wide. |
| 7 | Sheets covered the shell's top bar; 16px title; `Back` under every sheet. | Hung under the 56px top bar as the boards draw them (full height on the phone); 17px title; `Cancel` on W44 and W48, `Back` on W50 as each board says. |
| 8 | Notes were a grey box of text. | `SheetNote` carries the board's warning glyph; the POS note and the W42 banner too (`TriangleAlert` instead of a typed `!`). |
| 9 | Row doors were 24px, pushing rows to 49px. | 16px; a text row is 40px. |

## Per board

| Board | What changed | Still differs |
|---|---|---|
| W45_ProjectsList | Intro is the board's `Commissioned work from inquiry to closure`; the three filter chips are white 26px pills with one chevron (the native select arrow gone); the search box a 28px hairline pill; the reference sits in the title's ink and weight (`… · 3f4aef11`); the status pill fills its column; the `Dates are shown …` footer line the board lacks is now for screen readers only. Rows 40px, header 33px. | `New project` is disabled (D-POS-35, no writer); Owner reads a dash (D-POS-35); money keeps cents; the fixture's titles are `<name> — booking` and its statuses all `Confirmed`. |
| W42_ProjectRecord | 26px title; 24px KPI figures; the approval banner carries the warning glyph with 15/12.5px lines; tabs read `Scope & agreement` and `Milestones & deliverables`; milestone rows carry the block pill; activity rows on the board's 92px date column; `1 record paid` singular; the right column at 280px with 16px card insets. | The breadcrumb is the shell's (`Projects`); the Dates card keeps its one-line time-zone sentence (the board has none; a reader needs it); the fixture has no owner, no start date and no client organisation. |
| W46_ProjectAgreement | Version strip reads `v3 · accepted (current)`; 14.5px card titles; `$800.00 · 1 milestone` singular; day-first dates. | No `by <name>` on the accepted title (the record has no acceptor name); cancellation and usage rights `Not recorded on the agreement`; the fixture has one version so the proposed and superseded chips are not in the frame. |
| W47_ProjectMilestones | Title `Milestones · sum to the agreement`; `+ Add milestone` is the board's grey ghost button with the plus; the revisions line (`0 of 1`) is told only once a revision has been used, so a fresh row is one line like `M1 · Agreement signed`; the status is a block pill; the passthrough sentence prints only when a row is a passthrough budget. | One list, not the board's two (milestones and deliverables are one table, D-POS-37); no `Edit` of a title or date; `Upload` on an open row is the live's extra over the board's row; the amount is a dash until set. |
| W48_ProjectTeamReplace | The sheet hangs under the top bar; the select is 34px with the board's chevron and an honest hint under it (`Everyone on the workspace's roster is listed; availability is checked when you confirm`); impact rows 35px; the note carries the glyph and no longer says the replacement "is not editable from this screen yet" (it is wired); `Cancel`; `Replace and invite <name>` once a person is chosen; the `Fee and charge are shown together` sentence and margin note under the Assignments card are gone as the board has none. | The board's `Loba free ✓` on the schedule row is the engine's answer after the click; the fixture has no date, so Schedule reads `No date set`; the confirm stays disabled until a replacement is chosen (the frame shows that state); not confirmed. |
| W49_ProjectMoney | Money rows on the board's four columns: date (the order's `created_at`, now on `ProjectBalance.createdAt`), record and status, amount, block pill; the three secondary actions on one row; the extra `Collect the balance` button the board's Money tab lacks is gone (the header keeps the primary); the fee row on one line; the time-zone sentence stays with the Dates card only. | `Record bank transfer` and `Send payment link` disabled (D-POS-27); the board's `M1 deposit · card ·· 4242` is a payment method no balance row carries; the fixture's rows are five cancelled test orders and the one owed. |
| W50_ProjectClose | Outstanding rows 35px; the first available closure (`Cancel`) is selected when the sheet opens so the footer names it as the board's does; `Reopen later` shows the board's dash instead of repeating `Only for closed projects`; 12.5/12px body and foot lines; `1 milestone open` singular. | The selected card draws its brand border and filled radio (the board leaves the radio empty while naming `Cancel project…`); not pressed. |
| W51_ProjectVisibility | `Who sees what on this project`; columns `OWNER · MANAGER`, `ASSIGNED TALENT`, `CLIENT (PORTAL)`; no access is `—`; rows 40px. | The sentence under the table is the live's (the board has none; it states why there is no per-project override). |
| W41_ClientRecord | 26px name; upcoming and project rows carry the block pill on a 122px date column; `1 unpaid record` and `1 line` singular; side cards on a 16px inset with 35px preference rows. | `Edit` disabled (D-POS-41); preferences `Not recorded`; the fixture has no phone, locale, participants or intake; `Recent activity` says `Most recent first` because the list is the five newest, not the board's `Last 30 days`. |
| W44_ClientCollectSheet | Under the top bar; `1 record`; allocation rows 35px; the note with the glyph; an unticked record's amount dims; `Cancel`. | `Send payment link` is live only for one ticked record (D-POS-40); the fixture has one unpaid record so the second, unticked row is not in the frame. |
| Customer | The same kit on the `Purchases & balances` tab. | Superseded by W41; `Relationships`, `Who sees what` and `Consent & preferences` have no reader (D-POS-41). |
| O03_InquiryToBooking | **A defect found on main:** the four steps and the `MONEY · KEPT DISTINCT` strip were nested inside the amendment block, so they rendered only while a proposal was out with the client (the first pass's frame predates that nesting). Moved out; they draw on every open project again. 17px step titles on a 24px disc; block pills; dates `10 Sep` not `2026-09-10` (the locale now reaches the client); 18px semibold tiles. | The board is one project full-width in a `Client work` mode; the live keeps the Projects list on the left and the steps 2x2 in the right pane; `Earned so far` reads `Not recorded` and `Paid out` `Not read here` (D-POS-43). |
| O07_ProjectCollect | 56px search with 16px words; cards 16px apart with 16/13px lines at 1.2; the note's glyph; the doors at 48px; `1 milestone` singular. | The `WHERE THE FIGURE COMES FROM` card under the facts is the live's (the spec asserts its rows); `Send payment link` and `Record a bank transfer` disabled; the mode chip reads `Collect`, the board's `Projects`. |
| POSOffice | The same landing with nothing open: segments, search, the rule. | The right pane's milestone breakdown with amounts cannot be drawn; `Other seller` and `At load-in` are states no record carries. |
| POSPaymentLink | Rows 77px with 16.5px titles; the open link's `Resend` is the outlined forest button; the rule carries the check glyph. | `sent`/`expires` show the clock only (`01:16 PM`): the counter's `formatClock` has no workspace zone on this page, the board writes `8 Sep 10:12`; `Bank transfer recorded · checking` is a state no link carries. |
| O06_Amendment | Day labels only. | Needs a sent amendment seeded on the isolated database for a frame (the first pass seeded and reverted one); not redone here. `Send vN` / `Discard proposal` disabled (D-POS-43). |
| W43, W19, O04, O05 | Nothing. | Not built (a documentation page; settings with no table; the talent and client surfaces outside this group), as the first pass records. |

## Copy (en, es, fr)

Changed: `dashboard.projects.pageIntro`, `tabScope`, `tabMilestones`,
`scope.version`, `milestones.sumTitle`, `visibility.title`,
`visibility.audienceStaff`, `visibility.audienceProfessional`,
`visibility.audienceClient`, `team.replaceNote`, `team.replaceConfirm`.
Added: `team.replacementHint`, `close.cancelSheet`, `scope.valueDetailOne`,
`kpiCollectedNoteOne`, `close.milestonesOpenOne`,
`clientRecord.selectedRecordOne`, `clientRecord.collectSummaryOne`,
`clientRecord.lineOne`, `pos.projects.board.totalDetailOne`. Deleted (dead):
`dashboard.projects.team.marginNote`. `npm run verify:ui-messages` exit 0.

## Gates (real exit codes)

| Gate | Exit |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (dev server stopped) | 0 (run on the final tree before a comment-only two-line fold in `project-record.ts` that lint asked for; no type changed after it) |
| `npm run lint` | 0 (after the fold: the file sat at 801 lines, the cap is 800) |
| `npm run verify:ui-messages` | 0 |
| `tsx --test src/lib/projects/project-record.test.ts` | 0 (21 pass) |
| `tsx --test src/lib/customers/client-record.test.ts` | 0 (7 pass) |
| `tsx --test …/_projects/projects-mode-model.test.ts` | 0 (17 pass) |
| `tsx --test src/i18n/message-key-usage.static.test.ts` | 0 (5 pass) |
| `tsx --test src/i18n/message-catalog-duplicate-keys.static.test.ts` | 0 (3 pass) |
| `tsx --test src/lib/translation/phase1-invariants.test.ts` | 0 (9 pass) |
| `tsx --test src/lib/pos/pos-page-wire.static.test.ts` | 0 (12 pass) |
| `tsx --test src/lib/quality/file-size-ratchet.static.test.ts` | 0 (72 pass) |
| `tsx --test src/lib/pos/booking-shell.static.test.ts` | 0 (8 pass) |

No selector the Playwright cases use was renamed (`data-pos-project-row`,
`data-pos-projects-*`, `data-project-*`, `data-client-*`, `data-team-*`
and `data-milestone-*` are as they were); the cases were not re-run here
(the runtime rule allows one heavy process, and the dev server and `tsc`
were it).
