<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:agent-working-rules -->
# Working rules for agents in this repo

Read this before your first commit. A work order gives you SCOPE; this file
gives you the RULES. Every line here exists because skipping it cost a wave.

## Branches and worktrees
- **Worktrees only.** `git worktree add .claude/worktrees/<name> -b <branch> origin/main`.
  Never `git switch` in the shared checkout — 8-16 agents share it.
- Fresh worktree per PR, off the LATEST `origin/main`. Never stack branches.
- A symlinked `web/node_modules` is fine for `tsc`, `lint` and tests, but
  Turbopack rejects it: `next dev` needs a real `npm ci`. Remove the symlink
  before committing.
- Never force-push `main`. `--force-with-lease` on your own feature branch only.

## Gates
- Run `npm run gates` (tsc + lint + size ratchet + i18n parity) before every
  push, plus the lanes your change touches.
- **Check REAL exit codes.** `cmd; echo $?` reports the echo, and a pipe reports
  the last stage. `npm run x > out 2>&1; echo $?` is the honest form.
- A gate you did not run is a gate that failed. Say so in the report.

## Migrations
- The repo FUTURE-DATES migrations. Yours must sort AFTER the newest existing
  file — check at build time, do not assume.
- `npm run db:push` from `web/` BEFORE merging the PR that contains it, then
  `npm run db:check`. Code merged ahead of its migration produces silent 500s.
- If `db:push` refuses because remote history is ahead, see
  `docs/migrations-and-remote-history.md`. Do NOT copy a sibling migration into
  your worktree and delete it afterwards.

## The four-layer rule
Adding `app/api/**/route.ts` is only THREE layers. The fourth is
**reachability**: a path absent from `SHARED_API_PREFIXES` in
`src/lib/saas/surface-allow-list.ts` (or from the host-kind list that should
serve it) returns the branded HTML 404 on every host while every handler test
passes. This shipped to production twice. `api-route-reachability.static.test.ts`
now guards it — if it fails, add the prefix, do not add an exception.

The same shape recurs elsewhere: a capability wired at 3 of 4 layers (schema,
renderer, inspector, preflight) is this repo's most-repeated defect.

## Silent failure
Parsers here fail CLOSED — bad stored data yields an empty result, not an error.
That is correct, and undiagnosable without a signal. When you add one, log a
dev-only warning naming the row and the reason.

## package.json test lanes
`JSON.parse` keeps the LAST duplicate key silently, so a duplicated lane runs
the wrong list. Edit the single canonical occurrence. On a rebase conflict in a
lane, take MAIN's line and re-append only your own test file.

## CI
- A PR red only because `main` was red needs a **REBASE**. `gh run rerun`
  replays the stale merge ref (`refs/pull/N/merge`, frozen at creation) and can
  never pick up a fix that landed on main afterwards. One-command diagnostic:
  `git fetch origin refs/pull/N/merge:refs/tmp/m && git log -1 --format=%P refs/tmp/m`
  — if parent 1 is not current `origin/main`, the run is testing stale code.
- Merging to `main` does NOT deploy. The `production` pointer fast-forwards on a
  green structural gate. Do not push it by hand.

## Copy and i18n
- Every new user-facing string needs **en + es**. `fr.json` has no
  `dashboard.platform` namespace — never create a French-only key.
- No em dashes in user-facing product or marketing copy.
- Settings surfaces: preset first, advanced hidden, plain language. A working
  business must never need to open the panel.

## Verification
- **Agents do not browser-QA.** The integrator does live checks.
- You MAY and SHOULD run `npm run qa:appointments` (read-only by default) to
  prove engine behavior over HTTP. "Not clicked" belongs in your report only for
  things that genuinely need a browser.

## Reports
Use `docs/agent-build-report-template.md`. The NOT-DONE section is the most
valuable part of the report — and every line in it must be **re-verified against
`origin/main`**, with the grep or file read that proves it. A report that copied
a plan's stale open-list once nearly triggered a wave of redone work.

## Plans vs code
Plans describe INTENT. Field shapes, schemas and payload examples belong in code
references, never inline in a plan — a stale `weekly` example in a plan file
produced silently-empty results for an hour. If a plan and the code disagree,
**the code wins**; fix the plan and say so.
<!-- END:agent-working-rules -->
