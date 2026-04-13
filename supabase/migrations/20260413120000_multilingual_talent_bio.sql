-- TYPE B: profile bio multilingual fields, translation audit (no triggers for business logic)

BEGIN;

CREATE TYPE public.bio_es_status AS ENUM (
  'missing',
  'auto',
  'reviewed',
  'approved',
  'stale'
);

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS bio_en TEXT,
  ADD COLUMN IF NOT EXISTS bio_es TEXT,
  ADD COLUMN IF NOT EXISTS bio_es_draft TEXT,
  ADD COLUMN IF NOT EXISTS bio_es_status public.bio_es_status NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS bio_en_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bio_es_updated_at TIMESTAMPTZ;

UPDATE public.talent_profiles
SET
  bio_en = short_bio,
  bio_es_status = 'missing'::public.bio_es_status,
  bio_en_updated_at = COALESCE(updated_at, now())
WHERE bio_en IS NULL;

CREATE TABLE IF NOT EXISTS public.translation_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  actor_id UUID,
  actor_kind TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  prev_status TEXT,
  next_status TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_translation_audit_entity
  ON public.translation_audit_events (entity_type, entity_id, created_at DESC);

ALTER TABLE public.translation_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY translation_audit_staff_select ON public.translation_audit_events
  FOR SELECT TO authenticated
  USING (public.is_agency_staff());

CREATE POLICY translation_audit_service_insert ON public.translation_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_staff());

COMMENT ON TABLE public.translation_audit_events IS 'Append-only translation lifecycle log; writes from app server only.';

COMMIT;
