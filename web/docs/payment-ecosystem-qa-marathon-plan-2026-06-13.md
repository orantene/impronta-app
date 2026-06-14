# Payment Ecosystem — Marathon Execution Plan (drive everything to 100%)

> One self-contained, resumable playbook to take the **entire** Tulala/Impronta payment ecosystem
> (booking money rail + subscriptions) to 100% — every remaining QA story driven with real evidence,
> every found bug fixed + shipped, the three deferred feature-gaps **built**, and the live go-live gate
> fully prepped for the one human action that cannot be automated.
>
> Dated 2026-06-13. Companion: `payment-ecosystem-qa-playbook-2026-06-13.md` (the §13 tracker is the
> live source of truth; this plan is the *execution harness* over it). Run model: I (Claude, Opus)
> manage it as a marathon — multi-agent where work fans out safely, sequential where state is shared.

---

## 0. What "100% perfect" means here (read first — honest scope)

**Done autonomously by the marathon (everything below is in scope):**
- Every QA story in the playbook §13 tracker driven to ✅ with real Stripe ids + DB rows.
- Every bug found fixed, gated (tsc + lint + test:billing), shipped via PR → main, deploy:smoke green.
- The 3 deferred feature-gaps **built + QA'd**: client in-chat talent picker (2.10), deposits/partial (6.3), instant-book (6.4).
- The §16.4 code-quality fixes (coordinator RPC nuances, dunning re-sync, types regen).
- All test fixtures created + **deleted/restored**; zero residue in prod Supabase; final clean-state proof.

**The TWO things that are irreducibly human (a hard safety line — NOT a gap in the plan):**
1. **§12 — the first real-money LIVE booking on live Stripe keys.** I will never move real money. The
   marathon fully *prepares* it (verifies every gating code path in test mode, writes the exact owner
   runbook, pre-flights env) — the ~5-minute live execution is the owner's, by design.
2. **Stripe's hosted KYC iframe click-through (1.1/1.3).** The embedded onboarding form is served by
   stripe.com cross-origin; the *app contract* around it (account create → AccountSession mint → status
   mirror) is proven, and settlement to enabled accounts is proven — only the human KYC keystrokes
   inside Stripe's iframe are out of reach. The marathon attempts a browser-driven completion of the
   Stripe **test** onboarding; if Stripe's test iframe can't be driven, this stays a 1-click owner step.

Everything else = 100%, autonomously. This document is explicit about that boundary so "100%" is honest.

---

## 1. Current state (already ✅ as of 2026-06-13, do NOT redo)

Proven end-to-end this cycle (real artifacts) — see playbook §15 evidence log:
- **Both spine economics**: agency 3-lane (talent $700 protected + agency $270 + platform $60) and hub
  2-lane (talent $970 + platform $60), each: offer→approve(client+talent)→convert→snapshot→Pay-now PI→
  **live signed webhook**→markPaid→real transfers. Bookings 143ed619 / b4e0405a (cleaned up).
- **Money safety**: full refund reversal (8.1), partial refund talent-protected (8.2), dispute
  created/won (8.3), amount/currency guards (8.4/8.5 code+unit), held→release (7.3, real `tr_…`),
  reconcile-cron auth gate (7.4), idempotency (7.5).
- **Subscriptions**: workspace upgrade (11.1), talent Pro (11.2), cancel/downgrade (11.5), portal (11.6).
- **Coordination**: talent self-coord (3.1), agency coordinator (3.2), admin coordinator mgmt 4 actions (3.3).
- **Onboarding**: talent+agency Connect app-contract (1.1/1.3), unsupported-country wall (1.2), switch (1.4/9.1/9.2 rail logic).
- **Front doors**: 2.1, 2.2, 2.3, 2.4, 2.5 (economics), 2.11, 2.13; 2.9 confirmed gap.
- **Dashboards**: talent earnings (10.1), agency KPIs (10.2), client status (10.3) — data layer.
- **6 bugs shipped**: PRs #376 (payment_status enum), #377 (admin-inquiry enum, silent payout skip,
  talent dunning CHECK), #380 (agency country picker). Playbook merged #379.

## 2. The complete residual backlog (everything left, categorized)

### A — QA drives still owed (autonomous; sequential)
| # | Story | Method | Blocker to clear |
|---|---|---|---|
| 2.7 | Discover single talent | `POST /api/discover/inquiry` as signed-in client | dev server + client session cookie + a discoverable talent |
| 2.8 | Discover shortlist multi-tenant fan-out | same route, talents across 2 owning tenants | seed talents on 2 tenants → assert N inquiries |
| 2.12 | Admin pitch → inquiry (idempotent) | pitch engine: create pitch → `convertPitchToInquiry` ×2 | seed a pitch + token |
| 6.5 | Off-platform cash/wire accrual | agency booking, payment_method=cash → snapshot → `platform_commission_movements` + balances | agency mini-spine w/ cash method |
| 11.3 | Trial start → expiry | trial-promo engine grant → expiry reconcile | find the grant fn + the `trial_will_end`/expiry path |
| 11.4 | Renewal & dunning (live) | force past_due via `invoice.payment_failed` then recovery | needs the §C invoice re-sync fix first |
| 1.1/1.3 | Embedded KYC completion | browser-drive Stripe test onboarding iframe | may be non-automatable → owner 1-click |

### B — Feature-builds (DECISION-GATED; build + QA; each is multi-PR)
| # | Feature | Default design assumption (adjust if wrong) |
|---|---|---|
| 2.10 | Client in-chat talent picker | Client can *propose/add* talent from the tenant's visible roster inside the chat → inserts an `invited` talent participant + re-seeds the approval set; coordinator still owns pricing; gated by the contact-policy trust ladder. |
| 6.3 | Deposits / partial payment | When offer `deposit_pct>0`: first txn charges the deposit (`checkout_type=booking_deposit`) → `client_revenue_lifecycle='deposit_paid'` + balance-due card; **talent/agency payout fan-out fires only on the BALANCE/fully_paid event** (not on the deposit) so the 3-way split stays whole. |
| 6.4 | Instant-book | Talent opt-in flag + a fixed published rate → client "Book now" creates inquiry + a pre-approved offer in one step (auto-accept the talent's approval since they opted in), client pays immediately, convert on payment. Reuses the whole spine. |

### C — Code-quality fixes (autonomous; parallel author → sequential gate/ship)
| Fix | File | Risk |
|---|---|---|
| Coordinator **promote** leaves demoted-primary participant stale | `20260531000000_m2_1_coordinator_actions.sql` (RPC) | med — migration |
| Coordinator **reassign** wipes secondaries (DECISION: preserve them?) | `inquiry-engine-coordinator.ts` `assignCoordinator` | med — behavior change, needs decision |
| `invoice.payment_succeeded` → re-sync subscription to active | `webhook-routing.ts` (expose sub id) + `webhook-handler.ts` | med — classifier change |
| Regenerate `database.types.ts` (stale `engine_persist_booking_commission_snapshot` sig) | generated | low — mechanical, large diff |

### D — Owner-gated (prep only)
| # | Item | Marathon does |
|---|---|---|
| 12.1 | First real LIVE booking | Verify all gating code in test mode; write the exact runbook (§17 of playbook); pre-flight the live env var checklist. **Does NOT execute.** |

---

## 3. Orchestration model (how the marathon multi-tasks safely)

**The load-bearing constraint:** the QA runs against **one** Stripe sandbox (shared balance), **one** prod
Supabase (shared fixtures, unique `stripe_account_id` constraint), **one** dev server + **one** webhook
listener. Therefore:

- **PARALLELIZE (multi-agent Workflow) — read-only or isolated work only:**
  - Deep code analysis / recipe-building / bug-hunt (Phase 1).
  - Feature-build *design* specs (Phase 4a) — independent reads.
  - Code authoring in **`isolation:'worktree'`** agents (each feature/fix on its own git worktree, so
    parallel edits don't collide) — Phase 4b.
  - Adversarial verification of findings (every bug claim refuted by ≥2 independent skeptics before a fix).
- **SEQUENTIAL (I drive in the main loop) — anything that mutates shared Stripe/DB state:**
  - All money-drives (seed → Stripe → webhook → assert → cleanup).
  - All gate → PR → merge → deploy:smoke ship steps (one at a time; main is the single deploy target).
  - All fixture seed/restore.

**Pattern per workflow:** fan-out (analyze/author) → adversarial verify → I integrate + drive + ship
sequentially → record in the tracker. Never let two agents move money or hold the same connected account.

**Cleanup invariant (every phase):** a phase is DONE only when its test rows are deleted and touched
fixtures are restored to the values in §6 — verified by the clean-state query in §7.

---

## 4. Phases (the marathon, in order)

> Each phase: **Goal · Tasks · Method/agents · Assertions · Ship · Cleanup · DoD.** The tracker (§13 of
> the playbook) is updated after every story; this plan's checkboxes mirror it. Resumable: on restart,
> re-read the tracker, skip ✅, continue at the first non-✅.

### Phase 0 — Harness (idempotent re-establish) · sequential · ~5 min
- Goal: dev server :3000 up; `stripe listen` forwarding signed webhooks; CLI at `.local/bin`; signin works.
- Tasks: `preview_start "Next.js Dev Server"` (free :3000 first); confirm `STRIPE_WEBHOOK_SECRET` in
  `.env.local`; (re)start `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; `stripe trigger
  payment_intent.succeeded` → expect 200; `get_stripe_account_info` = acct_1ThlEN…; confirm `active_payout_system='connect'`.
- DoD: webhook 200, signin 307+cookie, sandbox confirmed.

### Phase 1 — Parallel re-analysis + recipes + feature-build specs · multi-agent (Workflow) · read-only
- Goal: precise live-drive recipes for §2.A items + **design specs** for the 3 feature-builds (2.10/6.3/6.4)
  grounded in the *current* code, + re-confirm the §2.C bugs (adversarially).
- Agents (sonnet, `Explore`/default, read-only), one per: discover-routes (2.7/2.8), pitch (2.12),
  off-platform (6.5), trial-engine (11.3), dunning (11.4 + the invoice re-sync fix), coordinator-RPCs (3.3
  nuances), **deposits design** (6.3), **instant-book design** (6.4), **client-picker design** (2.10),
  types-regen scope. Each returns: exact handles, fixtures, assertions, file:line edit map, risks.
- Adversarial-verify pass: for each proposed bug/fix, 2 skeptic agents try to refute "is this really a
  bug / is this fix safe?" — only survivors proceed.
- DoD: a recipe/spec object per item, persisted; decision points surfaced.

### Phase 2 — Remaining QA drives · sequential · money-safe
Drive each (set up → drive → assert DB+Stripe+UI → ✅/fix → cleanup), reusing §6 fixtures:
- **2.7 discover single** — sign in qa-client-1; `POST /api/discover/inquiry` {talentId}; assert 1 inquiry on the talent's owning tenant + skipped-reason reporting.
- **2.8 discover shortlist** — pick talents on 2 owning tenants; assert N inquiries (one per tenant), correct per-tenant subsets, `shortlist_id` in source context (exercises the multi-tenant approval-population path).
- **2.12 pitch** — create a pitch (curated talent) + token → `convertPitchToInquiry` → assert inquiry w/ `source_pitch_id`, pitched talent attached, contact-gate bypass; re-convert → SAME inquiry (idempotent).
- **6.5 off-platform** — agency mini-spine (roster Sofía→qa-agency, owning-party=agency), payment_method=cash → convert → assert snapshot `payment_method='cash'` + `platform_commission_movements` accrual + `platform_commission_balances` bump for qa-agency; talent-owned variant → NO accrual.
- **11.3 trial** — admin grant free Pro/Max trial → assert feature unlock + `trial_will_end` handling → simulate expiry → assert graceful degrade, data preserved.
- **11.4 dunning (after §C fix)** — drive `invoice.payment_failed` (past_due) then a recovery `invoice.payment_succeeded` → assert status returns to active; lifecycle CHECK never violated.
- **1.1/1.3 KYC** — attempt browser completion of the Stripe **test** embedded onboarding; if drivable, assert status→enabled; else mark owner-1-click + keep the proven app-contract.
- DoD: each ✅ in the tracker with evidence; rows cleaned.

### Phase 3 — Code-quality fixes · author (parallel/worktree) → gate/ship (sequential)
- **invoice.payment_succeeded re-sync** (unblocks 11.4): classifier exposes the subscription id on the
  invoice event; handler re-syncs via `syncSubscriptionByType`. Gate + PR + merge + smoke.
- **Coordinator promote** RPC: update the demoted primary's `inquiry_participants` row (no stale access).
  Migration → `db:push`/register → gate + PR + merge + smoke.
- **Coordinator reassign** (DECISION): if "preserve secondaries" → re-insert secondary participant rows
  after the primary swap; else document as intended. 
- **types regen**: `supabase gen types` → commit. (Low risk; verify tsc still clean.)
- DoD: each fix shipped (deploy:smoke green), re-driven where it affects a story (11.4, 3.3).

### Phase 4 — Feature-builds · design (parallel) → build (worktree) → QA-drive → ship (sequential)
For each of 2.10 / 6.3 / 6.4: migration (if any) → engine fn(s) → server action(s) → UI → unit tests →
**live QA drive** (prove the new path end-to-end with real Stripe where money moves) → gate → PR → merge
→ smoke. Build order: **6.3 deposits** (highest money-risk, design-locked above) → **6.4 instant-book**
(reuses the spine) → **2.10 client picker** (lowest money-risk). Each is its own PR(s).
- DoD: feature works end-to-end in a live drive, its new tracker rows (6.3/6.4/2.10) flip to ✅, migration
  applied+registered, deploy:smoke green, fixtures cleaned.

### Phase 5 — Live-gate prep (owner handoff) · no real money
- Re-verify in test mode: `assertLivePayoutSafe`/`isLiveStripeKey` gating, the signed-webhook path, the
  3-way split, refund/dispute reversal, subscription sync, held-release, the reconcile cron + `CRON_SECRET`.
- Produce: the exact live env-var checklist + the one-booking runbook (playbook §17) + a go/no-go pre-flight.
- DoD: a single owner runbook; everything test-proven; nothing left but the human keystrokes.

### Phase 6 — Final verification + scoring + clean-state proof
- Re-run the clean-state query (§7) → 0 test rows, all fixtures at §6 baselines.
- `deploy:smoke` green; tracker 100% (every row ✅ or honestly owner-gated).
- Honest per-surface score (no inflation) + the final report + memory update.
- DoD: tracker fully green/owner-gated; clean-state proven; report delivered.

---

## 5. Decision points (defaults chosen; flag to override)
1. **Build the 3 feature-gaps now?** Default in this plan: **YES** (2.10/6.3/6.4), since "100%". (Earlier
   they were proposal-only — confirm, since each is real product + money-flow work.)
2. **Deposits payout timing** (6.3): default = payout on **fully_paid only** (talent not paid on deposit).
3. **Instant-book approval** (6.4): default = opt-in talents **auto-accept** their offer leg.
4. **Coordinator reassign** (3.3 fix): default = **preserve** secondary coordinators on a primary reassign.
5. **Live gate**: default = **owner-run** (I never move real money).

## 6. Fixtures & reusable assets (the marathon reuses these)
- Tenants: qa-agency `22222222-2222-2222-2222-222222222222`; Tulala hub `40081ec3-5ca8-43a0-b50b-31c927b2716b`.
- Users: qa-admin `4b9e595d-…` (super_admin, pw `Impronta-QA-Admin-2026!`); qa-client-1 `bb31fa4c-…`; qa-client-2 `688787f4-…`.
- Talents (claimed): Sofía `878cb63f-…` (user 20057931, Impronta-primary), Luis `e68ffb51-…` (7ecf3011), Marco `de81316a-…` (428d1599, tulala-only), QA Free Seats TAL-92041..45 (unclaimed).
- Transfer-ready connected accts (current platform): talent `acct_1Thlqb4Oz1p0TN0w`, agency `acct_1Thlqe7lgUYnVcw2`, spare `acct_1Ti08t5uRYUo0Duw`.
- Test prices (test-mode Stripe): agency `price_1Ti0EQ7Oqi82ykAIzIueOkM0` ($29/mo), talent Pro `price_1Ti1fp7Oqi82ykAImkyGyoSK` ($19/mo). Env: `STRIPE_PRICE_AGENCY_MONTHLY`, `STRIPE_PRICE_TALENT_PRO_MONTHLY` in `.env.local`.
- Baseline state to RESTORE after: qa-agency = plan_tier free, default_coordinator NULL, stripe NULL/none; Sofía stripe `acct_1TdecR5oVqehJgOx`/enabled; Marco/Luis/seats per their start; payout_accounts total = 3 (all under tenant 0001).
- Driving: `NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --env-file=.env.local scripts/_sandbox/<x>.ts` (scripts/_sandbox is throwaway, never committed, deleted at the end).
- Convert needs auth.uid() → sign in qa-admin (pw) for a user-context client; other engine_* RPCs take service-role + `p_actor_user_id`; coordinator secondary/promote RPCs need the qa-admin JWT.

## 7. Clean-state proof (run at the end of every phase + at the finish)
```sql
select 'qa_agency' k, concat('tier=',plan_tier,' coord=',coalesce(default_coordinator_user_id::text,'NULL'),' stripe=',coalesce(stripe_account_id,'NULL')) v from agencies where id='22222222-2222-2222-2222-222222222222'
union all select 'marco', concat('stripe=',coalesce(stripe_account_id,'NULL'),'/',stripe_account_status,' plan=',talent_plan_key) from talent_profiles where id='de81316a-8939-49d0-afbc-f946c64648af'
union all select 'sofia', concat('stripe=',coalesce(stripe_account_id,'NULL')) from talent_profiles where id='878cb63f-6999-4ed3-8469-35e5a2a1c17a'
union all select 'qa_agency_subs', count(*)::text from workspace_subscriptions where tenant_id='22222222-2222-2222-2222-222222222222'
union all select 'qa_agency_roster', count(*)::text from agency_talent_roster where tenant_id='22222222-2222-2222-2222-222222222222'
union all select 'qa_agency_members', count(*)::text from agency_memberships where tenant_id='22222222-2222-2222-2222-222222222222'
union all select 'total_payout_accounts', count(*)::text from payout_accounts;
```
Expected at finish: qa_agency `tier=free coord=NULL stripe=NULL`, marco `stripe=NULL/none plan=talent_basic`, sofia `stripe=acct_1TdecR5oVqehJgOx`, subs/roster/members = 0, payout_accounts = 3.

## 8. Ship discipline (every code change)
Branch off latest `main` → fix → if migration: `npm run db:push` (or MCP `execute_sql` + register
`schema_migrations` if history-drift blocks) BEFORE merge → gate `cd web && NODE_OPTIONS=--max-old-space-size=8192
npx tsc --noEmit && npm run lint && npm run test:billing` → commit ONLY the changed files (the tree has
unrelated changes — leave them; never commit `scripts/_sandbox/*` or `.env.local`) → PR → merge → `npm run
deploy:smoke` (re-alias domains if drift). Report each ship.

## 9. Risk register & rollback
- **Shared Stripe balance** → fund via `tok_bypassPending` if low; never run two transfers concurrently.
- **Unique `stripe_account_id`** → only one talent_profile/agency may hold a given acct at a time; null the prior before reassigning.
- **Convert RPC auth.uid()** → must use a signed-in user client, not service-role.
- **Migration history-drift** → `db:push` may refuse; fall back to MCP `execute_sql` + manual `schema_migrations` row (proven pattern, PRs #364/#376).
- **Feature-build money bugs** → every new money path gets a live refund/idempotency check before ✅.
- **Real Impronta tenant `00000000-…-0001`** → NEVER mutate; if owning-party resolves there, patch the test participant to qa-agency (as in Run A).
- **Rollback**: each PR is atomic + revertable; migrations are additive (enum ADD VALUE / ADD COLUMN) — no destructive DDL.

## 10. Resume / idempotency
The marathon is interrupt-safe: state lives in the playbook §13 tracker + the DB + merged PRs, not in
memory. On restart: Phase 0 (re-establish harness) → re-read the tracker → skip ✅ rows → resume at the
first non-✅. Workflows resume via `resumeFromRunId` (cached agents return instantly). Clean-state query
(§7) confirms no orphaned fixtures from a prior interrupted run before continuing.

## 11. Rough budget
Phase 1 ≈ 10 analysis agents. Phase 4 ≈ 3 features × (1 design + 1–2 author worktrees + verify). Phases
2/3/5/6 mostly main-loop sequential. Token cost is not the constraint (ultracode) — correctness + clean
state are. Estimated several multi-agent workflows + ~8–12 PRs total.

---

## 12. Execution checklist (tick as the marathon runs)
- [ ] P0 harness green
- [ ] P1 recipes + feature specs + adversarial bug-verify
- [ ] P2: 2.7 ▫ 2.8 ▫ 2.12 ▫ 6.5 ▫ 11.3 ▫ 11.4 ▫ 1.1/1.3-KYC
- [ ] P3: invoice re-sync ▫ coord-promote ▫ coord-reassign ▫ types regen
- [ ] P4: 6.3 deposits ▫ 6.4 instant-book ▫ 2.10 client picker
- [ ] P5 live-gate prep + owner runbook
- [ ] P6 final verify + clean-state proof + score + report
