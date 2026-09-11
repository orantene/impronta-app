-- Package 2 task 1: instructor on series/sessions. Series writes are TS.
-- Room stays venue_id. Overlap is same-venue scheduled windows (D-POS-70).

BEGIN;

ALTER TABLE public.session_series
  ADD COLUMN IF NOT EXISTS instructor_user_id uuid;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS instructor_user_id uuid;

COMMENT ON COLUMN public.session_series.instructor_user_id IS
  'Staff user who teaches every generated occurrence unless a session overrides it.';
COMMENT ON COLUMN public.sessions.instructor_user_id IS
  'Staff user for this occurrence. Null inherits nothing at read time; the writer copies the series value on generate.';

CREATE INDEX IF NOT EXISTS sessions_instructor_idx
  ON public.sessions (tenant_id, instructor_user_id)
  WHERE instructor_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.session_venue_overlaps(
  p_tenant_id uuid,
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_except_session_id uuid DEFAULT NULL,
  p_except_series_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.sessions s
     WHERE s.tenant_id = p_tenant_id
       AND s.venue_id = p_venue_id
       AND s.status = 'scheduled'
       AND s.starts_at < p_ends_at
       AND s.ends_at > p_starts_at
       AND (p_except_session_id IS NULL OR s.id IS DISTINCT FROM p_except_session_id)
       AND (p_except_series_id IS NULL OR s.series_id IS DISTINCT FROM p_except_series_id)
  );
$$;

REVOKE ALL ON FUNCTION public.session_venue_overlaps(uuid, uuid, timestamptz, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_venue_overlaps(uuid, uuid, timestamptz, timestamptz, uuid, uuid)
  TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.session_venue_overlaps(uuid,uuid,timestamptz,timestamptz,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'session_venue_overlaps is executable by anon';
  END IF;
END
$check$;

DO $proof$
BEGIN
  IF to_regclass('public.session_series') IS NULL THEN
    RAISE EXCEPTION 'session_series missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'instructor_user_id'
  ) THEN
    RAISE EXCEPTION 'sessions.instructor_user_id missing';
  END IF;
END
$proof$;

COMMIT;
