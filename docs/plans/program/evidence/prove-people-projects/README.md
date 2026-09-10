# prove-people-projects: People and Issues, proven in a browser against the isolated database

Branch `work/prove-people-projects`, off `program/journeys-2026-09` at
`deca2efc86b3382baed31103f069e3de1b60c8a0`. Database: Supabase branch
`qa-journeys` (`fxlankepwnvelxjrahwk`) for every run here. Production
(`pluhdapdnuiulvxmyspd`) was read once (one `pg_constraint` SELECT, see
`sql/03-role-check-drift.sql`) and never written; `npm run db:push` was never run.

Spec: `web/e2e/prove-people-issues.spec.ts` (14 tests, serial). Every test signs
in through `/api/dev/signin` as the fixture owner, starts on the admin shell,
and reads the rows it changed back through the service client.

## What the previous run had already found

The killed run left, uncommitted: the spec skeleton (People only; no Issues
tests), a defect fix in the Issues inbox, and a failed first test.

- Its one recorded run (`test-results/.../trace.zip`, 09:36 local) was against
  a LOCAL dev server on `qa-journeys.localhost:3211`, not the QA host, and
  failed on a strict-mode locator ("Everyone" matched both the rail's child row
  and the surface's tab). Kept: the spec's shape and its helpers. Corrected:
  the tab lookup is scoped to the surface's own `nav`, and the evidence path
  now points at this directory (it pointed at a directory that did not exist).
- Its application fix, kept whole and now proven live (test 12): pressing
  "Issue the missing tickets" on a seat lost after payment answered "Already
  handled - nothing to do." because the outcome was read off `rowsInserted`
  alone. `mintOutcomeForLine` (`lib/exceptions/resume.ts`) now asks the mint
  by line id, answers `seat_lost` with a KEY, and the screen renders that key
  in the operator's language (`lib/exceptions/outcome-copy.ts`, copy in
  en/es/fr, guarded by `outcome-copy.static.test.ts`). Its claim "PROVEN
  AGAINST THE LIVE QA HOST FIRST" had no evidence file behind it; the refund
  intent it created at 12:52Z (`sql/05`) is consistent with the story, and this
  run watched the same press happen (screenshot 11).

## The environment, honestly

- **The deployed QA host did not carry this branch when this run started.**
  Vercel built `deca2efc8` three times and every build died with
  `BUILD_EXCEEDED_MAXIMUM_TIME` (dpl_GwGHktUW29MRvrFYPzfTbVkjqQ3a: migration
  drift, since applied; dpl_2Vot2V7RvvFN8AKy6PCWykP2WpcK and
  dpl_3h1NdTujVMzdCvCzDCw15fiPN2SJ: 45 minutes stuck at "Creating an
  optimized production build"). The hosts were serving `d51227f5`, which
  predates the People surface entirely. A local `next build` of the same
  commit finishes in under two minutes, so the hang is specific to the Vercel
  builder and is NOT diagnosed here.
- **So the journeys ran on a local dev server of THIS worktree against the
  isolated database**: `next dev -p 3211`, env from
  `.env.capacity-isolated.local`, host `qa-journeys.localhost` (an
  `agency_domains` row another prove-* run added) and `qa-journeys-b.localhost`
  (added by this run, `is_primary = false`, same shape as the deployed hosts).
  Playwright needs `NODE_OPTIONS=--dns-result-order=ipv4first` because the
  dev server binds IPv4 only and `.localhost` resolves to `::1` first; `next
  dev -H ::` was tried and silently stops the proxy from running (every
  `/api/dev/*` 404s), so it was not used.
- **At 10:46 local the prove-tables run pushed a prebuilt deployment
  (dpl_GWNakpaQ69BS9whLQiLMbv2egiEK, `deca2efc8` plus its own uncommitted
  fixes) and re-aliased both staging hosts to it.** From then on the QA host
  carried the People surface, so the ten journeys that do not depend on this
  run's fixes were re-run there (`host-run/e2e-qa-host-run.log`, 10 passed).
  The four that depend on fixes made here can only pass on this worktree's
  server until this branch is deployed.
- The machine was swapping (8.9 of 10 GB) with five journey runs sharing it.
  The dev server twice hit Next's own memory threshold and restarted itself
  without its environment, which 404s `/api/dev/signin` (the D-022 shape, for
  `.localhost` hosts). Each time it was restarted by hand and the interrupted
  tests re-run; every run's log is under `gates/`, failures included. Waits
  after a write are 90 s for that reason (a server action took 31 s, its
  refresh 28 s). No assertion was weakened.

## Proven (test, host, evidence)

| # | Journey | Host | Evidence |
|---|---|---|---|
| 1 | People is reached FROM THE SIDEBAR (the rail row "Team", child "Everyone"), four filters over one record set, 4 people | local + QA host | `01-people-from-the-rail.png`, `traces/People-108d5-*` |
| 2 | Public profile hat opens the EXISTING profile drawer (`talent-profile-shell`, unchanged) | local + QA host | `02-public-profile-drawer.png`, `traces/People-47c24-*` |
| 3 | Bookable hat: "Turn off" on Therapist B writes BOTH halves (`direct_booking_enabled` false, `booking_terms.directBookingOptIn` false), the hat reads Off with a true sentence, `/book` no longer offers "Massage" while still offering "Gel manicure"; "Turn on" restores both and `/book` offers it again | local (fix-dependent) | `03-bookable-off.png`, `04-booking-page-without-them.png`, `traces/People-9edac-*`, `sql/01`, `sql/02` |
| 4 | Bookable hat for a person who holds their own sign-in under the workspace-wide switch: NO "Turn off" button, a sentence naming the switch that governs, nothing written | local (fix-dependent) | `03b-bookable-blanket-refusal.png`, `traces/People-35e92-*` |
| 5 | Access hat: "Give access" writes an active `viewer` membership; the person is still ONE row; the role select writes `manager`; "Take access away" marks it removed and leaves Public profile and Bookable on | local (fix-dependent: the role write) | `05-access-granted.png`, `05b-access-role-manager.png`, `05c-access-revoked.png`, `traces/People-7de2b-*`, `sql/01`, `sql/03` |
| 6 | A person with no email is told so; no free-text box and no "Send invitation" inside that person's record | local + QA host | `06-no-email-refusal.png`, `traces/People-4f3ad-*` |
| 7 | A person with no display name renders as "Unnamed person", never `33330001` | local + QA host | `06b-unnamed-person.png`, `traces/People-859fc-*` |
| 8-10 | Isolation, People: B's person exists (roster row, active); A's People surface does not carry them and is still the People surface; B's own owner sees them on B's host | local + QA host | `07-*.png`, `08-*.png`, `traces/isolat-e1fff-*`, `isolat-92ed8-*`, `isolat-36b64-*` |
| 11 | Issues is reached FROM THE SIDEBAR ("Issues" row, `/admin/issues` redirects to the live `/admin/exceptions`); a REAL problem is there in plain words ("1 ticket sold and never issued. Paid for 1, issued 0. The buyer has a receipt and no ticket.") with an action ("Issue the missing tickets"), and the line's allocation is `released`, i.e. the hold lapsed before payment, produced by the ticket journeys of 09-08/09 and not inserted | local + QA host | `10-issues-from-the-rail.png`, `sql/04` |
| 12 | Pressing the action answers with the truth ("This seat was lost after the buyer paid... A refund is owed instead, and it is now waiting in this list as its own row."), writes exactly that `ticket_refund_intents` row (`seat_lost_after_payment`, unexecuted), mints no admission, and on reload the critical row is GONE and the same order sits in the list once, as "Refund owed and not sent"; the count does not grow | local (fix-dependent) | `11-issues-action-answer.png`, `12-issues-row-cleared.png`, `traces/Issues-fa70d-*`, `sql/05` |
| 13-14 | Isolation, the record Issues points at: B's paid order exists; A's inbox has no link to it and A's Orders desk, asked for it by the same address the inbox's "Open" link uses, does not show it and is still the desk; B's owner opens that same order on B's host | local + QA host | `13-*.png`, `14-*.png`, `traces/isolat-5d462-*`, `isolat-fddad-*` |

Runs: `gates/e2e-local-full-run.log` (11 passed, then a Supabase `generateLink`
5xx interrupted the sign-in of test 12), `gates/e2e-local-rerun-issues-tail.log`
(12-14 passed), `gates/e2e-local-people-traced.log` (batches, all passed on the
final attempt after the two memory restarts), `host-run/e2e-qa-host-run.log`
(the 10 fix-independent tests, passed on `staging-qa-journeys.tulala.digital`
+ `staging-qa-journeys-b.tulala.digital`, deployment
dpl_GWNakpaQ69BS9whLQiLMbv2egiEK). Screenshots 01, 02, 06, 06b, 07, 08, 10,
13, 14 are from the host run (it overwrote the local ones); 03, 03b, 04, 05,
05b, 05c, 11, 12 are from the local server.

Traces were recorded with `--trace on`. Playwright stores the request headers
and cookies inside them, which here means the Vercel bypass secret and the
fixture session token; both were redacted in place (`[redacted-bypass-secret]`,
`[redacted-session]`) and the `.network` files removed before the archives were
kept. The trace viewer still shows every action and snapshot.

## What failed, and what was fixed in the application

1. **Bookable "Turn off" wrote a column the engine ignores and said "Saved."**
   The engine's agency gate is `workspaceAllow OR roster.direct_booking_enabled`
   (`lib/scheduling/appointment-policy.ts:213`); the fixture's workspace-level
   switch is on, so the write to `false` changed nothing: the hat stayed On
   and `/book` still offered the person (first run, `sql/02`). Fix, in the
   People slice only: `loadPeopleSurface` now exposes
   `workspaceAllowsDirectBooking`; the panel offers no "Turn off" for a person
   with their own sign-in under that switch and says which switch governs
   (`admin.people.detail.workspaceBooksEveryone`, en/es/fr); `setPersonBookable`
   refuses that case before writing (`workspaceBooksEveryone`) and, for a
   person the workspace answers for (no sign-in), withdraws their half as
   well, which is the same half the ON path already writes for them. The
   `personHasNotOptedIn` line under an Off hat also said "Only they can say
   yes, from their own account" for a person who HAS no account and a Turn on
   button right below; that person now gets `personHasNotOptedInNoAccount`.
2. **The role control could not write "Manager"** (`23514`, `sql/03`). The
   code names the role `manager` everywhere; the CHECK built from this
   repository's migrations still names it `coordinator`; production's CHECK
   already says `manager` and no migration records how. New migration
   `supabase/migrations/20261231031547_agency_memberships_role_check_manager.sql`
   (idempotent, a no-op where production stands), applied to the branch with
   `execute_sql` and a `schema_migrations` row; `check-migrations-applied`:
   795 applied. Not pushed anywhere else.
3. **A shortfall line that had become a refund stayed in the inbox for ever**,
   still critical, still offering "Issue the missing tickets", above the
   refund it had become. `readMintShortfall` (`lib/exceptions/read.ts`) now
   drops lines that hold a `ticket_refund_intents` row (three tests in
   `read.test.ts`, including the loud direction on a failed intents read).
4. Kept from the previous run: the `seat_lost` outcome and its keyed,
   translated sentence (see above).

## Not proven, and why

- **"Start a card collection and leave it unresolved."** The counter refuses
  "Payment link" in a sentence on this database ("This workspace has no
  payment link provider set up."), on the deployed host and locally, because
  no payment provider secret is configured for the isolated environment, and
  card-present is never offered from this screen by design. Nothing this
  interface can do produces a `payment_requested` transaction here, so the
  unresolved-collection row, its "Ask the provider what happened" action and
  its clearing by the recovery worker were not watched. Configuring a
  provider is an owner decision, not something to fabricate. The real
  problem proven instead (11-12) is the one the inbox already held.
- **Executing the refund** the Issues action promises: `run_refund_intent`
  hands the row to the refund cron, which needs the same provider. The
  "Refund owed and not sent" row therefore stays, truthfully.
- **This branch on the deployed host.** The four fix-dependent journeys (3, 4,
  5, 12) passed only on this worktree's server. Deploying needs either the
  Vercel build hang diagnosed or a prebuilt deploy, and both are outside this
  run (no push, no merge, and the hosts are shared with four other runs that
  re-alias them).
- The previous run's claim that its fix was proven on the live host: no
  evidence existed; what is proven is what this run watched (test 12).

## Fixture state touched outside the interface

- `agency_domains`: `qa-journeys-b.localhost` (non-primary) added so B's host
  shape exists locally. `qa-journeys.localhost` already existed.
- `agency_talent_roster.direct_booking_enabled` for the Talent set back to
  `true` after the first (pre-fix) run had written `false` through the inert
  button.
- One leftover active `viewer` membership from the interrupted access run was
  deleted (id `14363e90-...`, created by that run's own click); the spec now
  restores leftovers through the interface itself instead.
- `profiles.display_name` of the fixture Viewer blanked for the length of test
  7 and restored in `finally` (verified restored afterwards).
- The repair migration above.

## Commands and exit codes

See `commands.txt`.
