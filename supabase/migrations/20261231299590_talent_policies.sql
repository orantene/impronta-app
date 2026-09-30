-- Talent policies ("Politicas y privacidad"): the few answers a talent gives on
-- top of facts that already live elsewhere (deposit, cancel window, where she
-- works), plus an immutable, versioned snapshot of what she published.
--
--   talent_policy_settings   one row per talent: answers = her current choices
--                            (late_cancel_refund none|half|full,
--                            late_tolerance_min). Descriptive answers only;
--                            the refund choice is also read by the cancel
--                            engine, from the PUBLISHED version.
--   talent_policy_versions   immutable: one row per publish. Holds the frozen
--                            facts, the answers, and the rendered ES + EN text.
--
-- `selling_defaults.inPersonMethods` needs no DDL (a tolerant jsonb key).
-- Additive only. Owner can SELECT her own rows; every write is service-role
-- behind an owner check in the server action. anon has no access.

CREATE TABLE IF NOT EXISTS public.talent_policy_settings (
  talent_profile_id uuid PRIMARY KEY REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_policy_settings_late_cancel_refund_chk
    CHECK (
      NOT (answers ? 'late_cancel_refund')
      OR answers->>'late_cancel_refund' IN ('none', 'half', 'full')
    ),
  CONSTRAINT talent_policy_settings_late_tolerance_chk
    CHECK (
      NOT (answers ? 'late_tolerance_min')
      OR (
        jsonb_typeof(answers->'late_tolerance_min') = 'number'
        AND (answers->>'late_tolerance_min')::numeric BETWEEN 0 AND 240
      )
    )
);

CREATE TABLE IF NOT EXISTS public.talent_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id uuid NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  content_hash text NOT NULL CHECK (length(content_hash) BETWEEN 16 AND 128),
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  facts jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  rendered_text_es text NOT NULL,
  rendered_text_en text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT talent_policy_versions_version_unique UNIQUE (talent_profile_id, version)
);

CREATE INDEX IF NOT EXISTS talent_policy_versions_latest_idx
  ON public.talent_policy_versions (talent_profile_id, version DESC);

-- Immutable: a published version is never edited or deleted by a session user.
CREATE OR REPLACE FUNCTION public.talent_policy_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'talent_policy_versions rows are immutable';
  END IF;
  RETURN OLD;
END;
$$;

-- DELETE is left to the cascade from talent_profiles (trigger is UPDATE-only).
DROP TRIGGER IF EXISTS talent_policy_versions_no_update ON public.talent_policy_versions;
CREATE TRIGGER talent_policy_versions_no_update
  BEFORE UPDATE ON public.talent_policy_versions
  FOR EACH ROW EXECUTE FUNCTION public.talent_policy_versions_immutable();

ALTER TABLE public.talent_policy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_policy_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.talent_policy_settings FROM anon;
REVOKE ALL ON public.talent_policy_settings FROM authenticated;
REVOKE ALL ON public.talent_policy_versions FROM anon;
REVOKE ALL ON public.talent_policy_versions FROM authenticated;
GRANT SELECT ON public.talent_policy_settings TO authenticated;
GRANT SELECT ON public.talent_policy_versions TO authenticated;

DROP POLICY IF EXISTS talent_policy_settings_owner_select ON public.talent_policy_settings;
CREATE POLICY talent_policy_settings_owner_select ON public.talent_policy_settings
  FOR SELECT TO authenticated
  USING (public.is_talent_profile_owner(talent_profile_id));

DROP POLICY IF EXISTS talent_policy_versions_owner_select ON public.talent_policy_versions;
CREATE POLICY talent_policy_versions_owner_select ON public.talent_policy_versions
  FOR SELECT TO authenticated
  USING (public.is_talent_profile_owner(talent_profile_id));

COMMENT ON TABLE public.talent_policy_settings IS
  'Talent policy answers (late_cancel_refund none|half|full, late_tolerance_min). Service-role writes behind an owner check.';
COMMENT ON TABLE public.talent_policy_versions IS
  'Immutable published policy versions: frozen facts, answers and rendered ES/EN text.';
