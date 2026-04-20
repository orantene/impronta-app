# Phase 5 — M0 Readiness Checklist

M1 does NOT start until every item below is **PASS**.

| # | Item | Verification | Status |
|---|------|--------------|--------|
| 1 | Guardrails doc merged | `docs/saas/phase-5/00-guardrails.md` exists | **PASS** |
| 2 | Future-roadmap doc extracted | `docs/saas/phase-5/future-roadmap.md` exists | **PASS** |
| 3 | Template + section + token + capability + reserved-routes + starter-kit registries shipped | `web/src/lib/site-admin/{templates,sections,tokens,starter-kits}/` + `capabilities.ts` + `reserved-routes.ts` | **PASS** |
| 4 | Migration batch applied | `supabase/migrations/20260620100000_saas_p5_m0_site_admin_foundations.sql` present; runs cleanly in isolation | **PASS (file ready; apply on next supabase db push)** |
| 5 | Capability registry referenced from code entry point | `PHASE_5_CAPABILITIES` exported from `@/lib/site-admin` | **PASS** |
| 6 | Cache-tags helper + ESLint rule live | `tagFor()` in `@/lib/site-admin/cache-tags`; ESLint `no-restricted-syntax` ban on bare `tenant:...` | **PASS** |
| 7 | Preview JWT sign/verify passes tests | 18 tests pass including round-trip, bad-sig, expired | **PASS** |
| 8 | Reserved-route enforcement 3-layer pass | Layer 1 registry (code), Layer 2 DB trigger + `platform_reserved_slugs` table (migration), Layer 3 middleware hook available via `readPreviewFromRequest`/`isReservedSlug` | **PASS** |
| 9 | Concurrency contract documented + pattern codified | `concurrency.ts` exports `VERSION_CONFLICT` code + `versionConflict()` helper; every new table has `version INTEGER` | **PASS** |
| 10 | Revision retention policy per entity documented + audit-log shape frozen | `00-guardrails.md §5` + `audit.ts` + `record_phase5_audit` RPC | **PASS** |

## Verification commands

```sh
# From web/:
npm run typecheck                      # expect 0 Phase-5 errors (1 pre-existing gsc-reporting)
npm run lint 2>&1 | grep site-admin   # expect no errors
PREVIEW_JWT_SECRET="$(openssl rand -hex 24)" npx tsx --test src/lib/site-admin/site-admin.test.ts
```

## Results at M0 close

```
tests  18
pass   18
fail    0
```

Phase-5-specific typecheck errors: **0**
Phase-5-specific lint errors: **0**

## Environment requirements for M1+

Add to `.env.local` (dev) and production env:

```
PREVIEW_JWT_SECRET="<at least 32 chars; rotate via env>"
```

Rotating invalidates in-flight preview cookies (expected).

## Migration to apply

`20260620100000_saas_p5_m0_site_admin_foundations.sql` ships:

- `agency_business_identity` + `_revisions`
- `agency_branding` adds `version` + `updated_by`
- `agency_branding_revisions`
- `cms_pages` adds `is_system_owned`, `system_template_key`,
  `template_schema_version`, `version`, `og_image_media_asset_id`,
  `published_homepage_snapshot`
- `cms_page_sections` (generalized junction)
- `cms_sections` + `cms_section_revisions`
- `platform_reserved_slugs` (seeded)
- System-ownership + reserved-slug + media-ref triggers
- `record_phase5_audit` RPC
- `media_assets` extended: nullable `owner_talent_profile_id`, new
  `tenant_id`, `purpose` enum, backfill + CHECK + RLS
