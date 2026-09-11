# defects-close — three open defects, 2026-09-11

Worktree `work/defects-close` (tree equals `origin/main` at `23862d8b1`). Every
database write went to the isolated branch `qa-journeys` (`fxlankepwnvelxjrahwk`)
through `npm run journeys:repair`. Production (`pluhdapdnuiulvxmyspd`) was read
through the management API with `read_only: true` only; `npm run db:push` was
never run. The Supabase MCP connector was invalidated in this session, so the
"prove with execute_sql" step was done over the same `DATABASE_URL` the repair
script uses (a throwaway `pg` client, guarded to refuse any ref but
`fxlankepwnvelxjrahwk`); the SQL and its rows are under `sql/`.

## 1. Client self-onboarding could not complete (D-111, closed)

**Root cause, verified on the branch.** `guard_profile_self_update` (BEFORE
UPDATE on `profiles`, `20260408113000`) reverts `app_role`, `account_status`
and `onboarding_completed_at` whenever `auth.uid() = OLD.id` and the caller is
not staff. All four onboarding RPCs are SECURITY DEFINER but run with the
caller's `auth.uid()`, so the guard fired on them too. Reproduced in a
rolled-back transaction as the user (`set local role authenticated` +
`request.jwt.claim.sub`): the RPC returned success and the row stayed
`onboarding` with a `client_profiles` row written
(`sql/02-client-rpc-before.rolledback.out.json`).

**Which roles were affected.** Every function on the branch whose body updates
those columns and reads `auth.uid()`: `complete_client_onboarding`,
`complete_talent_onboarding`, `complete_talent_onboarding_with_locations`
(the one `onboarding/actions.ts` calls for talent), and
`ensure_profile_for_current_user` (`access-profile.ts`). So talent onboarding
was broken the same way, not only client. Agency / workspace onboarding writes
with the service role (`workspace-signup.server.ts`) and was never affected;
every other direct writer of these columns in `web/src` is service-role or
staff-on-another-row (checked: `auth/callback/route.ts`,
`api/conversation/continue/route.ts`, `guest-client.ts`, `admin-clients.ts`).

**Fix: `supabase/migrations/20260911022138_onboarding_rpcs_pass_profile_self_update_guard.sql`.**
The narrowest exemption that keeps the guard's purpose:

- two helpers `onboarding_transition_begin()` / `_end()` set a
  transaction-local `tulala.onboarding_rpc`; EXECUTE revoked from `PUBLIC`,
  `anon`, `authenticated` (branch ACL after apply:
  `{postgres=X,service_role=X}`), so only a SECURITY DEFINER function owned by
  postgres can raise it;
- the guard, while the flag is raised, lets `account_status` and
  `onboarding_completed_at` move and lets `app_role` become only `client` or
  `talent`; otherwise it reverts all three as before;
- the four RPC bodies are the tree's current bodies (talent-with-locations
  diffed against the live body first: byte-equal after whitespace) plus the
  begin/end PERFORM lines around the profile UPDATE;
- the trigger is re-created with the same name and timing.

**Proof block inside the migration** (a `DO` with a caught sentinel so it
rolls its own writes back; a failed assertion propagates and fails the file):
two throwaway `auth.users`; (a) a direct self-UPDATE to
`active / super_admin` is reverted; (b) with the flag raised by hand,
`app_role = agency_staff` is still reverted; (c) `complete_client_onboarding`
as the user lands `active / client / stamped` with one `client_profiles` row,
and the flag is clear afterwards; (d) a later self-UPDATE in the same
transaction is reverted again; (e) `complete_talent_onboarding_with_locations`
as the second user lands `active / talent` and creates the `talent_profiles`
row; (f) `ensure_profile_for_current_user` keeps the active row active.
Dry run with `COMMIT` swapped for `ROLLBACK`: `NOTICE: onboarding proof passed;
rolling the proof writes back`, zero `proof-%@onboarding.invalid` users left.
Rule broken on purpose (guard's exemption branch forced to `false`): the same
file fails at (c) with `P0001 complete_client_onboarding did not land
(onboarding client <NULL>)`.

**Applied and proven on the branch.** `npm run journeys:repair --
20260911022138_...sql` exit 0. `sql/01-objects-after-apply.out.json`: ledger
row present, helper ACLs as above, all four RPC bodies contain the begin call,
guard body contains the flag, trigger present. The original repro
(`sql/02-client-rpc-after.rolledback.out.json`) now reads
`active / 2026-09-11T02:24:31Z / client_profile_rows 1`.

**Spec.** `web/e2e/cases/POS-projects-collect-a-balance.spec.ts` no longer
writes the status with the service role; after "I'm a client" it reads the
row and asserts `active` + stamped (`expect`, not a write). Re-run: see
"Spec run" below.

**`c08-cus-*` accounts** (`sql/03-c08-cus-accounts.out.json`): three exist on
the branch, not two. `c08-cus-1788906603336` and `c08-cus-1788907081765` are
`active` with an identical `onboarding_completed_at` of 2026-09-09T04:28:27Z,
i.e. corrected by hand in one statement. `c08-cus-1788943626587` (created
2026-09-09T08:47Z, after that correction) is `onboarding` with a
`client_profiles` row: the defect signature. Left as it is; the C08 spec
creates a fresh `c08-cus-<ts>` account each run, which now goes through the
fixed path.

**What was found on production while checking this** (D-110, open, owner
decision): production has NO `guard_profile_self_update`, NO
`profiles_self_update_guard` trigger, NO `ensure_profile_for_current_user`, NO
`bootstrap_profile_from_auth_email`, and `profiles.app_role` is still
`NOT NULL DEFAULT 'client'` / `account_status DEFAULT 'registered'`, although
its ledger records `20260408113000` and `20260408150000`
(`sql/07-production-readonly-checks.md`). Production onboarding works today
because the guard was never there. When `20260911022138` is pushed it installs
the guard on production for the first time, with the RPCs already carrying
the flag; the two column defaults are not touched by it.

## 2. D-017 residual archive tables (closed)

`20261021000000_drop_system_a_field_tables.sql` creates
`field_definitions_archived_20260611` / `field_values_archived_20260611`, and
their purge `20260615194711` sorts EARLIER by version although it ran later,
so the audit expected two tables no database holds (production: all four
`to_regclass` null, `sql/07-...`). Edited `20261021000000` in place, which is
idempotent-safe on production (every statement is a no-op there): the archive
is taken inside `DO $$ IF to_regclass(source) IS NOT NULL ... $$`, the System A
drops are `IF EXISTS`, and the purge is re-asserted at the end of the file.

- `audit-before.txt`: `MISSING — 2 object(s) across 1 migration(s)` (expecting
  320 relations).
- `audit-after.txt`: `nothing the migrations promise is missing` (expecting
  318 relations). Exit code is still 1 both times, for the 54 D-103 objects
  the audit lists first; that count is unchanged by this work.
- `sql/04-d017-replay-rolledback.out.txt`: the edited file replayed on the
  branch with `COMMIT` swapped for `ROLLBACK`: six notices, no error.

Observation, not fixed: `audit-journeys-schema.mjs` runs
`SET default_transaction_read_only = on` at session level over the
transaction pooler (`DATABASE_URL`), and that setting leaked into a later
client's server connection here (`25006 cannot execute CREATE FUNCTION in a
read-only transaction` on the first replay attempt, gone on retry). The audit
should `SET LOCAL` inside a transaction or use `SET SESSION CHARACTERISTICS`
on a dedicated connection.

## 3. The from-zero replay: four ledger-only versions (D-108, closed)

`sql/05-prod-ledger-four-versions.out.json` is the production ledger read
(`version, name, statements`). What each was:

| version | name | recovered from | what the new file does |
|---|---|---|---|
| 20260906030451 | product_features_localized_labels | ledger `statements` (1 statement, 3950 chars); diffed against the tree's `20260906030257` of the same name: identical apart from two RAISE sentences | asserts the sibling's two columns exist; changes nothing |
| 20260907003312 | plan_names_that_fit_every_industry | no statements stored; file found at git `7a3cccafa` on the unmerged branch `feat/plan-names-that-fit-every-industry`; production `product_tiers` carries its effect | the recovered body verbatim (value-matched updates + its own check); zero `product_tiers` rows on the branch, so it touched nothing there |
| 20261229000801 | ticket_refund_intents_revoke_anon | `applied_via_management_api`; original stamp of `…808` (renumbered by `ca5f5d4c9`) | the `…808` grant state inside a `to_regclass` guard (the table is created by `…807`, which sorts later) |
| 20261229000802 | ticket_refund_intents_authenticated_select_only | `applied_via_management_api`; original stamp of `…809` | same, for `…809` |

Applied to the branch: `repair-four-ledger-files.txt` (4 OK);
`sql/06-isolated-ledger-after-four-files.out.json` shows the five new ledger
rows, `ticket_refund_intents` grants `authenticated=SELECT` only, and
`product_tiers` count 0. `db-check-production-readonly.txt`: only
`20260911022138` pending on production.

Found on the way (D-109, open, owner decision): the code half of `7a3cccafa`
(plan display names Site / Team / Business) is not on main; production data
and main's `plan-catalog.ts` disagree on the plan names.

## Spec run: where it was proven, honestly

**Not on the deployed QA host**: the branch is not pushed, so the host cannot
carry `20260911022138`'s spec change (the database side IS on the host's
database, since the branch is the host's database). Proven on a local dev
server of this worktree against the same isolated database: `next dev` on
`:3160` with `.env.capacity-isolated.local` exported, `TULALA_ALLOW_DEV_SURFACES=1`,
a generated `GUEST_COOKIE_SECRET`, behind `scripts/local-host-proxy.mjs 3161
qa-journeys.local 3160`; dev-server lease granted for the run and revoked
after it (`~/.claude/tulala-dev-lease.sh`).

1. `POS-projects-collect-a-balance.spec.ts` with `POS_PROJECTS_FRESH_SEED=1`
   (the only mode that reaches the client-claim step), three attempts:
   run 1 skipped (env not exported to the playwright process, my error);
   run 2 failed at step 2, the storefront inquiry dialog, on a cold Turbopack
   compile (`/onboarding/role` alone took 2.9 min to compile on this machine at
   load ~10); run 3 got past the guest inquiry, the lineup and the offer
   draft and failed at "Save draft / saved ·" (20 s) after 5.9 min, still
   upstream of the client claim. Neither failure is the claim step; both are
   the dev server's compile latency on a loaded machine, the same shape the
   pos-projects README records across its 20 runs. Not re-run further.
2. So the fixed path itself was proven through the real interface with a
   throwaway spec (`client-claim-local/throwaway-spec.ts.txt`, not committed):
   provision a confirmed account with the auth admin API (as the spec does),
   sign in through `/api/dev/signin`, land on `/onboarding/role`, click
   **"I'm a Client"**, read the row with the service role (read only), revisit
   `/onboarding/role`, delete the account. Run 3 **passed** in 1.1 min
   (`client-claim-local/run3-pass.log`); runs 1 and 2 clicked the same button
   and the row went `active` both times (02:58:09Z and 03:00:13Z, checked in
   SQL) but the action's redirect response outran the 40 s wait while the dev
   server compiled `/client` for the first time (109 s).
   `client-claim-local/network.txt` is the app's traffic from the passing
   run's trace: `GET /onboarding/role 200`, `POST /onboarding/role 303` (the
   server action `chooseClientRole` → `complete_client_onboarding` as the
   user → redirect), then on revisit `GET /onboarding/role 307` → `GET /client
   200`: the bounce loop is gone. Screenshots: `01-role-picker.png`,
   `02-after-claim.png`, `03-revisit-role.png` (the last shows `/client`'s "No
   client account here" card, which is right for an account with no
   relationship to the workspace; the full chain makes that relationship
   through the inquiry claim).

The three `defects-close-*` throwaway accounts were deleted afterwards
(count 0). The isolated database otherwise carries only the migration
effects listed above.

## Commands and exit codes

| command | exit |
|---|---|
| `node --env-file=.env.capacity-isolated.local scripts/check-migration-version-collisions.mjs --remote` (before writing) | 0 |
| `npm run journeys:repair -- 20260911022138_onboarding_rpcs_pass_profile_self_update_guard.sql` | 0 |
| `npm run journeys:audit` (before) | 1 (2 missing + 54 D-103) |
| `npm run journeys:audit` (after) | 1 (0 missing + 54 D-103, unchanged) |
| `node ... check-migration-version-collisions.mjs --remote` (after the four files) | 0 (804 local, 800 remote) |
| `npm run journeys:repair -- <the four ledger files>` | 0 |
| `npm run db:check` (production, read-only) | 1: only `20260911022138` pending, as intended (not pushed) |
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.defects-close.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.defects-close.tickets npm run typecheck` | 0 (`typecheck.txt`, verdict `/tmp/tulala-tsc.7089eece.last` TSC PASS) |
| `npm run lint` | 0 (`lint.txt`) |
| `npm run test:tenant-isolation` | 0 (609/609, `test-tenant-isolation.txt`) |
| `npm run test:reservations` | not run: nothing under `src/lib/reservations` was touched |
| `POS_PROJECTS_FRESH_SEED=1 ... npx playwright test e2e/cases/POS-projects-collect-a-balance.spec.ts` | 0 (skipped, env not exported), 1, 1: compile-latency failures upstream of the claim step, see "Spec run" |
| `npx playwright test e2e/cases/ZZ-defects-close-client-claim.tmp.spec.ts` (throwaway, local build) | 1, 1 (redirect outran the wait; rows went active both times), then **0** |
