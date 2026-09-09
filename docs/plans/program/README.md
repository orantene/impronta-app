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
