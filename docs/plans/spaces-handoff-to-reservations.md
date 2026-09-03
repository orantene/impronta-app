# Spaces & Seating → Reservations: what Phase 1 already has

Written by the Spaces & Seating Manager for whoever picks up Reservations, before
they arrive. **Reservations Phase 1 is band mode, and band mode is built.** This page
is a description of *my* area, not a design for yours: it says what you can call, what
is deliberately not built because it is yours, and the four things that will bite you
if nobody tells you them.

Live in production as of 2026-09-03: migrations `20261229000220` to `…223`, PRs #1537,
#1539, #1545, #1556, #1564, #1568, #1573.

---

## 1. The one paragraph version

A venue has a tree of spaces (rooms, areas, tables, seats). A **group** is a named set
of them — "four-tops", "VIP tables". Selling capacity works in one of **two modes**, and
a venue is in exactly one of them at a time:

- **Band mode** — the GROUP holds one capacity pool; the member tables hold none. You
  sell *"a four-top at 8pm"*. **This is Phase 1.** No floor plan, no table picking, and
  it is the only mode in which a no-show buffer means anything.
- **Assigned mode** — the TABLES hold pools; the group becomes a pure selection. You
  sell *"table 7 at 8pm"*. This is Phase 3, and moving a venue there is a migration I
  have written for you (§5).

**They must never both be live for the same tables.** That is INVARIANT SS-2, and once
you own the venue's mode it is yours to hold — see §4.

## 2. What you can call today

Everything here is on `main` and live.

| You want | Call | Notes |
|---|---|---|
| the venue and its clock | `resolveTenantTimezone(tenantId, venueId?)` in `lib/spaces/venues.ts` | **The only timezone read path.** A second one is a bug. Returns the source too, so you can say "inherited from the workspace". |
| the tree and the groups | `loadSpaces`, `loadSpaceGroups` in `lib/spaces/editor.ts` | |
| "can this party sit here?" | `decideAssignment` in `lib/spaces/assignment.ts` | **Pure.** Returns a refusal *reason*, not just false. Test it freely. |
| "which tables could take this party?" | `rankCandidates` (same file) | Smallest-that-fits first; **rotate the offset** or every concurrent booker contends on table one. |
| seat / move / close | `assignSpace`, `moveToSpace`, `setSpaceStatus` in `lib/spaces/assign.ts` | |
| who is sitting where | `loadSeatingForWindow` (same file) | |
| band → assigned | `planModeMigration`, `runModeMigration` in `lib/spaces/mode-migration.ts` | §5 |

**Availability is not mine and you should not ask me for it.**
`capacity_remaining_public(pool_id, starts_at, ends_at)` already returns the tightest
answer across the whole ancestor chain, so a table inside a bought-out room reports 0
without the caller knowing a tree exists. Call the Capacity Engine directly.

## 3. What is deliberately NOT built, because it is yours

I stopped at each of these on purpose, and in two cases the Director stopped me:

- **Service windows and turn times.** Lunch 13:00–16:00, dinner 19:00–23:00, 90-minute
  turns, windows crossing midnight. A turn time is a *reservation policy*, not a
  property of a table. I own `venues.hours` (when the building is open) and the settings
  surface; the windows are yours and point at a venue, optionally at a layout.
  **The per-table override is mine**: `spaces.turn_minutes`, which you read.
- **The host stand.** Today's book, walk-ins, seat, no-show, move. It is your product
  surface. What I shipped is an API a host stand consumes. Building it before you
  existed would have left you inheriting a screen you did not design.
- **No-show policy and deposit forfeiture.** Money and policy, not places. The owner has
  to ratify forfeiture (board decision D2).
- **Overbooking numbers.** `overbook_units` lives on the pool and only means anything in
  band mode. *Whether* a venue overbooks and by how much is your policy.

## 4. The four things that will bite you

**(a) The band pool is PARENTLESS. Do not "fix" it.**
It hangs under nothing, not under its room. If you parent it, then during a
band → assigned migration both pools exist at once, every replacement table reservation
charges the room a *second* time, and **the migration refuses itself with `ancestor_full`
halfway through, on a live venue, with guests holding allocations.** It is also wrong
standing still: a room of 10 (six four-tops + four two-tops) with a band of 6 lets the
band sell 6, reads the room at 6/10, then sells Table 7 directly at 7/10 — seven
four-tops promised against six.

**(b) SS-2 is yours to hold and nothing else can hold it.**
*A group's pool and its members' pools are never both active.* The capacity engine cannot
enforce it: membership is our table, so there is no row it could look at and refuse.
`capacity_subject_kinds` does not cover it either — that maps a kind to a backing table
and has no notion of modes. `space_groups.sell_mode` records which mode a venue is in;
`ss2Violations()` in `lib/spaces/tree.ts` checks it. **Wire that check into whatever
flips a venue's mode.**

**(c) A party UNDER a space's minimum is ALLOWED, and flagged.**
Not refused. A host seats two people at a four-top on a quiet night, or because the
two-tops are by the kitchen door. **A system that refuses is a system the host works
around, and a host working around the floor plan is how the floor plan stops matching
the room.** `decideAssignment` returns `oversized: true` so you can show it; it does not
block.

**(d) Overlap is HALF-OPEN.**
A table freed at 20:00 is seatable at 20:00. That is what a turn time means. Treating it
as a clash loses a whole seating every night, and it is the kind of off-by-one that
looks like caution.

## 5. Band → assigned: four steps, and the ORDER is the safety property

`planModeMigration` decides the whole thing before `runModeMigration` performs any of it.

1. Create the table pools, parented to their room.
2. For each live band allocation: **reserve** the table, then **commit** it.
3. **Only then** release the band allocation.
4. When the band pool is drained, `is_active = false`. **Never delete it.**

**Reserve the replacement before releasing the original, never the reverse.**
Release-then-reserve opens a window in which the guest holds nothing and a walk-in takes
their table. If a reserve or commit fails, the guest still holds their band allocation —
the safe failure. A failed *release* leaves them holding both, which double-counts
against the band: also safe, but reported rather than swallowed, because the band then
reads fuller than it is.

**The plan refuses to start** if even one live allocation has no free member table over
its window. Migrating some guests and stranding others leaves a partly-drained pool and
no way to tell from outside which state the venue is in.

**Already-seated parties are placed first**, before longest-window. Ordering by duration
alone let an unseated party take the table a guest was *already sitting at*. Seating is a
hard constraint; duration is only a preference. You cannot move someone mid-meal.

**It is not a re-parent.** The engine refuses to re-parent a pool holding live
allocations, and rightly — every existing allocation would silently start charging a
different chain.

## 6. Traps that cost me time

- **`capacity_allocations` has no `space_id` and must never get one.** I assumed it did
  and it *typechecked*, because the service-role client is not generically typed. Seating
  lives in `space_assignments`, and it has to be a table: **a joined party sits at two
  tables**, so a column would force a second allocation for the same guests.
- **Unassigned is a valid state.** No row in `space_assignments` means nobody has placed
  that party yet. That list is the host stand's whole job — not an error to clean up.
- **Deactivate, never delete.** A pool's allocations are the record of what was sold in
  that room; a dispute is settled with them. An inactive pool refuses reserves through it
  *including for its children*, which is exactly what closing a room should do.
- **Rule 8 is deliberately unimplemented.** An ancestor held over the window is the
  engine's business; its reserve refuses with `ancestor_full` and that refusal is the
  answer. Do not re-derive it — a second implementation of someone else's invariant is
  free to drift from it.
- **`ancestor_full` is the refusal to design copy for.** The table is empty and the guest
  still cannot sit at it. Front Door owns the words; do not write the string yourself.

## 7. Where things are

```
lib/spaces/venues.ts          venue rows, resolveTenantTimezone (the only tz read path)
lib/spaces/venue-timezone.ts  pickTimezone, localHourIn, timeZoneOptions   (pure)
lib/spaces/tree.ts            SS-1, SS-2, isPooledKind, nearestPooledAncestorId (pure)
lib/spaces/assignment.ts      the decision table, rankCandidates            (pure)
lib/spaces/assign.ts          assign / move / close / loadSeatingForWindow
lib/spaces/editor.ts          the tree and groups, bulk add
lib/spaces/pools.ts           pool binding; SS-1 enforced here
lib/spaces/mode-migration.ts  band → assigned                              (pure)
supabase/probes/              rolled-back probes; run with npm run sql:dry-run
docs/plans/spaces-seating-plan.md   the area plan, DDL, decision table, invariants
```

Everything marked *pure* gates in CI on every change. The probes do **not** run in CI —
there are no service-role credentials there — so they are evidence, never a gate.

## 8. If you need a shape I do not have

Ask, through the Director. **Do not define a table, seat, room, group or layout in your
own area** — that is how a platform ends with three floor plans for one room, which is
the reason this area exists at all. A group with no floor plan is always enough to start,
and Phase 1 needs nothing more.

— Spaces & Seating Manager, 2026-09-03
