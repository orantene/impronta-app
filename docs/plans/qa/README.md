# QA rows live in per-area files

**New QA rows go in `docs/plans/qa/<area>.md`, not in
[`../phase-boundary-qa.md`](../phase-boundary-qa.md).**

## Why this exists

`phase-boundary-qa.md` is one flat table that every area appends to at the same spot. That means it
conflicts **exactly as often as it is used**: each merge to `main` conflicts the next open PR that
touched it. On 2026-09-05 a single Events PR hit the same conflict twice in under an hour, and at
the time of writing four open PRs across two departments all append to the same lines.

A shared append point is not a coordination failure by the people using it. It is a structural
property of the file, and no amount of care by the appenders fixes it.

## Why nothing was moved

The obvious fix — split the existing table into per-area files — would conflict **every open branch
that has rows in it**, across departments that did not ask for the change. So no existing row was
moved and no existing line was edited. This change is **purely additive**:

- new per-area files, which no open branch has ever touched, so none can conflict with them
- one pointer paragraph at the **top** of the shared file, where nobody appends

The old table stays valid and is still the list the owner runs. It drains naturally as areas
re-touch their own rows. There is no migration to schedule and no branch to rebase.

## The rule for a row (unchanged)

A row is written so someone who has never seen the code can execute it, and it names **what would
falsify it**, not just what should happen:

`| what to do | proves | falsified by |`

Two things worth repeating, because both have been got wrong on the shared list:

- **Mark a row `BLOCKED:` and say what by.** A blocked row costs nothing. The expensive mistake is
  the reverse — a row that reads as executable but is not. On 2026-09-05 six ticket-scanning rows
  told the owner to buy a ticket when no purchase path existed, which would have spent the one
  resource nobody can substitute for: a human with a real phone.
- **Re-check a blocker before trusting it.** A row marked blocked on a condition that has since
  landed is a row we are not running for no reason. One such row was found the same day.

## Files

| File | Owner |
|---|---|
| [`sessions.md`](sessions.md) | Sessions & Classes |
| [`reservations.md`](reservations.md) | Reservations |
| [`events.md`](events.md) | Events & Ticketing |

Other departments: add your own file here. Nothing about this directory is specific to the three
areas that seeded it.
