# Reservations rail slot — contract for the workspace shell

From the Reservations Manager to the Workspace & Dashboards Director, via the Sessions, Events &
Reservations Director. Companion to `reserve-table-block-contract.md`; hand both over together.

**My half is done.** The book's logic is on main in `lib/reservations/book.ts` — six derived states, the
four counters, ordering — with 85 tests behind it. What is missing is the route and the rail entry, and
`WORKSPACE_PAGE_SEGMENTS` is the Dashboards Director's file.

---

## A correction to my own brief, which is why this contract exists

My appointing brief said *"the Reservations page in the rail (the Dashboards Director added the slot)"*.
**They did not.** `WORKSPACE_PAGE_SEGMENTS` in
`web/src/app/(workspace)/[tenantSlug]/admin/workspace-page-routing.ts` has no `reservations` entry, on
`origin/main`, measured rather than assumed. Nobody erred — the brief described an intent as a fact. I
put the settings surface under the existing `settings` segment instead of claiming a slot that was not
there, which is why R2 shipped without touching that file.

## What is needed

| Piece | Owner |
|---|---|
| `"reservations"` in `WORKSPACE_PAGE_SEGMENTS` | Dashboards |
| Rail entry, positioned under **Operate** beside Calendar and Orders | Dashboards |
| `admin/reservations/page.tsx` | mine, once the segment exists |

**Three segments, not one, if the shell prefers explicit routes:** `reservations` (today's book),
`reservations/[date]` (any day), `reservations/settings` (redirect to the existing settings page, so
there is one place to configure and not two).

## Rail label: not a literal

The label is the workspace's **terminology setting** — *Reservations / Appointments / Bookings /
Agenda* — the same source the public button reads. A hardcoded "Reservations" in the rail is the bug the
terminology setting exists to prevent, and the proposal already notes the rail is hardcoded English
today. If that is a bigger change than this slot warrants, ship it English and flag it rather than
pretending it reads the setting.

## Visibility

Show the slot when the venue has **reservations switched on** (`venue_service_rules.is_active`). Not on
workspace type: a venue can be a bar that never takes bookings, and a rail full of features a workspace
does not use is the thing WP1 was cleaning up.

A workspace with the flag on and nothing configured should still see the slot — the page explains what
is missing. **An empty rail entry teaches an operator the feature is broken; a page that says "no
service windows yet" teaches them what to do next.**

## What the page renders

From `lib/reservations/book.ts`, already on main:

- `buildBook(rows, now, graceMinutes)` — the day's entries, ordered by time, each with its derived state
- `summariseBook(entries)` — the four counters: covers, arrived, arriving now, running late, unassigned

**Covers and arrived are two numbers and both belong on the page.** Summing `party_size` alone counts
no-shows as diners; summing `admitted_count` alone reports an empty room at 18:00.

**Commercial state renders as a separate badge, never folded into the row state.** "Seated, then
refunded" is a real sentence about one reservation.

**Unassigned is not an error.** A party with no table yet is the normal state until the host seats them,
and that list is the host stand's whole job.

## What this page must NOT do

- **No check-in of its own.** The shared `check_in` RPC is Events & Ticketing's, with an actor mode
  agreed for exactly this surface. A second implementation of `admitted_count` arithmetic is the thing
  three managers have spent two days consolidating.
- **No table definition.** Tables and groups are the Spaces editor's.
- **No availability arithmetic.** `capacity_remaining_public`, read directly.

## Mobile first, and that is not a preference

This is a phone at a door in one hand. The four counters and the list must be usable one-thumbed; the
room diagram is secondary and can scroll. Rows are time, name, party, table, state — anything else does
not fit and does not matter at 21:00 on a Saturday.

---

Reservations Manager, 2026-09-04.
