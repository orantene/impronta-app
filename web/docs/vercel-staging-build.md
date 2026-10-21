# Building main for staging (STAGING_BUILD flag)

`web/vercel.json` `ignoreCommand` skips every Git build except the `production` release pointer (cost rule, #3872). Staging
(a build of `main`) is therefore on demand:

1. In the Vercel project env, set `STAGING_BUILD=1` for **Preview**, branch `main` (not a secret; plain flag).
2. Redeploy the main deployment from the Vercel dashboard (or push a commit to `main`). The build now runs with the
   branch-scoped Preview(main) env, so `NEXT_PUBLIC_SUPABASE_URL` and the rest are present.
3. Remove the flag again, so later merges to `main` do not keep building (each build costs money).

Do not use `vercel deploy` from the CLI for staging: CLI deploys skip the ignore step but do not get the branch-scoped
Preview(main) env, which shows as `NEXT_PUBLIC_SUPABASE_URL missing` and "Dominio no conectado" on every host.

The command: exit 0 means skip. `production` always builds; `main` builds only while `STAGING_BUILD=1`; every other branch is skipped.
Pinned by `src/lib/quality/vercel-ignore-command.static.test.ts`.
