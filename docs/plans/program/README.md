# Tulala journeys program: start here

This folder tracks one program: proving that all 48 documented business journeys work
end to end on Tulala, customer through operator through talent, including the hard
combinations and recovery paths. It used to be three separate document sets written by
three different people at three different times. This file, `ledger.md` and `defects.md`
are the single merged version. Read this file first.

## The three sources this reconciles

1. **The fired developer's program docs.** Written on the branch that became
   `program/journeys-2026-09`. `START-HERE.md`, `PLAN.md`, `ledger.md` (before this
   merge), `defects.md`, `scenario-matrix.md`, `scenario-register-404.md`,
   `FINAL-CAMPAIGN.md`, `cases/`, `evidence/`. This is the working record of what has
   actually been built and tried against the isolated preview.
2. **The design program.** Written on a separate, unpushed local branch,
   `docs/pos-program-2026-09`, under `pos/`. This is a POS/workspace redesign plan:
   screens, actions, modes, decisions, coverage. Application implementation of this
   program is **not authorized yet**. It is a plan, not a build log.
3. **Facts from the takeover session (2026-09-09).** New defects found while proving the
   isolated QA runtime is real, folded into `defects.md` as D-100–D-103, and into this
   file as the QA runtime section below.

## Which file is canonical for what

| Question | Canonical file | Source |
|---|---|---|
| Case status: is C06 done, is C01 done, what is the honest 0/48 count | [`START-HERE.md`](START-HERE.md) | developer |
| Open defects, their real text and disposition | [`defects.md`](defects.md) | developer, plus D-100–D-103 added this session |
| Evidence a specific scenario ran and what it proved | [`evidence/`](evidence/), `qa-evidence/` (referenced from `START-HERE.md`) | developer |
| Case-by-case scenario records (240 case-role rows) | [`scenario-matrix.md`](scenario-matrix.md) | developer |
| The 404-row blueprint scenario register | [`scenario-register-404.md`](scenario-register-404.md) | developer |
| Per-case requirement text (what a case must do) | [`cases/`](cases/) | developer |
| Original 20-task plan | [`PLAN.md`](PLAN.md) | developer |
| Merged task tracker (T-ids, P/M-ids, POS-ids together) | [`ledger.md`](ledger.md) | this merge |
| Screens, one per workspace/POS surface | [`pos/screen-index.md`](pos/screen-index.md) | design program |
| Every visible POS action | [`pos/actions.md`](pos/actions.md) | design program |
| POS modes and the case → mode map | [`pos/modes.md`](pos/modes.md) | design program |
| Product/policy decisions needing the owner (`D-POS-*` ids) | [`pos/decisions.md`](pos/decisions.md) | design program |
| The People model (three hats: public profile, bookable, access) | [`pos/people-model.md`](pos/people-model.md) | design program |
| POS coverage: what's designed, built, connected, verified | [`pos/coverage-matrix.md`](pos/coverage-matrix.md), [`pos/coverage-final.md`](pos/coverage-final.md) | design program |
| POS task plan (`POS-*` ids, dependencies, acceptance) | [`pos/execution-plan.md`](pos/execution-plan.md) | design program |
| Owner-supplied mockup audit and its disposition | [`pos/audit-2026-09-09-disposition.md`](pos/audit-2026-09-09-disposition.md), [`pos/audit/2026-09-09-mockup-audit-source.md`](pos/audit/2026-09-09-mockup-audit-source.md) | design program |
| Retired: case progress (now in `ledger.md`) | [`pos/case-progress.md`](pos/case-progress.md) | pointer only |

In short: **the developer's files are canonical for whether something works and has been
proven**; **the `pos/` folder is canonical for what the screens, actions, modes and
product decisions should be**. Where both sets describe the same underlying work,
`ledger.md` collapses it to one row and lists both ids under "also known as".

## Where to start

1. Read `START-HERE.md` for the honest count and what is blocked today.
2. Read `ledger.md` for the merged task list and status.
3. Read `defects.md` for open defects, most urgently D-014 / D-017 / D-020 / D-022 and
   the newly found D-100 / D-101 / D-102 / D-103.
4. If the work touches the POS/workspace redesign, read `pos/README.md` next. It has
   its own resume order and its own checks.

## Renamed: Projects (formerly Client Work)

The POS mode that used to be called Client Work (id `client` in early design-program
drafts, later `work` in the workspace registry) is now called **Projects**. Its landing
action changed too: the old landing view "Due" is now called **Collect** and the mode
opens on "Collect a balance": search for a client, see what is owed under an accepted
agreement, collect. The full project is one tap away. This rename is recorded in
`pos/audit-2026-09-09-disposition.md` and reflected in `pos/modes.md`,
`pos/execution-plan.md`, `pos/tracker.md`, `pos/baseline.md` and `pos/cross-surface.md`.

## QA is not frozen

QA for this program runs continuously against the isolated preview. It is not paused
and does not wait for a single final campaign. Any older text saying "frozen" or "QA
stays frozen until the final campaign" is superseded. See the correction in
`scenario-register-404.md` and `FINAL-CAMPAIGN.md`, and `START-HERE.md`'s own
"Which QA model governs" note.

## Card and other provider-dependent payments

Every scenario that needs a live card charge is marked **awaiting external
verification** in `scenario-matrix.md`, not passed and not failed. Stripe test keys and
a Mercado Pago sandbox are not yet supplied on the isolated preview, so the checkout
helper degrades to a mock success URL instead of reaching a real provider. This is why
C01-CUS (nail salon deposit) shows as awaiting external verification with a separate,
newly found defect, D-100: the click that should start that mock flow does not even
navigate away from `/book`. Until keys and a sandbox are supplied, no card-payment
scenario can be marked passed no matter how the rest of the flow behaves.

## The migration range

The full local migration range for this program is `20261230000200`–`20261230002200`
(21 files). Production (`pluhdapdnuiulvxmyspd`) has `20261230000200`–`20261230000600`
applied; everything after that exists only on the branch and on the isolated
`qa-journeys` preview. **Do not re-apply it to production** outside the normal
`db:push` release protocol. `20261231*` is reserved for the money/capacity hardening
work and has no files yet.

## The QA runtime

QA for this program runs against three `staging-qa-*` hosts, not against raw
`*.vercel.app` preview URLs (those 404, see the CLAUDE.md QA caveat) and not against
production.

- The three hosts are `staging-qa-app.tulala.digital` (app, no fixed tenant),
  `staging-qa-journeys.tulala.digital` (workspace A) and
  `staging-qa-journeys-b.tulala.digital` (workspace B). All three are bound to the
  candidate git branch (`program/journeys-2026-09`), so a push to that branch re-points
  them.
- They are registered in the **isolated** Supabase project (`fxlankepwnvelxjrahwk`,
  branch `qa-journeys`) only. Production's `agency_domains` table is untouched.
- Vercel Authentication stays on for these preview hosts. Automated test runs pass the
  project's Protection Bypass for Automation secret as a **header**. Do not ask for the
  bypass as a cookie. A caller that does gets Vercel's own redirect back instead of
  reaching the application (this was D-102, now fixed in `playwright.config.ts`).
- No secret, token or connection string for this runtime is written in any file in this
  folder. They live in the gitignored isolated env file and, for automated runs, in a
  platform secret store.

**Proof of life:** the C01 operator smoke test passes against this runtime, and
`PERM-cross-workspace.spec.ts` passes 5 of 5, including a positive control showing
workspace B's own owner can reach a record that workspace A's operator is correctly
refused. Full detail: `evidence/T0-04/README.md` and `evidence/T0-06/README.md`.

## Handover, 2026-09-10

Written by the implementation lead at the end of the scheduled check-ins. Everything below was verified on the day, not remembered.

**Merged and verified together on `program/journeys-2026-09`** (261 commits ahead of `main`, 44 new migrations, every gate green on the combined tree, pull request #1936):
- The integration of the developer's journeys branch with main, with its four failing gates repaired at their real sites and no baseline widened.
- The money and capacity hardening: a refused reservation leaves nothing behind and replays identically; a card collection cannot be taken twice; the identity rule guards selling and not abandoning; a crashed command is taken over on a lease and cannot stamp afterwards; a booking moves with its staff hold and its room or not at all; a waitlist acceptance takes a real seat.
- The workspace shell, routing and phone tabs driven by one destination registry. 24 of 25 destinations are built; the one still declared and empty is a professional's own work view, on purpose.
- The counter point of sale, appointments and classes, tables and kitchen, projects and the client record, people with three hats, sales and payments, issues and the settings panels.

**Proven on the QA environment** (`staging-qa-journeys.tulala.digital`, isolated database `qa-journeys`), each journey re-run by an independent reviewer who then queried the rows, evidence under `evidence/prove-*`:
- Counter: a full cash sale to the receipt, plus the three refusals a cashier meets.
- Appointments: reschedule with hold and room together; busy person, stale screen and full room each refused in words; a class filled, waitlisted, freed, re-offered, with the accepted place holding a seat; proposed hours reviewed and accepted in the person's own timezone.
- Tables and kitchen: walk-in seated, ticket amended and acknowledged at revision two, two tables joined as one party, the venue's clock shown under three timezones at once.
- People and issues: the three hats on a real person; a real problem surfaced, answered and cleared.
- Money: every figure traced to its rows; cancelled and draft orders do not move what is owed.

**In flight:** the production release of the above. Order: push the 35 pending migrations to production (all additive or guarded; the four that replace live functions were diffed against production first, see `evidence/T0-07`), verify the objects exist, merge #1936, let the CI-gated pointer deploy, run the smoke test, then a signed-in look at the live app that writes nothing.

**Blocked, and on whom:**
- Card payments and the Mercado Pago path: built and tested against a mock; real verification waits on the owner supplying Stripe test keys and a Mercado Pago sandbox. Nothing else waits on this.
- Tap-to-pay on a phone: needs the provider's native app or SDK; a web point of sale cannot do it alone. The no-hardware path that works is a payment link or QR.
- The platform switch that turns the point of sale on for a workspace has no control anywhere in the product; it was set by SQL on QA only. A settings control is owed before any real customer can use it.

**Honest count against the six specifications** (`specs/`): every screen each spec names has a route and a body; the journeys above exercised roughly two thirds of them in a browser with evidence. The remainder render and are covered by tests but have not been clicked on the QA host. My work is the one destination with no screen at all.

**Where the defects were found.** Roughly two thirds of finished work was sent back once by adversarial review, almost always for something real: a waitlist nobody could join, money owed that counted cancelled orders, a settings panel that said Saved and persisted nothing, a floor showing the server's clock, a storefront that had stopped selling passes. Every one of those looked finished until somebody exercised it. Keep the review step.
