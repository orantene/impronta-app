# QA — Events & Ticketing

New rows go here. Rows already in [`../phase-boundary-qa.md`](../phase-boundary-qa.md) stay valid
and were deliberately not moved — see [README](README.md).

## Corrections to rows on the shared list

Verified against `production` (`f4cec4988`) on 2026-09-05, not against a working tree. Recorded here
rather than edited in place, because that file is conflicted on an open PR.

### The six E8 rows are NOT executable — they are not marked blocked, and should be

Every E8 row opens with **"Buy a ticket"**. There is no way to buy one.
`web/src/app/(public)/events/[slug]/page.tsx` says so in its own header:

> NO PURCHASE PATH YET, deliberately. This page shows what is on, when doors are, and what the
> tiers cost. Buying needs the ticket picker block, guest checkout and the receipt

`/events` and `/events/<slug>` are live, correct, and honestly a price list. But E5b and E6 are
marked `NOT EXECUTABLE` for this same missing piece and the E8 rows are not. **That is the expensive
direction of the error**: a blocked row costs nothing, and this one would have sent the owner to a
real iPhone — the one step nobody can do on his behalf — to buy something unbuyable.

**Open question, owner: Events & Ticketing.** Can a cash sale at the door mint an admission with no
order behind it? If yes, that row is the bootstrap for the whole E8 block and must run first,
because it is then the only thing that produces a scannable code. If no, E8 is blocked entire.
Searching found `mint-on-paid.ts` (needs a paid order) plus session and reservation doors, and no
cash path outside a test file — but that is a grep, and a grep is not a specification.

### E2 is marked blocked and is NOT

E2 reads *"NOT EXECUTABLE UNTIL THE RAIL SLOT LANDS (no `events` segment exists in `WorkspacePage`
or `WORKSPACE_PAGE_SEGMENTS`)"*. In production:

```
"events",  // Events & Ticketing — SPA tab (menu shape); reachable by URL now, rail door deferred
```

The segment is there and the page is reachable by URL. **E2 — sell on a tier, rename the tier, prove
the pool is keyed on `pool_key` and not the label — is executable today by typing the URL**, and does
not need the rail door. Row recovered.

## Owed rows (to be written here)

- Dim-phone scan of a version-8 code.
- Print scan.
- The owner's click on the `runs_events` card in Settings — shipped in #1736, live since 07:02Z.
  Not assertable by anyone who cannot sign in.

## New rows

| Do this | Proves | Falsified by |
|---|---|---|
