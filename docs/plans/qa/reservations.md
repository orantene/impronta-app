# QA — Reservations

New rows go here. Rows already in [`../phase-boundary-qa.md`](../phase-boundary-qa.md) stay valid
and were deliberately not moved — see [README](README.md).

## The row that gates the others

The shared list's highest-value Reservations row is the one that opens the reserve block on **El
Paisa's hand-composed page** and books a table end to end. Its falsifier is the important part:

> The island is "complete and callable" but was never rendered — five recorded instances of
> *documented as wired, resolves to nothing*

That row cannot be run until a person has placed the reserve block on El Paisa's page **through the
builder**. Writing the row directly would prove the block renders when the row exists, which is not
the thing in doubt. The ruling stands that this is built on El Paisa, a real prospect, and that
nobody touches Impronta's live site to test it.

## New rows

| Do this | Proves | Falsified by |
|---|---|---|

## Measured 2026-09-05: the reserve block is on ZERO pages, platform-wide

Read-only against production. This is the falsifier from the shared list's own Reservations row,
observed rather than predicted.

| Tenant | Pages | Published | Pages carrying the reserve block |
|---|---|---|---|
| `impronta` | 40 | 36 | **0** |
| `zero-test-studio` | 3 | 3 | **0** |
| `elpaisa` | **0** | **0** | **0** |

**The booking engine is built, tested, shipped — and nothing on the internet renders it.** That is
the sixth recorded instance of *documented as wired, resolves to nothing*, and it is the exact
outcome the QA row was written to catch:

> The island is "complete and callable" but was never rendered

### El Paisa moved, but not as far as it looks

The tenant now **exists**, which it did not when this was last checked, and it is seeded for
reservations: `takes_reservations = true`, one venue, one service rule, two service windows,
timezone `America/Argentina/Buenos_Aires`.

**It has no website.** Not an unfinished page — zero rows in `cms_pages`. So "a person places the
reserve block through the builder" is not the next step; a page has to exist first.

### Why this is not a staging problem

The three areas share one shape right now:

- **Events** — public pages live, no purchase path, so nothing is sellable.
- **Reservations** — engine live, on no page, so nothing is bookable.
- **Sessions** — no series exists, so nothing is scheduled.

Each is an engine without a door. Treating this as "seed some data so QA can run" gets a fixture and
leaves the product where it is. **Building El Paisa's page with the reserve block on it is the
staging tenant, the QA fixture and a real prospect's real site at once** — one piece of work that
closes all three, and the only part a person must do is the part the QA row exists to prove.

Constraints already ruled, unchanged: build on El Paisa, never on Impronta's live site; place the
block **through the builder**, never by writing the row — writing it proves the block renders when
the row exists, which is not the thing in doubt.
