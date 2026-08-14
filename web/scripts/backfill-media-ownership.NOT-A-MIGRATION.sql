-- ============================================================================
-- backfill-media-ownership.NOT-A-MIGRATION.sql
--
-- ⚠️  THIS IS NOT A MIGRATION. Do not move it into supabase/migrations/.
--     It is a one-time, hand-run, idempotent data pass. `db push` must never
--     pick it up: a data backfill that reruns on every environment is how you
--     get a "fix" silently re-applied to rows a human already corrected.
--
-- WHAT IT IS FOR
-- ──────────────
-- Phase 1 of web/docs/media-ownership-and-brand-library-plan-2026-08-10.md
-- makes every WRITER stamp ownership. This handles the rows written before
-- that: as of 2026-08-10, 2,334 talent media rows say ownership_kind='talent'
-- because that is the column DEFAULT, not because anyone decided it, and
-- uploaded_by_user_id is set on 6 of them.
--
-- THE DECISION IT IMPLEMENTS (plan §9, decision №1)
-- ─────────────────────────────────────────────────
-- Legacy media STAYS TALENT-OWNED. We do not retroactively hand agencies
-- ownership of photos on provenance guesses — that would poison the claim
-- funnel. Workspaces instead use the in-product claim tool (Media page →
-- select photos → "Mark N as ours"), which notifies the talent and is
-- reversible for 14 days.
--
-- So this script is deliberately conservative. It only:
--   1. normalizes any NULL / unrecognized ownership_kind to 'talent'
--   2. clears owner_tenant_id on talent-owned rows (it means nothing there,
--      and a stray value would read as an agency claim in phase 2/3)
--   3. mirrors uploaded_by_user_id → created_by (and back) where exactly one
--      of the pair is known, so provenance is not half-recorded
--   4. tags rows whose uploader is genuinely unknowable, so the claim tool
--      and any later audit can say "uploader unknown" instead of implying
--      nobody uploaded it
--
-- It does NOT invent an uploader. There is no column anywhere that records who
-- uploaded a 2025 photo; guessing from talent_profiles.origin_workspace_id
-- would put a name on a row that never had one.
--
-- HOW TO RUN
-- ──────────
--   1. Run SECTION 0 alone. Read the numbers. They should match the plan's
--      appendix (or explain why they don't) before you change anything.
--   2. Run SECTION 1 inside the transaction as written. It is idempotent:
--      running it twice reports 0 rows the second time.
--   3. Re-run SECTION 0 to confirm the after-state.
--
-- Every statement is scoped so a partial run is safe to resume.
-- ============================================================================


-- ── SECTION 0 — READ ONLY. Run this first, and again afterwards. ────────────

-- 0a. Ownership distribution across all live media.
SELECT
  COALESCE(ownership_kind, '(null)')              AS ownership_kind,
  purpose,
  COUNT(*)                                        AS rows,
  COUNT(owner_tenant_id)                          AS with_owner_tenant,
  COUNT(uploaded_by_user_id)                      AS with_uploader,
  COUNT(created_by)                               AS with_created_by
FROM public.media_assets
WHERE deleted_at IS NULL
GROUP BY 1, 2
ORDER BY rows DESC;

-- 0b. Exactly what SECTION 1 would touch, before it touches it.
SELECT
  COUNT(*) FILTER (
    WHERE ownership_kind IS NULL
       OR ownership_kind NOT IN ('talent', 'agency', 'platform')
  ) AS step1_unknown_kind,
  COUNT(*) FILTER (
    WHERE ownership_kind = 'talent' AND owner_tenant_id IS NOT NULL
  ) AS step2_stray_owner_tenant,
  COUNT(*) FILTER (
    WHERE created_by IS NULL AND uploaded_by_user_id IS NOT NULL
  ) AS step3a_created_by_missing,
  COUNT(*) FILTER (
    WHERE uploaded_by_user_id IS NULL AND created_by IS NOT NULL
  ) AS step3b_uploader_missing,
  COUNT(*) FILTER (
    WHERE uploaded_by_user_id IS NULL
      AND created_by IS NULL
      AND NOT (metadata ? 'ownership_backfill')
  ) AS step4_uploader_unknowable
FROM public.media_assets
WHERE deleted_at IS NULL;

-- 0c. Provenance hints for the humans running the claim tool afterwards:
--     which workspace originally created each talent, and how much of their
--     media is still unattributed. This informs "was this our shoot?" — it is
--     NOT used to write anything.
SELECT
  a.name                                          AS origin_workspace,
  COUNT(DISTINCT tp.id)                           AS talents,
  COUNT(ma.id)                                    AS talent_owned_media,
  COUNT(ma.id) FILTER (WHERE ma.uploaded_by_user_id IS NULL) AS uploader_unknown
FROM public.talent_profiles tp
JOIN public.media_assets ma
  ON ma.owner_talent_profile_id = tp.id
 AND ma.deleted_at IS NULL
 AND ma.ownership_kind = 'talent'
LEFT JOIN public.agencies a ON a.id = tp.origin_workspace_id
GROUP BY 1
ORDER BY talent_owned_media DESC;


-- ── SECTION 1 — THE WRITE. Idempotent. Run as one transaction. ──────────────

BEGIN;

-- 1. Any row whose ownership_kind is NULL or off-enum becomes talent-owned.
--    (The column is NOT NULL DEFAULT 'talent' with a CHECK, so this should
--    report 0. It stays here because "should be 0" is not "is 0", and this
--    script is the place that proves it.)
UPDATE public.media_assets
SET ownership_kind = 'talent',
    updated_at     = now()
WHERE ownership_kind IS NULL
   OR ownership_kind NOT IN ('talent', 'agency', 'platform');

-- 2. owner_tenant_id is meaningful ONLY for ownership_kind='agency'
--    (constraint media_assets_agency_ownership_chk). A value left on a
--    talent-owned row would read as an agency claim to the phase 2/3
--    resolver, so clear it.
UPDATE public.media_assets
SET owner_tenant_id = NULL,
    updated_at      = now()
WHERE ownership_kind <> 'agency'
  AND owner_tenant_id IS NOT NULL;

-- 3. Provenance is stored in two columns that must agree. Where exactly one
--    is known, copy it across. Where neither is known we leave both NULL —
--    see step 4.
UPDATE public.media_assets
SET created_by = uploaded_by_user_id,
    updated_at = now()
WHERE created_by IS NULL
  AND uploaded_by_user_id IS NOT NULL;

UPDATE public.media_assets
SET uploaded_by_user_id = created_by,
    updated_at          = now()
WHERE uploaded_by_user_id IS NULL
  AND created_by IS NOT NULL;

-- 4. Mark the genuinely unattributable rows. This is the honest answer to
--    "who uploaded this?" for pre-phase-1 media: nobody recorded it. Tagging
--    it beats leaving a NULL that a future reader mistakes for a bug, and the
--    `? 'ownership_backfill'` guard makes the statement a no-op on re-run.
UPDATE public.media_assets
SET metadata   = COALESCE(metadata, '{}'::jsonb)
                 || jsonb_build_object(
                      'ownership_backfill',
                      jsonb_build_object(
                        'uploader', 'unknown_pre_phase1',
                        'default_owner', 'talent',
                        'plan', 'media-ownership-and-brand-library-plan-2026-08-10',
                        'at', to_jsonb(now())
                      )
                    ),
    updated_at = now()
WHERE uploaded_by_user_id IS NULL
  AND created_by IS NULL
  AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'ownership_backfill');

COMMIT;

-- Now re-run SECTION 0. Expected after-state:
--   • step1..step4 in query 0b all read 0
--   • query 0a shows no '(null)' ownership_kind and no owner_tenant_id on any
--     non-agency row
--   • the talent/agency split is UNCHANGED — this script never reassigns
--     ownership. That only happens through the in-product claim tool, with
--     the talent notified and a 14-day objection window.
