# fidelity-polish4: the second pass on People

**Group.** People (one person, three hats): the four views of the list
(W27 Talent, W29 Access, W30 Bookable, and Everyone), the person sheet
(W28, W34) with its Bookable hat and hours (W11), Add a person (W32), How it
fits together with the two section maps (W26, W33, W35), Settings › Roles &
limits (W22) and the service's Who performs (W31). Each folder holds
`board.png` (the board rendered at 1440x900, copied from `fidelity-people/`)
and `after.png` (this branch on a local `next dev` at port 3172, proxied as
the registered host `qa-journeys.local` on 3173 against the isolated
database `qa-journeys`, signed in as the fixture owner through
`/api/dev/signin`, the dev-only identity banner hidden). The first pass's
`<Board>.live.png` in `fidelity-people/` is the "before".

**Branch.** `work/fid-polish4` off `origin/main` (`ccd501505`). Production
was never read or written; `npm run db:push` was never run; nothing was
written to the isolated database either (every frame is a read; the one
`details` element that reveals the hours editor was not saved through).

## Method

Board and live at the same viewport, element by element, the differences
listed before anything changed (grid, spacing, type, colour, borders,
copy, states), then measured back with `getBoundingClientRect` until the
number was the board's. The kit rules polish3 landed (PR #1997) are applied
here: 1.2 line-height on every row, 26px page titles, 24px KPI figures,
sheets hung under the 56px top bar.

## What changed, shared (`admin/people/people-ui.tsx`, `PeopleClient.tsx`)

| # | Before | After |
|---|---|---|
| 1 | 22px page title; the admin body's 1.65 line-height on every row. | 26px title on a 13px line; `leading-[1.2]` on the page, the tables, the sheet. |
| 2 | Tabs 40px, table heads 40px, rows 46px. | Tabs 36px (13.5px, `py-[9px]`), heads 33px, rows 38px (`py-[11px]`); the row's `···` is 16px so it no longer sets the row. |
| 3 | Stat tiles 60px with 22px figures. | 48px with 24px figures (`py-[9px]`). |
| 4 | Status a compact chip; "Access only" a grey chip. | The board's block pill (`BlockPill`: 17px, fills its column, label left) for a list cell; "Access only" plain muted words. |
| 5 | Key/value rows right-aligned and medium weight (`FactRow`). | `KeyValue`: muted label, semibold value left-aligned inside its box (W26's cards, W32's combinations at 37px). |
| 6 | The "You're on this list too" bar 48px, on every tab. | 40px, on Talent and Everyone only: W29 and W30 draw none. |
| 7 | Native selects with the browser's arrow. | `SelectShell`: the kit's chevron over an `appearance-none` select (W26's customer word, W31's three rules). |

## Per board

| Board | What changed | Still differs |
|---|---|---|
| W27_PeopleTalent | Cards on the board's 100px headshot area with a soft tint per person (hashed from the key, stable), the eye glyph (site-visible) top right, the code bottom right, 10px body inset, 14px name, 10.5px uppercase types, the two hat chips on one line; the header 6px closer to the tabs. | The board's "114 / 30" badge has no reader; the state pill sits top left instead. The fixture's profiles have no type, city or headshot, so the cards read "No type yet · No city yet" and an initial. |
| W29_PeopleAccess | Rows 38px under a 33px head; Status the block pill; "Access only" plain words; PIN reads the board's "Set" / "Not set" in the row's ink. | LOCATIONS reads "All" and DRAWER a dash (each cell's title says what is not tracked, D-POS-37); the fixture has two Access rows, both Active. |
| W30_PeopleBookable | The same kit; no "you're on this list too" bar (the board has none here). | BUSY/FREE, POS PERMISSIONS and PAY are dashes with their reason; "Contractor" as a hat never appears (nothing models one). The fixture's ten stylists have no services or hours of their own. |
| W28_PersonDrawerBookable | The sheet hangs under the 56px top bar on a white body; the header's 16px name with a monospace code and a 12px meta line; the hat strip 48px with each hat's own dot colour; **the board's left column**: the sections of each hat as anchors (Status · Services here · Hours & locations · Requirements · Limits · POS permissions · Pay) with a lit dot where the hat is on, and "Reads from Public profile" under them; the catalog card's uppercase heads and 44px offering rows; "+ Add from catalog" with the plus glyph. | The three hats are still stacked sections under one strip (the Playwright cases assert two hats' state at once, so the strip does not switch bodies); the board's "Earned" strip (skills verified, trust badge), the catalog rows with skill and verification, and the header's Update/undo are the profile editor's, not re-read here. |
| W11_RosterAvailability | The Bookable hat's Hours & locations is the board's table: DAY · HOURS · BREAKS on 34px rows, Monday first, `09:00–18:00` or `Off`, read from the stored `talent_booking_hours` row. The editor (the same `BookingHoursCard` the talent Calendar settings mount, `saveBookingHours`) sits under "Edit hours"; it reports what it loads or saves (`onHoursChange`) so the table above never disagrees with it. | One hours column, not one per location (hours per location are not stored, said above the table); BREAKS is a dash (not stored, the cell's title says so); Exceptions, eligible services, guaranteed bookings, processing time, private work and mobile services have no per-person reader. |
| W32_AddPerson | 13px field labels 8px over 34px inputs; the picked hat card tinted in its hat's colour (royal / green / brand) with a matching border; 15px card titles; the combinations on 37px rows; the "Next:" line 12.5px. | Continue is disabled with its sentence until a name and a workable hat are picked (the frame shows "Bookable" alone: no door yet, D-POS-37). |
| W26_PeopleModel | Cards on a 16px inset with a 40px avatar disc, 13px lines at 1.4, `KeyValue` rows ("Who edits", "Read by", "Hats here", "Elsewhere"), the Home line bolding the path as the board does; the customer word's selects under the kit's chevron. | "Elsewhere" is a sentence (the board's "Impronta: Public profile" needs a cross-workspace reader); the customer-facing word stays disabled (not stored). |
| W33 / W35 (section maps) | 12px rows at 1.15 on 9px insets (`MAP_TD`, the map's own cell: the page's 13px `TD` won the cascade over an appended `py-[9px]`), the section name semibold, the columns at 15 / 31 / 12 / 22 / 20%. | The first map is 673px tall to the board's 492: the board's cells are set a half-point smaller and wrap one line less per row. |
| W31_ServiceWhoPerforms | **A defect found on main:** the catalog re-skin (merge `896d7f18bd`) dropped the page that mounted this block, so since 2026-09-11 nothing rendered it. It is now the item editor's own tab, `Who performs`, between Options and Availability (`ITEM_TABS` gains `who`; `tab=who`), as the board draws it. Rows 38px, the head 33px, "+ Add a professional" a grey pill with the plus glyph, the three rules under the chevron. | The list is the same for every item (a service names no skill yet) and says so; requirement and pay are dashes; the right column is the Availability tab's POS behaviour card, not the board's "Pick a stylist" preview. |
| W22_SettingsRoles | 34px rows under a 33px head (12.5px at 1.2); "All" where a role reaches every built mode (the board's word) instead of the list; the role names alone in the head (the member count moved to the "who holds each role" strip and the head's title); the untracked rows dimmed with the reason once, in a footnote under the matrix, instead of a second line in every row; the facts' values semibold. | The section title is 20px under the settings column's own 18px "Roles & limits" heading (the board's 26px is a page title); the ladder is Owner · Admin · Manager · Editor · Viewer (cashier / server / host / kitchen / gate are not roles the engine has); no per-action limit exists to draw. |
| W34_PersonDrawerPublic | The frame (header, strip, left column). | The editor inside is the existing `talent-profile-shell` drawer, unchanged, and out of this group. |

## Copy (en, es, fr)

Changed: `admin.people.board.cell.pinNone` ("Not set"). Added:
`admin.people.sheet.nav.*` (9), `admin.people.sheet.hoursTable.*` (6),
`dashboard.adminWorkspace.rolesLimits.cell.all`, `dashboard.catalog.tab.who`.
`npm run verify:ui-messages` exit 0.

## Gates (real exit codes)

| Gate | Exit |
|---|---|
| `npm run typecheck` (the machine-wide tsc queue; dev server stopped) | 0 |
| `npm run lint` | 0 (after one `react-hooks/refs` fix in `BookingHoursCard`: the callback ref is written in an effect, not during render) |
| `npm run verify:ui-messages` | 0 |
| `tsx --test src/lib/people/hats.test.ts` | 0 (23 pass) |
| `tsx --test …/catalog/catalog-model.test.ts` | 0 (13 pass) |
| `tsx --test src/i18n/message-key-usage.static.test.ts` | 0 (5 pass) |
| `tsx --test src/i18n/message-catalog-duplicate-keys.static.test.ts` | 0 (3 pass) |
| `tsx --test src/lib/quality/file-size-ratchet.static.test.ts` | 0 (72 pass) |
| `…/people-invitations.test.ts` + `role-members.test.ts` + `pos/modes.test.ts` (with the lane's `register-server-only-test.cjs`) | 0 (19 pass) |

No selector the Playwright cases use was renamed (`person-sheet`,
`person-hat-strip`, `person-bookable-toggle`, `person-hours`,
`people-*-table`, `people-add-*`, `roles-limits-*`, `who-performs*`,
`data-people-row`, `data-people-card`, the `h3` inside a `div` inside each
hat's `section`); the cases were not re-run here (one heavy process at a
time, and the dev server and the typecheck were it).
