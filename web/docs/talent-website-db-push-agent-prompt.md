# Prompt: apply talent-website migrations to production

Give this to a Claude Code agent running **on Oran's machine** (it needs the local
Supabase credentials in `web/.env.local`, which the cloud session does not have).
Paste everything below the line.

---

You are applying pending database migrations for the Tulala talent-website work to
the production Supabase project. Work in the `impronta-app` repo.

**Context.** A cloud session is building the talent free-website feature across
several pull requests. Each PR that contains a migration cannot merge until that
migration is applied to production, because Vercel deploys code on merge while
Supabase does not auto-apply migrations. See `CLAUDE.md`, "Schema + code shipping
protocol".

**Your job, in order:**

1. Confirm you are on the right machine and the credentials exist:
   ```
   cd web && cat .env.local | grep -c SUPABASE
   ```
   If there is no `.env.local` with Supabase values, stop and say so. Do not
   invent credentials and do not proceed.

2. See what is pending before changing anything:
   ```
   cd web && npm run db:check
   ```
   This lists local migrations not yet applied to the remote project. Report the
   list verbatim.

3. Read every pending migration file end to end before applying it. For each one,
   state in your reply: what it creates or alters, whether it is additive (new
   tables, new columns with defaults, new functions) or destructive (drops,
   type changes, data rewrites), and whether it is reversible. The talent-website
   migrations should all be additive. **If any pending migration drops or rewrites
   an existing object, stop and ask Oran before applying it.**

4. Apply them:
   ```
   cd web && npm run db:push
   ```
   If it refuses because remote history is ahead, read
   `web/docs/migrations-and-remote-history.md` and follow it. Do not copy a
   sibling migration into the worktree and delete it afterwards.

5. Confirm the result:
   ```
   cd web && npm run db:check
   ```
   It should now report nothing pending.

6. Report back with: the exact list applied, the real command output including
   exit codes, and anything that failed. Use the honest form when checking exit
   codes, since a pipe reports only the last stage:
   ```
   npm run db:push > /tmp/push.log 2>&1; echo $?
   ```

**Rules.**
- Never edit, rename or delete a file in `supabase/migrations/`. They are applied
  in production.
- Never run this against anything other than the linked production project, and
  never against a database you have not confirmed with `db:check` first.
- Do not merge any pull request. Your only job is the migration step.
- Do not seed, modify or delete any application data.

**Optional, and far better long term.** If Oran agrees, add these three GitHub
repository secrets at
`https://github.com/orantene/impronta-app/settings/secrets/actions`, which lets
the cloud agents run this themselves through `.github/workflows/db-push.yml` and
removes the manual step permanently:

| Secret | Value |
|---|---|
| `SUPABASE_PROJECT_REF` | `pluhdapdnuiulvxmyspd` |
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard, Account, Access Tokens, Generate new token |
| `SUPABASE_DB_PASSWORD` | Supabase dashboard, project, Settings, Database, password |

If you add them, tell Oran to reply "secrets added" to the cloud session.
