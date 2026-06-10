-- ============================================================================
-- P3 — Value unification, Tier B (editor-only JSONB blobs). Migration 2 of 3:
-- Stage-2 BACKFILL. Clones the proven ladder from the Tier-A backfill
-- (20260610155433). For each rostered talent carrying a MEANINGFUL value in one
-- of the twelve Tier-B talent_profiles JSONB columns, write a
-- talent_profile_field_values row holding the blob VERBATIM, with the tenant
-- taken from the talent's ACTIVE roster.
--
-- KEY BRIDGE (column → registry field_key):
--   bios               → bios
--   personality_traits → about.personality
--   rates_data         → rates.cards
--   package_rates_data → commercial.packageRates
--   rate_tiers_data    → commercial.rateTiers
--   credits_data       → credits
--   limits_data        → limits
--   social_proof_data  → social_proof.pastClients
--   work_eligibility   → logistics.workEligibility
--   upcoming_visits    → logistics.upcomingVisits
--   media_albums_data  → albums.list
--   documents_data     → documents
--
-- CARVE-OUT: `availability_data` is JSONB too but powers booking queries — it
-- is NEVER migrated and is absent here.
--
-- ── STALE-SEED PURGE (why this is DELETE-then-INSERT, not ON CONFLICT) ──────
-- A pre-P3 demo seed (2026-05-16) left 50 `bios` + 50 `credits` value rows
-- holding a bare jsonb STRING ("Experienced professional ...") — the WRONG
-- shape (the column is a jsonb ARRAY) and identical across all 50 talents.
-- 21 of those stale `bios` rows belong to talents whose real bios column is a
-- non-empty array, so an `ON CONFLICT DO NOTHING` insert would leave the stale
-- string in place → parity mismatch + a wrong placeholder bio surfaced by the
-- Stage-4 read-flip. To converge the two stores on the VERBATIM blob, we first
-- DELETE every existing value row for the twelve Tier-B field_defs, then INSERT
-- the column blob. The delete is SCOPED to the Tier-B field_defs only — no
-- other tier's value rows are touched. This is the same emptiness contract the
-- dual-write helper + Stage-3 parity SQL use, so re-running converges.
--
-- EMPTINESS contract — shared verbatim with the dual-write helper
-- (blob-field-values-catalog.ts) + the Stage-3 parity SQL:
--   ARRAY blobs  present ⇔ jsonb_typeof(col)='array' AND jsonb_array_length(col) > 0
--   OBJECT blob  present ⇔ col IS NOT NULL AND col <> '{}'  (only limits_data)
--
-- TENANT: the columns live on talent_profiles (GLOBAL). We attach the tenant
-- from the talent's active roster (DISTINCT ON lowest created_at to dedupe a
-- talent on >1 roster). A talent with NO active roster gets no value row (the
-- column stays the source — matching the dual-write helper, which skips when
-- tenantId is null).
--
-- Idempotent (DELETE scoped to Tier-B defs, then INSERT from the live column) +
-- reversible:
--   DELETE FROM public.talent_profile_field_values tpfv
--    USING public.profile_field_definitions pfd
--    WHERE tpfv.field_definition_id = pfd.id
--      AND pfd.field_key IN (
--        'bios','about.personality','rates.cards','commercial.packageRates',
--        'commercial.rateTiers','credits','limits','social_proof.pastClients',
--        'logistics.workEligibility','logistics.upcomingVisits','albums.list','documents');
-- ============================================================================

BEGIN;

-- The twelve Tier-B field_defs, resolved once.
WITH tierb_defs AS (
  SELECT id, field_key
  FROM public.profile_field_definitions
  WHERE field_key IN (
    'bios','about.personality','rates.cards','commercial.packageRates',
    'commercial.rateTiers','credits','limits','social_proof.pastClients',
    'logistics.workEligibility','logistics.upcomingVisits','albums.list','documents'
  )
)
-- Purge ALL existing value rows for the Tier-B defs (clears the stale 2026-05-16
-- bios/credits string seed). Scoped to Tier-B only.
DELETE FROM public.talent_profile_field_values tpfv
USING tierb_defs d
WHERE tpfv.field_definition_id = d.id;

-- Re-insert the verbatim blob for every rostered talent with a non-empty blob.
WITH active_tenant AS (
  SELECT DISTINCT ON (atr.talent_profile_id)
    atr.talent_profile_id,
    atr.tenant_id
  FROM public.agency_talent_roster atr
  WHERE atr.status = 'active' AND atr.tenant_id IS NOT NULL
  ORDER BY atr.talent_profile_id, atr.created_at ASC
)
INSERT INTO public.talent_profile_field_values
  (talent_profile_id, field_definition_id, tenant_id, value, workflow_state, last_edited_role)
SELECT src.talent_profile_id, src.field_definition_id, src.tenant_id, src.value, 'live', 'platform'
FROM (
  -- ── ARRAY blobs: present ⇔ jsonb_array_length > 0, stored VERBATIM ────────
  SELECT tp.id AS talent_profile_id, pfd.id AS field_definition_id, at.tenant_id, tp.bios AS value
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'bios'
  WHERE (CASE WHEN jsonb_typeof(tp.bios) = 'array' THEN jsonb_array_length(tp.bios) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.personality_traits
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'about.personality'
  WHERE (CASE WHEN jsonb_typeof(tp.personality_traits) = 'array' THEN jsonb_array_length(tp.personality_traits) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.rates_data
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'rates.cards'
  WHERE (CASE WHEN jsonb_typeof(tp.rates_data) = 'array' THEN jsonb_array_length(tp.rates_data) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.package_rates_data
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'commercial.packageRates'
  WHERE (CASE WHEN jsonb_typeof(tp.package_rates_data) = 'array' THEN jsonb_array_length(tp.package_rates_data) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.rate_tiers_data
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'commercial.rateTiers'
  WHERE (CASE WHEN jsonb_typeof(tp.rate_tiers_data) = 'array' THEN jsonb_array_length(tp.rate_tiers_data) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.credits_data
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'credits'
  WHERE (CASE WHEN jsonb_typeof(tp.credits_data) = 'array' THEN jsonb_array_length(tp.credits_data) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.social_proof_data
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'social_proof.pastClients'
  WHERE (CASE WHEN jsonb_typeof(tp.social_proof_data) = 'array' THEN jsonb_array_length(tp.social_proof_data) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.work_eligibility
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'logistics.workEligibility'
  WHERE (CASE WHEN jsonb_typeof(tp.work_eligibility) = 'array' THEN jsonb_array_length(tp.work_eligibility) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.upcoming_visits
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'logistics.upcomingVisits'
  WHERE (CASE WHEN jsonb_typeof(tp.upcoming_visits) = 'array' THEN jsonb_array_length(tp.upcoming_visits) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.media_albums_data
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'albums.list'
  WHERE (CASE WHEN jsonb_typeof(tp.media_albums_data) = 'array' THEN jsonb_array_length(tp.media_albums_data) ELSE 0 END) > 0

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.documents_data
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'documents'
  WHERE (CASE WHEN jsonb_typeof(tp.documents_data) = 'array' THEN jsonb_array_length(tp.documents_data) ELSE 0 END) > 0

  -- ── OBJECT blob: present ⇔ <> '{}', stored VERBATIM (limits_data only) ────
  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, tp.limits_data
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'limits'
  WHERE tp.limits_data IS NOT NULL AND tp.limits_data <> '{}'::jsonb
) src
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;

COMMIT;
