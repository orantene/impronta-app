# fidelity-people: People (one person, three hats) against the boards

Group: PEOPLE. Workspace boards at 1440x900: W26, W27, W28, W29, W30, W31,
W32, W33, W34, W35, W11 and W22. Every `*.board.png` is the board's HTML
rendered at that viewport; every `*.live.png` is this branch on a local
`next dev` (port 3180, proxied as the registered host `qa-journeys.local` on
3181, isolated database `qa-journeys`), signed in through `/api/dev/signin`
as the fixture owner, at the same viewport, with the dev-only identity banner
hidden. The rail and top bar are the shell group's; this group skins what
sits inside them.

Where the board's sample data says Casa Nube, Pau, Dani Cruz or TAL-00047,
the live frame says what the fixture workspace holds on 2026-09-11: the
14 people the three-hat reader returns (the owner and viewer with Access; the
Talent, Therapist B and ten "QA Stylist C" profiles with Public profile +
Bookable, their own `talent_offerings` and `talent_booking_hours` rows). The
fixture's rail calls the destination "Team" (its preset label); the page's
own title is the board's. Nothing was written to production.

## Boards

| Board | Verdict | Live frame | What differs, and why |
|---|---|---|---|
| W27_PeopleTalent | **matched** | `W27_PeopleTalent.live.png` | Title + subtitle; Arrange order (the roster grid's own mode, its door) · ··· (opens How it fits together) · Invite · + Add person; the five tabs with the reader's counts (Applications only on a talent workspace, the roster's queue); "You're on this list too (hats); Edit my profile →" from the signed-in account; Used in · 6 (POS: Front desk, Collect · Web: Directory, Public profile, Website talent block, Pitches; the honest list, the board's "Field Services" is not a mode); the four tiles Visible · Hidden · Claimed by the talent · Also Bookable here counted over the listed profiles; the type chips, Hat and Location filters built from the listed profiles; six-up cards with headshot or initial, the site-visible glyph, state pill, TAL code, name, types, city and hat chips. Differs: the board's "114 / 30" hero badge has no reader (it is not a fact the roster card carries) and the state pill sits there instead; type chips read "No type yet" on the fixture's untyped profiles. |
| W29_PeopleAccess | **matched** | `W29_PeopleAccess.live.png` | Roles & limits (→ Settings) · Invite · + Add person; PERSON · ROLE · LOCATIONS · OTHER HATS · PIN · DRAWER · STATUS with Active / Invited / Suspended pills from the membership status; the Used in line (POS: Counter, Tables, Door, Front desk, Collect) and the board's callout. LOCATIONS reads "All", PIN and DRAWER a dash: each cell's title says what is not tracked (D-POS-37). |
| W30_PeopleBookable | **matched** | `W30_PeopleBookable.live.png` | From Talent / From Access (switch to those tabs) · Invite a contractor (disabled: no invitation for a Bookable-only person); Used in · 4; PERSON · OTHER HATS · SERVICES HERE (the person's `talent_offerings`, +N more) · LOCATIONS · HOURS (the `talent_booking_hours` summary: open days and zone) · BUSY/FREE · POS PERMISSIONS · PAY (dashes with their reason; "By role · Owner" where the person has Access) and the two facts cards. "Contractor" as a hat never appears: nothing models one. |
| W28_PersonDrawerBookable | **partial** | `W28_PersonDrawerBookable.live.png` | The person sheet (800px, over the list): header with name, TAL code, account meta, state pill, Open in the roster; the hat strip Public profile · Bookable · Access (· not granted); the three hat sections stacked. The Bookable hat: "Bookable · at <workspace>", the toggle (`setPersonBookable`, or the blanket-allow refusal), "Services we book X for" with the From-our-Catalog head (said not wired), the person's own offerings (title · price · booking mode · visibility / Draft), Add from catalog (disabled), Edit X's offerings (opens the drawer on Booking terms); Hours & locations = the real `BookingHoursCard`; Requirements, Limits, Pay and the four POS permission switches drawn with their sentence. Differs: the board's hats are tabs of one drawer; here the three hats are stacked sections under one strip, because the profile drawer is untouched and opens over the sheet. The "Earned" line (skills verified, trust badge) is not re-read; the catalog rows with skill and verification are not modelled. |
| W34_PersonDrawerPublic | **matched** (frame) | `W34_PersonDrawerPublic.live.png` | The Public profile hat opens the EXISTING `talent-profile-shell` drawer, unchanged inside; the frame around it (sheet header, hat strip, On/Off, Open the profile editor, Turn on/off, what removal leaves) is this group's. |
| W11_RosterAvailability | **partial** | `W11_RosterAvailability.live.png` | The Bookable hat's Hours & locations: the same weekly table and Save the talent Calendar settings write (`saveBookingHours`). Differs: one column of hours, not one per location (hours per location are not stored, said above the card); Exceptions, eligible services, guaranteed bookings, processing time, private work and mobile services have no per-person reader and are the sheet's disabled cards. |
| W32_AddPerson | **matched** | `W32_AddPerson.live.png` | Name · Email or phone · Existing person? (matched by email against the loaded record set, with "Open their record"); the three hat cards with their badge, sentence and "Asks for"; Common combinations; Cancel · the "Next:" line · Continue · <hats>. Continue with Public profile opens the roster's create drawer seeded with the name and address; with Access alone sends `invitePersonAccess` to the address; Bookable alone is refused with its sentence. |
| W26_PeopleModel | **matched** | `W26_PeopleModel.live.png` | `?view=model` from "How it fits together": the Person card and the three hat cards (who edits, read by, home), the examples table drawn from THIS workspace's first six people with the sentence their hats mean and "Professional · name" where bookable, the customer-facing word (disabled: not stored), the two callouts. |
| W33_ProfileToHatsMap1 | **matched** | `W33_ProfileToHatsMap1.live.png` | The section map (1 of 2) under the model, same rows and columns, "Unchanged" in green. |
| W35_ProfileToHatsMap2 | **matched** | `W35_ProfileToHatsMap2.live.png` | The section map (2 of 2), Person and no-hat rows included. |
| W22_SettingsRoles | **partial** | `W22_SettingsRoles.live.png` | Settings › Roles & limits as the board's matrix: ACTION × Owner · Admin · Manager · Editor · Viewer (the live ladder; cashier / server / host / kitchen / gate are not roles the engine has), "Open POS modes" from `modesForPerson`, Request a payment / Mark received / Refund / See private customer fields / Invite · remove / Billing from `roleGrantsCapability`, the untracked rows dimmed with the reason, the two facts cards, who holds each role, Invite team member (the Team drawer), Save disabled. Differs: the settings column is narrower than the board's page, and no per-action limit (≤ $1,000) exists to draw. |
| W31_ServiceWhoPerforms | **partial** | `W31_ServiceWhoPerforms.live.png` | The "Who performs" block under the Catalog items: PROFESSIONAL · OTHER HATS · LOCATIONS · GUARANTEED · REQUIREMENT · PAY over `pickAProfessional`, "+ Add a professional" disabled, the three rules disabled with their sentence. Differs: the board is a per-item editor with tabs (the Catalog group's), and a service is not assigned to a person, so the block is the same list for every item and says so. |

## Readers and writers behind the screens (nothing is mocked)

- `loadPeopleSurface` (now also the roster card facts through
  `loadWorkspaceRosterForCurrentTenant`, `talent_offerings` per person, a
  `talent_booking_hours` summary, the membership status and the signed-in
  operator's own record); `pickAProfessional`; `countPeople` / `talentStats`
  over the record set (`people-views.ts`).
- `setPersonPublicProfile`, `setPersonBookable`, `grantPersonAccess`,
  `setPersonAccessRole`, `revokePersonAccess`, `invitePersonAccess`;
  `BookingHoursCard` → `loadBookingHours` / `saveBookingHours`;
  `openDrawer("talent-profile-shell")` in edit-admin (Public profile, Booking
  terms) and create (Add a person) modes; `loadWhoPerforms` (new, the People
  reader for the Catalog page); `modesForPerson` and `roleGrantsCapability`
  for Roles & limits.
- The rail's People children now carry `?view=talent|bookable|access`
  (`destinations.ts`), lit the way Appointments' children are.

## Not wired (each drawn disabled with a one-sentence reason in en/es/fr)

Invite a contractor; Bookable alone on Add a person; Add from catalog; the
catalog block's Add a professional and its three rules; hours per location;
Requirements checked at booking; Limits on every brief; Pay; the four POS
permission switches; the customer-facing word; Roles & limits' Save and its
untracked rows; the Locations / PIN / Drawer / Busy-free / POS permissions /
Pay columns. Recorded as D-POS-37 in `docs/plans/program/pos/decisions.md`.

## Copy

Every new sentence is in `web/messages/{en,es,fr}.json` under
`admin.people.board.*`, `admin.people.add.*`, `admin.people.model.*`,
`admin.people.sheet.*`, `admin.people.whoPerforms.*`, `admin.people.tabs.*`
and `dashboard.adminWorkspace.rolesLimits.*`. Dead rows the old panel read
were deleted (`admin.people.explainer.*`, the old `add.*` doors,
`subtitle`, `empty.*`, `detail.pickAPerson`, `rolesLimits.posReach*`). The
rail gained the Spanish row for "Access".

## Playwright

`e2e/prove-people-issues.spec.ts`, the People cases, against this branch's
dev server on the isolated database (`playwright-people.log`,
`playwright-people-b-owner.log`):

- the tab strip reads the boards' words with counts (`Talent · N`), and the
  person sheet is an aside so "the dialog" is the profile editor that opens
  over it; every assertion about hats, writes, refusals, the one-row-per-human
  rule and the booking page is unchanged;
- **8 passed**: the rail opens People; the Public profile hat opens the
  existing drawer; the blanket-allow refusal with nothing written; Give
  access → role → Take access away with the roster row untouched and one row
  for the human throughout; no email → no box; an unnamed person is said in
  words; A cannot see B; then B's owner sees B's own person (**1 passed**, run
  separately behind a second host proxy, `qa-journeys-b.local` → :3182);
- **1 could not run on the fixture as it stands**
  (`playwright-people-booking-page-drift.log`): "the bookable hat sets
  booking, and the booking page follows" checks `/book` for "Massage" BEFORE
  it touches the People page, and the public picker lists the first 24
  published offerings by `sort_order`; the fixture's 30-odd `sort_order = 0`
  rows other proofs created push Massage off the page. The same drift the
  appointments group recorded (`fidelity-appts/README.md`), on the page that
  owns `/book`, not on this branch; the hat's own write path is the one
  `setPersonBookable` case the blanket-refusal test exercises and the sheet
  toggle calls (`Turn off` / `Turn on`, `person-bookable-toggle`).
- The spec's screenshots into `prove-people-projects/` were reverted after
  the run; that proof's README describes the frames it was written with.
