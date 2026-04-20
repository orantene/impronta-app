# SaaS / Multi-Tenant Build — Tracking Hub

This directory is the in-repo execution record for the multi-tenant SaaS transition. It is **not** the plan. It is the place where Phase artifacts, open-decision resolutions, and transitional-debt tickets live so that any fresh session can pick up the work without paraphrasing memory.

---

## Authoritative sources (do not duplicate here)

| Artifact | Location | Purpose |
|---|---|---|
| **The Plan** | `/Users/oranpersonal/.cursor/plans/multi-tenant_saas_architecture_bb191713.plan.md` | ~3050 lines. Single source of truth for architecture, migration order, decision log. **Read it; do not paraphrase.** |
| **Charter** | `memory/project_saas_build_charter.md` | Operating contract: phase rhythm, directives, Claude hard limits. |
| **Blueprint** | `memory/project_impronta_blueprint.md` | Pre-SaaS platform context. |

Anything in this folder is a deliverable *against* those sources, not a replacement.

---

## Phase index

| Phase | Branch | Status | Deliverables |
|---|---|---|---|
| 0 — Ownership map + architecture lock | `saas/phase-0` | **In progress** | `phase-0/` — docs only, freeze-compatible |
| 1 — Multi-tenant foundation schema | `saas/phase-1` | Not started | Additive migrations, tenant_id backfill |
| 1 (First Execution Slice) | `saas/phase-1-first-slice` | Not started | Plan §22.5 — concrete 1–2 week block |
| 2 — Tenant-aware auth + capability system | `saas/phase-2` | Not started | Plan §23 |
| 3 — Agency-scoped admin dashboard | `saas/phase-3` | Not started | Plan §23 |
| 4 — Agency onboarding + subdomain | `saas/phase-4` | Not started | Plan §23 |
| 5 — Custom domains | `saas/phase-5` | Not started | **Human-in-loop required** (Vercel/DNS) |
| 6 — Field governance + taxonomy | `saas/phase-6` | Not started | Plan §23 |
| 7 — Hub approval + duplicate detection + moderation | `saas/phase-7` | Not started | Plan §23 |
| 8 — Billing + entitlement enforcement | `saas/phase-8` | Not started | **Human-in-loop required** (Stripe) |

Each phase ships on its own branch, its own PR, and its own acceptance gate. Silent execution during each phase; report only on completion or critical blocker (charter §6, §10).

---

## Execution state files

- `open-decisions.md` — O1–O7 live tracker. Phase 1 cannot start until all are Locked.
- `transitional-debt.md` — Post-M8 freeze-queue items (AdminInquiryWorkspaceV2, `uses_new_engine` stub, `warnLegacyInquiryV2Render`) and SaaS-era transitional fallbacks with removal tickets (Charter §9, Plan §22.8).
- `validation-queries.md` — Evidence log. Every Phase 1 PR description carries a `SELECT COUNT(*) … WHERE tenant_id IS NULL = 0` result; this is the canonical index of those runs.

---

## Claude's hard limits on this build

Three phases require a human in the loop (Charter §7, Plan §7). Claude flags at phase start; user decides: pair, defer, or authorize a test-only bypass.

1. **Phase 5 (custom domains)** — Vercel Domains API + DNS + SSL.
2. **Phase 8 (billing)** — Stripe dashboard, webhook secrets, test→live.
3. **E2E with real auth** — Magic-link/OTP flows need either a test-only auth bypass or human click-paths.
4. **Scale validation** — Plan §28 needs real load testing + production-shaped dataset.

---

## Reading order for a fresh session

1. `memory/project_saas_build_charter.md`
2. The Plan (Sections 0, 1.5, 22.5, 22.7, 22.8, 22.9, 23, 27)
3. This README + `open-decisions.md` + `transitional-debt.md`
4. `phase-0/README.md` and deliverables
