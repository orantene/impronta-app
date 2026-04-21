-- SaaS Phase 5 / M0 — Defect fix for cms_sections_props_media_ref_check().
--
-- Prereq:
--   * 20260620100000_saas_p5_m0_site_admin_foundations.sql installed the
--     original function + trigger.
--
-- Defect:
--   The original body projected `value::UUID` where `value` is jsonb:
--
--       FOR media_id IN
--         SELECT value::UUID
--         FROM jsonb_path_query(NEW.props_jsonb, '$.**.mediaAssetId') AS t(value)
--         WHERE jsonb_typeof(value) = 'string'
--       LOOP ...
--
--   PostgreSQL has no direct jsonb -> uuid cast, and the SELECT list is
--   type-checked at plan time, before the WHERE filter is applied. Result:
--   the function raised SQLSTATE 42846 ("cannot cast type jsonb to uuid")
--   on ANY INSERT OR UPDATE OF props_jsonb on cms_sections, regardless of
--   whether the props actually contained a mediaAssetId. The trigger was
--   effectively a global block on cms_sections writes.
--
-- Fix:
--   Unwrap the jsonb string to text first via `#>> '{}'`, then cast to UUID.
--   This preserves the original contract exactly:
--     * non-string jsonb scalars and missing keys are still skipped;
--     * a string that is not a valid UUID still raises (as before, if the
--       cast had ever been reachable);
--     * a string UUID is validated against live (non-soft-deleted) rows
--       in public.media_assets; missing/soft-deleted ids raise the existing
--       'MEDIA_REF_BROKEN' exception with SQLSTATE 23503.
--
-- Behavior otherwise unchanged. No signature change, no trigger change, no
-- data migration. Idempotent via CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.cms_sections_props_media_ref_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  media_id UUID;
BEGIN
  -- Walk all string values in props_jsonb with key mediaAssetId.
  -- Unwrap jsonb string -> text via `#>> '{}'` before casting to uuid,
  -- because PostgreSQL has no direct jsonb->uuid cast.
  FOR media_id IN
    SELECT (value #>> '{}')::UUID
    FROM jsonb_path_query(NEW.props_jsonb, '$.**.mediaAssetId') AS t(value)
    WHERE jsonb_typeof(value) = 'string'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.media_assets
      WHERE id = media_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'MEDIA_REF_BROKEN: media asset % missing or soft-deleted', media_id
        USING ERRCODE = '23503';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMIT;
