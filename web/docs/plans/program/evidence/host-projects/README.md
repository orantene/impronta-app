# host-projects: POS mode `projects` (Collect) proven on the deployed QA host

Proved by agent `host-b`, 2026-09-11, against `https://staging-qa-journeys.tulala.digital`
(Vercel deployment `tulala-5e3o227vw`), confirmed serving commit `867e0ecc2`
(`sentry-release=867e0ecc2582990c2054aceb63ba55910f4f18c7`; see
`docs/plans/program/evidence/host-classes/README.md` for the same host-commit
check, done once at the start of this session). Database: Supabase branch
`fxlankepwnvelxjrahwk` (qa-journeys). Production `pluhdapdnuiulvxmyspd` was
never read from or written to; no migration; `npm run db:push` was never run.

This closes the local-only `docs/plans/program/evidence/pos-projects/`
proof's open item ("Not proven on the deployed QA host"): the same spec is
run here against the real Vercel build, with a fresh seed so it does not
depend on any earlier run's leftover conversation.

## Known defect kept as-is, per instruction

`docs/plans/program/evidence/pos-projects/README.md` (Defects found on the
way, item 1) documents that **client self-onboarding cannot complete**:
`complete_client_onboarding()` sets `profiles.account_status = 'active'`, but
the trigger `guard_profile_self_update` (`20260408113000`) reverts it because
it runs as the user (`auth.uid()` is the row's own id). The spec's
`projectWithBalance` helper works around this with the service role
(`auth.uid()` null, guard does not apply) and annotates the row it touched —
see `e2e/cases/POS-projects-collect-a-balance.spec.ts` lines ~275-296. Per the
standing brief for this run, **that workaround is kept unchanged** for this
proof; the underlying trigger/RPC defect is out of scope here and is already
flagged as being fixed by another agent. This run did hit the same defect
live on the host (the workaround fired — see below) confirming it still
reproduces on the deployed build, not only locally.

## Command and exit code

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital \
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
POS_PROJECTS_FRESH_SEED=1 \
npx playwright test e2e/cases/POS-projects-collect-a-balance.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
Exit 0 — **1 passed (2.6m)**, run 1, no retries, no application fix needed.
Full log: `run1.log`.

## What was proven

The full story from `docs/plans/program/evidence/pos-projects/README.md`,
seeded fresh through the interface on the host: a guest inquiry from the
storefront, staff build the lineup and send an offer, the talent approves it
from their inbox, the client claims an account and approves it (account
activated through the documented service-role workaround), staff press
Create booking (mints an $800.00 order); the Collect mode is entered from
Settings → Point of sale → the top-bar switch; the project is found by name
with the desk's own "owed" figure; a $300.00 cash deposit is collected
through the counter's engine; the balance after ($500.00 owed) is read back
through the reader after `router.refresh()`; a cancelled $200.00 order
(inserted directly, annotated, as no interface path mints a second order on a
booked conversation) is shown "Not counted" and does not move the figure; the
receipt opens by its public code and an unknown code is refused in a
sentence; the Projects board lists the project; Collect is refused with a
sentence while an agreement amendment is waiting on the client (inserted and
reverted, annotated).

Screenshots (`screenshots/`, 14 files): `00-settings-collect-on.png`,
`01-projects-mode-landing.png`, `02-find-by-client-name.png`,
`03-project-owed-with-rows.png`, `04-collect-a-deposit.png`,
`05-collected.png`, `06-balance-after.png`,
`07-cancelled-order-moves-nothing.png`, `08-receipt-by-code.png`,
`08b-receipt-unknown-code.png`, `09-public-receipt.png`,
`10-projects-board.png`, `11-project-milestones.png`,
`12-collect-refused-agreement-awaiting.png`.

SQL ground truth (`sql-after-journey.json`, service role, never printed):
inquiry `07199f51-89c0-4048-81b1-d2fb3c6a35fd`
(`pos-projects-1789093384234@impronta.test`, status `booked`); booking
`3f4aef11-6cd1-40f4-b4ce-1648158c8001` → order `b1fbf921-024e-4e55-84f1-0b2b73232d34`,
`pending_payment`, `total_cents 80000` ($800.00); one `booking_transactions`
row `8602dcbb-9f98-4b96-a9d1-22e089462880`, `paid`, `gross_amount_cents 30000`
($300.00), `provider manual`, `metadata.paid_via cash` — order total minus
collected = $500.00 owed, matching the screen's read after the deposit.

## Difference between local and host

None found in application behaviour. No fix was needed. The run did surface,
live, the same self-onboarding defect the local proof found (the spec's
service-role workaround engaged, as expected and kept per instruction).

## Fixture state left behind

One guest inquiry, its lineup, offer and approvals, one booked project with
one `pending_payment` $800.00 order carrying a $300.00 cash deposit and a
receipt code, one `cancelled` $200.00 order, one claimed client account with
an active relationship (account_status corrected via the documented
workaround). The agreement-amendment mutation used for item 12 was reverted
in `finally`, per the spec. Nothing was deleted.

## Not done, and known

- **Card and payment link** remain unexercised (no reader, no Stripe key on
  this fixture) — same as the local proof.
- The other four defects listed in `docs/plans/program/evidence/pos-projects/README.md`
  ("Defects found on the way", items 2-6) are unchanged and out of scope for
  this mode's files.
