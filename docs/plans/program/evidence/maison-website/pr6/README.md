# Maison website — PR 6 evidence

**Branch:** `cursor/maison-pr6-import-8b57`  
**Closes:** W44–W59 (architecture + tests)  
**Base:** `805bbf146` (PR5 apply/review/publish)

## Delivered

| W | Work | Proof |
|---|---|---|
| W44 | Import entry · 13 available | `ThemeDetailScreen` → `ImportStarterPanel` |
| W45 | Groups collapsed, nothing selected | panel open state defaults false; empty selection |
| W46 | Group checkbox ≠ chevron (44px) | separate `*-check` / `*-chevron` controls |
| W47 | No images group (preview-only) | seed `images_licensed_for_reuse: false` + static test |
| W48 | Service rows + Details | price/duration in Details toggle |
| W49 | FAQ prompts (empty answers) | `talent_faq_items` draft insert |
| W50 | Section text (3 keys) | selection → batch `created_record_ids.section_text` |
| W51 | Sticky summary + Review disabled until selection | `selectionSummaryLine` + disabled Review |
| W52 | Duplicate name+category | `findServiceDuplicate` (Manicura en gel) |
| W53–W54 | Keep / Add draft / Skip | resolutions on review step |
| W55 | Organize auto category map | organize body copy |
| W56 | Batch + idempotent writes | `talent_content_import_batches` + starter keys |
| W57 | Result counts; no empty skipped | details omit empty skip rows |
| W58 | Undo import (ask if edited) | `undoMaisonImportAction` confirm |
| W59 | Partial retry + Services banner | retry + `ServicesWebsiteSetupBanner` |

## Flag

All import actions require `TALENT_MAISON_THEME_ENABLED`. Flag-off → entry never mounts (host null).

## Out of scope

- Custom colors (PR7) · live `pending_design` / Design options (PR8)
- Visual pixel match → **BLOCKED** (no owner PDF/prototype)

## Gates

- `npm run typecheck && npm run lint`
- Unit: `maison-starter-catalog.test.ts`, `maison-import.static.test.ts`

## Migrations

None — uses PR1 `talent_content_import_batches` + `talent_faq_items` + offerings `import_batch_id`.
