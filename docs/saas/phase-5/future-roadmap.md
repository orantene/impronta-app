# Phase 5 — Future roadmap (M7+)

These surfaces are authored during M0 and **do not block Phase 5**. M0
architecture is additive; each item below plugs in without schema churn.

---

## M7 — Starter Kit import / Quick Start

Agency selects a kit from the picker; importer materializes tenant-owned
copies per the manifest contract (`starter-kits/contract.ts`).

Modes: `empty_site`, `additive`, `reset`. Overwrite behavior is declared per
kit. Every collision raises a confirmation (unless kit sets `skip_existing`).

UX guardrails:
- Kit picker with `previewMedia` + "what's included" summary.
- Empty-site warning when target mode mismatches tenant state.
- Launch checklist surfaced post-import.

---

## Site Health / Publish Readiness panel

Pulls from publication safety gates (`00-guardrails.md §9`):
- required slots filled per template
- referenced media present
- no stale preview tokens live
- branding tokens within allowlist
- no draft blocks referenced by live surfaces

Actionable: each gate failure links to the surface that fixes it.

---

## Redirects management UI

Tenant-facing view/edit/disable/audit on `cms_redirects`. Decoupled from
M3's slug-change auto-creation.

---

## Global SEO / site defaults

Title patterns, default meta description, default share image,
organization / schema.org metadata, per-page-type `noindex` rules.

Lives on a new `agency_seo_defaults` table (not in Phase 5).

---

## Central CTA / contact destinations

Tenant-scoped registry of valid CTA targets (URLs + labels). Consumed by
header CTA, hero sections, homepage callouts, starter kits. Prevents
hard-coded URLs across content.

---

## Revision comparison / publish diff UX

On every publish-gated surface, show "what changed vs live" summary. Pulls
`before_hash` / `after_hash` from audit log + full snapshots from revision
tables.

---

## Media UX layer

- Crop / focal point
- Alt-text management
- Usage visibility ("used on N pages, M sections")
- Bulk cleanup aligned with nightly GC

Obeys Phase-5 media rules (`00-guardrails.md §8`).

---

## Locale coverage / translation status panel

Operator view: "EN complete; ES missing N items." Surfaces per-page-type
translation gaps.

---

## Permissions UI (roles)

Agency-owner self-service for role assignment across
`agency_admin | coordinator | editor | viewer` within the tenant.

Built on the Phase-5 capability registry; no new platform roles.

---

## Content components library view

Agency-facing browser of approved section types grouped by
`businessPurpose`. Surfaces which types the agency has permission to use.

---

## Section-level translation

Per-locale variants of `cms_sections`. Requires a new
`cms_section_translations` table (deferred).

---

## Per-section style overrides

Currently tokens are tenant-global. A future milestone may allow section-
level overrides against the same allowlist.
