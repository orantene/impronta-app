-- Numeric TAL codes only: retire vanity profile_code values.
--
-- Owner rule (2026-10-04): every talent_profiles.profile_code must match
-- ^TAL-[0-9]+$ (QA, demo, and real). Six rows still used vanity codes:
--
--   KEEP + renumber via generate_profile_code(), alias old → profile_id:
--     TAL-JORGBEAUTY, TAL-QAFIXFREE, TAL-QAFIXMAX, TAL-AUDIT-0512
--   DELETE (dead claim-flow fixtures; owner OK):
--     TAL-CLAIMQA, TAL-QACLAIM-01
--
-- Old /t/<vanity> URLs keep working via talent_profile_code_aliases + the
-- resolve_talent_profile_code RPC (app 301/308 redirects to the new code).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Alias table (old vanity → profile_id). Readable only via SECURITY DEFINER
--    RPC below; RLS enabled with no anon/authenticated policies.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_profile_code_aliases (
  old_code text PRIMARY KEY,
  talent_profile_id uuid NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_profile_code_aliases_old_code_nonempty
    CHECK (length(btrim(old_code)) > 0)
);

CREATE INDEX IF NOT EXISTS talent_profile_code_aliases_profile_id_idx
  ON public.talent_profile_code_aliases (talent_profile_id);

COMMENT ON TABLE public.talent_profile_code_aliases IS
  'Retired vanity profile_code values. Lookups by old_code resolve to talent_profile_id; the live code lives on talent_profiles.profile_code.';

ALTER TABLE public.talent_profile_code_aliases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.talent_profile_code_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.talent_profile_code_aliases TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Delete dead claim-flow fixtures (owner OK 2026-10-04).
--    Owned rows (cascade): media_assets×2 + roster×1 + claim invite×1 on
--    TAL-CLAIMQA; roster×1 + claim invite×1 on TAL-QACLAIM-01.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.talent_claim_invitations') IS NOT NULL THEN
    DELETE FROM public.talent_claim_invitations
    WHERE talent_profile_id IN (
      SELECT id FROM public.talent_profiles
      WHERE profile_code IN ('TAL-CLAIMQA', 'TAL-QACLAIM-01')
    );
  END IF;
END $$;

DELETE FROM public.talent_profiles
WHERE profile_code IN ('TAL-CLAIMQA', 'TAL-QACLAIM-01');

-- ---------------------------------------------------------------------------
-- 3. Renumber the four keepers; record each old code as an alias.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  v_new text;
BEGIN
  FOR r IN
    SELECT id, profile_code, public_slug_part
    FROM public.talent_profiles
    -- The four named keepers first (stable order), then ANY other
    -- non-numeric row (fresh-chain replays leave migration proof rows such as
    -- 't1-07-proof-*'; prod holds none), so the guard below always holds.
    WHERE profile_code IS NULL OR profile_code !~ '^TAL-[0-9]+$'
    ORDER BY
      CASE profile_code
        WHEN 'TAL-JORGBEAUTY' THEN 1
        WHEN 'TAL-QAFIXFREE' THEN 2
        WHEN 'TAL-QAFIXMAX' THEN 3
        WHEN 'TAL-AUDIT-0512' THEN 4
        ELSE 5
      END,
      created_at, id
  LOOP
    IF r.profile_code IS NOT NULL THEN
      INSERT INTO public.talent_profile_code_aliases (old_code, talent_profile_id)
      VALUES (r.profile_code, r.id)
      ON CONFLICT (old_code) DO UPDATE
        SET talent_profile_id = EXCLUDED.talent_profile_id;
    END IF;

    LOOP
      v_new := public.generate_profile_code();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.talent_profiles WHERE profile_code = v_new
      );
    END LOOP;

    UPDATE public.talent_profiles
    SET
      profile_code = v_new,
      public_slug_part = CASE
        WHEN public_slug_part IS NOT DISTINCT FROM r.profile_code THEN v_new
        ELSE public_slug_part
      END,
      updated_at = now()
    WHERE id = r.id;

    RAISE NOTICE 'renumbered % → % (id=%)', r.profile_code, v_new, r.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Guard: profile_code must stay numeric forever.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.talent_profiles
    WHERE profile_code IS NULL OR profile_code !~ '^TAL-[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'talent_profiles.profile_code still has non-numeric values';
  END IF;
END $$;

ALTER TABLE public.talent_profiles
  DROP CONSTRAINT IF EXISTS talent_profiles_profile_code_numeric_check;

ALTER TABLE public.talent_profiles
  ADD CONSTRAINT talent_profiles_profile_code_numeric_check
  CHECK (profile_code ~ '^TAL-[0-9]+$');

-- ---------------------------------------------------------------------------
-- 5. Lookup RPC: canonical code OR alias → (id, live code, alias flag).
--    Defends itself: read-only, no draft/hidden leak beyond what public
--    profile routes already expose (id + code only).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_talent_profile_code(p_code text)
RETURNS TABLE (
  profile_id uuid,
  profile_code text,
  requested_code text,
  is_alias boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT nullif(btrim(p_code), '') AS code
  ),
  direct AS (
    SELECT
      tp.id AS profile_id,
      tp.profile_code,
      i.code AS requested_code,
      false AS is_alias
    FROM input i
    JOIN public.talent_profiles tp ON tp.profile_code = i.code
    WHERE i.code IS NOT NULL
    LIMIT 1
  ),
  via_alias AS (
    SELECT
      tp.id AS profile_id,
      tp.profile_code,
      i.code AS requested_code,
      true AS is_alias
    FROM input i
    JOIN public.talent_profile_code_aliases a ON a.old_code = i.code
    JOIN public.talent_profiles tp ON tp.id = a.talent_profile_id
    WHERE i.code IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM direct)
    LIMIT 1
  )
  SELECT * FROM direct
  UNION ALL
  SELECT * FROM via_alias;
$$;

REVOKE ALL ON FUNCTION public.resolve_talent_profile_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_talent_profile_code(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_talent_profile_code(text) IS
  'Resolve a TAL code or retired vanity alias to talent_profiles.id + live profile_code. is_alias=true when the request used an old_code.';

-- ---------------------------------------------------------------------------
-- 6. Published-site RPC: also accept alias codes (returns LIVE profile_code).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.talent_public_site_for_profile_code(p_profile_code text)
RETURNS TABLE (
  profile_code text,
  talent_profile_id uuid,
  published_snapshot jsonb,
  published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tp.profile_code,
    tp.id AS talent_profile_id,
    ts.published_snapshot,
    ts.published_at
  FROM public.resolve_talent_profile_code(p_profile_code) r
  JOIN public.talent_profiles tp ON tp.id = r.profile_id
  INNER JOIN public.talent_sites ts ON ts.talent_profile_id = tp.id
  WHERE tp.is_publicly_hidden = false
    AND ts.status = 'published'
    AND ts.published_snapshot IS NOT NULL;
$$;

COMMIT;
