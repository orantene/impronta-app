# The host this proof ran on, and why it is a prebuilt deployment

Date: 2026-09-10. Hosts: `staging-qa-journeys.tulala.digital` (workspace A),
`staging-qa-journeys-b.tulala.digital` (workspace B). Database: Supabase branch
`fxlankepwnvelxjrahwk` (qa-journeys). Production was never written to.

## What was live when this run started (14:55Z)

The aliases pointed at `dpl_CHXyaM8J6fe6tjWB2SetmuAzSy5F` = commit `d51227f5`
(`merge work/fix-waitlist-seat`), 17 commits BEHIND the branch tip `deca2efc8`.
That build predates `00ffa4717` (the tables commit) and `8dfbbcade`
(`merge work/p4-tables`). The desk probe on it showed no `Add a walk-in`, no
`Seat party`, the old `Close visit` label and no venue-clock note, so nothing in
this journey could have been proven on it.

## Why the branch tip was not live: Vercel's build of `deca2efc8` never finishes

| Deployment | Commit | Result |
|---|---|---|
| `dpl_GwGHktUW29MRvrFYPzfTbVkjqQ3a` 12:08Z | deca2efc8 | prebuild refused: migration `20261231020400_booking_transactions_metadata_for_takings.sql` not applied (since applied; later builds report 794/794) |
| `dpl_2Vot2V7RvvFN8AKy6PCWykP2WpcK` 12:11Z (redeploy, cache) | deca2efc8 | `BUILD_EXCEEDED_MAXIMUM_TIME` after 45 min, last line `Creating an optimized production build ...` |
| `dpl_3h1NdTujVMzdCvCzDCw15fiPN2SJ` 12:59Z (redeploy, no cache) | deca2efc8 | `BUILD_EXCEEDED_MAXIMUM_TIME` after 45 min, same last line |

The same commit compiles elsewhere:

- GitHub Actions `Admin boot (prod build)` on `deca2efc8`: `npx next build` on a
  Linux runner, success in 3m37s (run 34475045745).
- This machine, node 20, `npx next build`: `Compiled successfully in 65s`,
  exit 0 (`gates/next-build-local.log`).
- `vercel build` here with the branch's pulled preview env: compiled in 88s.

So the hang is specific to Vercel's 4-core / 8 GB build box and not to the code
in this branch as far as any build I can run shows. NOT diagnosed further: I
cannot see inside that box, the log stops at the compile banner, and each
attempt costs 45 minutes. It is recorded here as the open blocker for the
branch; nobody should expect a push to `program/journeys-2026-09` to re-point
the QA hosts until it is understood.

## What was done instead: build here, ship the output

1. `vercel link` + `vercel pull --environment=preview --git-branch=program/journeys-2026-09`
   into the worktree (all gitignored; the CLI's edit to the root `.gitignore`
   was reverted).
2. `web/.env.local` (which points at PRODUCTION Supabase) was moved aside for
   the build so only the branch's preview env could be baked in. Verified on
   the output: the isolated project ref appears in the client chunks, the
   production ref appears once, in a hard-coded dev thumbnail fixture in source.
3. `sharp`'s linux-arm64 binaries were unpacked into `node_modules/@img/` by
   hand (npm refuses `--os=linux` on a Mac). Without them the first prebuilt
   deployment's server actions died with `Could not load the "sharp" module
   using the linux-arm64 runtime` (500 on `POST /admin/reservations`).
   `package.json` and `package-lock.json` are byte-identical before and after.
4. `vercel deploy --prebuilt` with explicit `-m githubCommitRef=program/journeys-2026-09`
   (+ sha, repo ids). That is what makes Vercel scope the deployment to the
   branch: without it the deployment got the GENERIC preview env, whose
   service key does not match the baked isolated URL (`Invalid API key` on
   sign-in), and the branch aliases did not move. With it, Vercel moved all
   three `staging-qa-*` aliases itself.

The deployment the proofs ran on is named at the top of `README.md`.
