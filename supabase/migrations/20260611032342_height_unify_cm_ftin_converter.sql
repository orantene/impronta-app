-- ============================================================================
-- Height field unification — one canonical "Height" (cm) with a live ft/in
-- converter in the editor.
--
-- Before: the editor showed TWO height cards —
--   • physical.height_cm        ("Height (cm)", number)   ← canonical, KEEP
--   • physical.height_imperial  ("Height (ft/in)", select of COARSE RANGES
--                                 "5 ft 0–5 ft 3" … )       ← KILL
-- The imperial field stored only a coarse range and was a pure duplicate of
-- the precise cm value. Audit (2026-06-11): 47 talents had an imperial value,
-- and 0 of them lacked a cm value — so deprecating it loses ZERO height data.
--
-- The ft/in INPUT now lives in the FieldEditor as a live converter on the cm
-- field (cm stays the only stored value), so the range field is redundant.
--
-- This migration:
--   1. Renames the canonical field's label "Height (cm)" → "Height" in both
--      the System-B registry (profile_field_definitions) and the legacy
--      System-A directory-filter catalog (field_definitions) so every surface
--      reads "Height".
--   2. Deprecates physical.height_imperial (the range select). The resolver
--      filters deprecated_at IS NULL, so it disappears from the editor,
--      registration wizard, and admin hub. Its 47 orphaned value rows are
--      left in place (harmless, never surfaced) so this stays fully reversible
--      — clear deprecated_at to bring it back.
-- ============================================================================

-- 1a. Canonical cm field → label "Height" (System B registry).
UPDATE public.profile_field_definitions
SET label = 'Height',
    label_es = CASE WHEN label_es IS NOT NULL AND btrim(label_es) <> '' THEN 'Altura' ELSE label_es END,
    updated_at = now()
WHERE field_key = 'physical.height_cm';

-- 1b. Legacy System-A directory-filter catalog → label "Height".
UPDATE public.field_definitions
SET label_en = 'Height',
    label_es = CASE WHEN label_es IS NOT NULL AND btrim(label_es) <> '' THEN 'Altura' ELSE label_es END,
    updated_at = now()
WHERE key = 'height_cm';

-- 2. Deprecate the imperial RANGE field (reversible: clear deprecated_at).
UPDATE public.profile_field_definitions
SET deprecated_at = now(),
    updated_at = now()
WHERE field_key = 'physical.height_imperial'
  AND deprecated_at IS NULL;
