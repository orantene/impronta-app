# Phase 0 — Ownership Map + Architecture Lock

**Branch:** `saas/phase-0`
**Duration target:** 1 week
**Scope:** Docs only. Freeze-compatible (can run in parallel with post-M8 freeze-queue items A/B/C).
**Prerequisite for:** Phase 1. O1–O7 can still be open at Phase 0 end.

---

## Deliverables (Plan §23)

| # | Deliverable | File |
|---|---|---|
| 1 | Entity ownership map — every table/field classified by zone, owner, editor, approver, visibility | [`01-entity-ownership-map.md`](01-entity-ownership-map.md) |
| 2 | Capability definitions + role mapping (platform + agency) | [`02-capabilities-and-roles.md`](02-capabilities-and-roles.md) |
| 3 | State machines (agency, membership, invitation, domain, roster, hub visibility, field promotion) | [`03-state-machines.md`](03-state-machines.md) |
| 4 | Settings inheritance spec with mutability classifications | [`04-settings-inheritance.md`](04-settings-inheritance.md) |
| 5 | Search layer definitions (hub, agency-public, agency-admin) | [`05-search-layers.md`](05-search-layers.md) |

---

## Non-goals for Phase 0

- No code changes.
- No migrations.
- No UI work.
- No resolution of O1–O7 (they can remain open through Phase 0; they block Phase 1).
- No retirement of the post-M8 freeze-queue items (those are a separate workstream).

---

## Acceptance gate (before Phase 1 opens)

1. All five deliverables merged to `main` (or the working branch the team agrees on for SaaS work).
2. User reads + accepts each deliverable explicitly.
3. O1–O7 resolved and moved to Locked in Plan §27 Decision Log.
4. Post-M8 freeze-queue items A and C merged (B is a KEEP).
5. `docs/saas/README.md` updated to mark Phase 0 complete, Phase 1 next.

---

## What these docs are (and are not)

These deliverables **extract and structure** what the Plan already says, cross-referenced to Plan sections. They are the spec that engineers and reviewers use during Phase 1–8. They are **not** a second source of truth — any apparent conflict with the Plan is resolved by re-reading the Plan. If the Plan is wrong, amend the Plan's Decision Log, not these docs.

Every claim in a Phase 0 doc carries a Plan section pointer (e.g. *Plan §4.5*, *L7*). When you change a deliverable, update the pointer or add a Decision Log entry that supersedes it.
