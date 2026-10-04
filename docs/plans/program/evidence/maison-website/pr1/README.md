# Maison website — PR 1 evidence

**Branch:** `cursor/maison-phase-a-foundation-54c1`  
**PR:** https://github.com/orantene/impronta-app/pull/2317  
**Closes (foundation):** W1–W8 (flag-safe)

## Delivered

- Migration `supabase/migrations/20261231287000_maison_website_foundation.sql`
  - catalog `demo` kind + `for_design`
  - `talent_sites` pending-design columns
  - `talent_faq_items` + `talent_content_import_batches`
  - offerings `import_batch_id`
  - seed `maison-nails` demo row
- `TALENT_MAISON_THEME_ENABLED` (default off)
- Gallery gate: `personalSiteEdit` **only when** Maison flag on; else `personalSiteSections`
- Catalog filter hides `maison*` (DB + built-ins fallback) unless flag on
- Design allowlist: tabs / accordion / reveal / services_catalog
- Maison Design + 5 Looks builtins; W8 foundation probe (validate-only, not published sync)
- Flags-off tests

## Gates

- `npm run typecheck`
- `npm run lint`
- unit: maison seed / visibility / builtins / gallery bootstrap / load-catalog static

## db:push

Applied to remote Tulala Digital (`pluhdapdnuiulvxmyspd`) via Supabase MCP `apply_migration` name `maison_website_foundation` — **success**. Verified: `talent_faq_items`, `talent_content_import_batches`, `talent_sites.pending_design`, catalog `demo`/`for_design`, seed `maison-nails`.
