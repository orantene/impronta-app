# Migrations when remote history is ahead

`npm run db:push` refuses outright when the remote knows a migration version the
local tree does not (`LegacyDbPushMissingLocalError`). This happens routinely
with parallel agents: another wave merged a migration and applied it while your
worktree was branched earlier.

## The supported fix: rebase

```
git fetch origin
git rebase origin/main      # your worktree now contains every sibling migration
npm run db:push             # from web/
npm run db:check            # expect N/N, exit 0
```

Rebasing is the fix because the refusal is telling you the truth: your tree is
genuinely missing a file that exists on main and in the remote ledger.

## Do NOT copy a sibling migration in and delete it afterwards

A previous wave copied another PR's migration file into its worktree so
`db:push` would proceed, then deleted the file so it would not land in the PR.
It worked, and it is fragile:

- the push is validated against a tree that will never exist again,
- the deletion is invisible in review,
- and if the sibling PR is later reverted, nothing records that your push
  depended on it.

Rebase instead. It costs one command and leaves an honest history.

## Ordering

The repo FUTURE-DATES migrations. `date -u +%Y%m%d%H%M%S` produces a timestamp
that sorts EARLY, which on a fresh replay can run your migration before the one
that creates the table it references. Always check the newest existing file and
sort after it.

## Two agents, one timestamp

If two worktrees pick the same timestamp, neither can apply. Rename yours to
sort last, realign the remote ledger row if it was already recorded, and say so
in your commit message.

## The rule that makes all of this matter

`db:push` runs BEFORE the PR merges. Vercel deploys code automatically; Supabase
does not apply migrations automatically. Code merged ahead of its migration
produces silent 500s on exactly the feature that needed the new schema.
