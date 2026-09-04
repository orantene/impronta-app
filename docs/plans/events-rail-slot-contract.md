# Events rail slot — contract for the workspace shell

From the Events & Ticketing Manager to the Workspace & Dashboards Director, via the Sessions, Events
& Reservations Director. Companion to `reservations-rail-slot-contract.md` — **read the label section
of both together, because they disagree and one of them has been overruled.**

**My half is done.** The area's logic is applied and live: `admissions`, `events`, tiers on variants,
`admits_per_unit`, mint idempotency and the shortfall view are on main; `check_in`, promo codes and
the lineup are pushed and applied, held only by the promote train. `lib/events/` carries the pure
modules the page reads — `event-policy`, `tiers`, `summary`, `mint-admissions`, `promo`, `lineup` —
with 33+ tests. What is missing is the route and the rail entry, and those files are Dashboards'.

---

## A correction to my own brief, which is why this contract exists

My appointing brief said *"The Events page in the workspace rail (the Dashboards Director added the
slot)"*. **They did not**, and I verified it four ways on `origin/main` rather than assuming:

- no `"events"` in the `WorkspacePage` union (`components/admin/shell/internal/state/types.ts:31-52`)
- no `"events"` in `WORKSPACE_PAGE_SEGMENTS` (`admin/workspace-page-routing.ts:12-25`)
- no `admin/events/` directory among the thirty that exist
- no rail entry

Nobody erred: the brief described an intent as a fact. Recording it because it is the same shape that
has now cost this cluster four round trips, and the rule it produced — *verify the dependency on
`origin/main`, never in the conversation about it* — was written after this exact instance.

## What is needed

| # | Piece | File | Owner |
|---|---|---|---|
| 1 | `"events"` in the `WorkspacePage` union | `internal/state/types.ts` | Dashboards |
| 2 | `"events"` in `WORKSPACE_PAGE_SEGMENTS` | `admin/workspace-page-routing.ts` | Dashboards |
| 3 | Rail entry in `SIDEBAR_GROUP_TEMPLATE`, **`Sell and grow`, immediately after `menu`** | `page-modules/WorkspaceShell.tsx:108` | Dashboards |
| 4 | **An entry in `SIDEBAR_ICON`** | `page-modules/WorkspaceShell.tsx:129` | Dashboards |
| 5 | `admin/events/page.tsx`, in the `menu` shape | `admin/events/` | mine, once 1 and 2 exist |

**Item 4 is not on anyone's list and I only found it by reading the file.** `SIDEBAR_ICON` is a
twelve-entry map whose own comment says *"Complete icon coverage for the rail — PAGE_ICON only maps
the canonical 6."* A segment added without an entry there is a rail row with no icon, which will look
like a rendering bug rather than a missing map entry. Suggested icon: `calendar` is taken by the
calendar and `layers` by the menu; `star` and `send` are taken. If nothing fits, that is a real answer
and I would rather be told than have one guessed.

## Rail label: STATIC, and this is the part that disagrees with Reservations' contract

**`Events` / `Eventos`, hardcoded, from the shell's existing en→es label source.**

Reservations' contract argues the opposite for their slot — that the label should read the workspace
terminology setting. **That was overruled for the rail**, and the reason is not that dynamic labels are
wrong: the rail **names the page**, every existing label is static, and three dynamic labels sitting
beside a dozen static ones is worse than either choice made consistently.

I originally argued the dynamic side myself — a theatre says *Shows*, a tour operator says
*Departures* — and I lost that call for this slot. **It is logged separately as a nav-wide item** for
Dashboards and Front Door together, on the grounds that if it should be dynamic it should be dynamic
for every label rather than for the two newest. **Stated here so a reviewer does not reopen it, and so
nobody reads the static label as an oversight.**

*What I could not verify:* I confirmed `SIDEBAR_GROUP_TEMPLATE` and `SIDEBAR_ICON` by reading them. I
did **not** locate the label map itself, so the claim that all existing labels are static is relayed,
not measured. Worth a glance before it is repeated as fact.

## Visibility — as a rule, not an example

**Show the slot when the workspace has events switched on. Never on workspace type.**

A venue can be a bar that never runs a ticketed night, and a solo talent can run a workshop series.
Workspace type is a two-value flag being asked a sixteen-value question — the same reason a solo
operator receives a fabricated roster today — and a rail full of features a workspace does not use is
precisely what WP1 was cleaning up.

**A workspace with events on and nothing created should still see the slot.** The page explains what
is missing. An empty rail entry teaches an operator the feature is broken; a page that says *"no
events yet"* teaches them what to do next.

## What the route renders

The event list, then seven tabs on a selected event: **Details · Sessions · Tickets · Seating ·
Lineup · Sales · Door**.

Reading from `lib/events/`, all pure and on main or pushed:

- `summariseEvent(tiers, pools)` — sold, held, remaining and gross per tier and for the event.
  **Remaining subtracts held as well as sold**, and a total containing an uncapped tier is `null`
  rather than the sum of the capped ones.
- `saleState(tier, now)` — on sale, scheduled, ended, or hidden. **Hidden is not ended**: a guest-list
  tier is unlisted and still buyable by link.
- `staffLineup(entries)` / `openSlots(entries)` — unanswered invitations first, ahead of confirmed
  acts and ahead of the venue's own sort order.
- `doorCounts(admissions)` — expected, arrived, still to come. **Counts people, not units of
  capacity**: a VIP table for six is one unit sold and six people through the door.

**Two tabs will render empty by design and should say so rather than look broken.** *Seating* has no
layouts or seat maps until Spaces S4/S5 (wave E, behind this area). *Door* needs a public path, which
is gated on the `surface-allow-list.ts` decomposition.

## What I am not asking for

The `/events` **public** path. That is four registrations in `surface-allow-list.ts` plus both
reserved-prefix lists, and that file is at its 800-line ceiling. It is sequenced separately and is not
part of this slot.
