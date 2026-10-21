# Building main for staging (the `staging` pointer branch)

Flow: `main` -> `staging` -> `production`. `main` builds nothing. `staging` and `production` are **pointer branches**:
each moves only by a fast-forward, only to a `main` commit whose `CI — structural quality gate` run is green, and only
when a human dispatches the workflow. `web/vercel.json` `ignoreCommand` builds exactly those two refs and skips every
other branch, so one trigger is one Vercel build (cost rule, #3872). There is no env switch (the old `STAGING_BUILD`
flag was removed with TUL-1768) and nothing that builds on every merge.

## Build staging (what the PM does)

```
gh workflow run build-staging.yml [-f sha=<main commit>]     # blank sha = head of main
```

`.github/workflows/build-staging.yml` then: refuses a SHA that is not on `main`; refuses a SHA without a successful gate
run; fast-forwards `staging` to it (plain push, never forced, never backwards); waits for the Vercel Git build of the
`staging` ref (a preview, never production); waits for READY; aliases the staging hosts only; probes the bundle (staging
DB ref present, production ref and `pk_live_` absent); runs `npm run deploy:smoke -- --staging`.
If `staging` is already at the SHA nothing is pushed and no build happens: the run re-uses that SHA's deployment.
Do not push `staging` by hand. Do not use `vercel deploy` for staging: CLI deploys skip the ignore step and the
branch-scoped Preview env.

## One-time Vercel and GitHub setup (needs a Vercel and a repo admin; NOT done by the workflow or by code)

Do these in this order. Until step 1 is done, a `staging` build has the wrong environment, so do not merge the PR that
removes `STAGING_BUILD` (or run Build staging) before it.

1. **Re-scope the staging env vars.** Vercel -> project `tulala` -> Settings -> Environment Variables. Every variable
   that is set for **Preview** with branch `main` (the staging Supabase `fxlank` URL and keys, Stripe test keys,
   `STAGING_GATE_*`, and the rest of the staging set) must be set for **Preview** with branch `staging`. Add the
   `staging` copy first, check it, then delete the `main` copy so a later `main` build can never pick up staging values.
2. **Delete `STAGING_BUILD`** (Preview, branch `main`) if it still exists. It is no longer read.
3. **Production Branch stays `production`** (Settings -> Git). Do not change it. `staging` is an ordinary preview branch
   (`target: null`).
4. **Protect `staging` on GitHub.** Settings -> Rules (or Branches) -> add a rule for `staging`: block force pushes,
   block deletion, require linear history. Allow pushes only from GitHub Actions (the bypass list holds `github-actions`
   and the repo admins). The `staging` branch does not need to exist beforehand: the first Build staging run creates it
   at the chosen SHA.
5. Confirm the staging hosts' deployment protection bypass secret still works on a `staging` build (the workflow sends
   `VERCEL_AUTOMATION_BYPASS_SECRET` when set).

## Why a `staging` ref and not main

The earlier flow turned a flag on for `main`, built, and turned it off again; a failed removal meant every merge built.
A pointer moved by one dispatched workflow cannot be left on. Cost per staging build is unchanged: one Vercel build.

The command: exit 0 means skip. `production` and `staging` build; every other branch is skipped.
Pinned by `src/lib/quality/vercel-ignore-command.static.test.ts` and `src/lib/quality/build-staging-workflow.static.test.ts`.
