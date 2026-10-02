-- Template Factory S3: platform template editor drafts + atomic publish.
-- Additive. Service-role only (no anon/authenticated access).

CREATE TABLE IF NOT EXISTS public.talent_theme_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design text NOT NULL,
  base_version integer NOT NULL CHECK (base_version > 0),
  payload jsonb NOT NULL,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'published', 'discarded')),
  published_version integer,
  release_id uuid REFERENCES public.talent_theme_releases (id) ON DELETE SET NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS talent_theme_drafts_one_open_per_design
  ON public.talent_theme_drafts (design) WHERE status = 'open';

ALTER TABLE public.talent_theme_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talent_theme_drafts FROM anon;
REVOKE ALL ON public.talent_theme_drafts FROM authenticated;

ALTER TABLE public.talent_theme_versions
  ADD COLUMN IF NOT EXISTS meta jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE OR REPLACE FUNCTION public.publish_theme_template_draft(
  p_draft_id uuid,
  p_expected_rev integer,
  p_design text,
  p_version integer,
  p_payload jsonb,
  p_meta jsonb,
  p_release jsonb,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release_id uuid;
  v_rows integer;
BEGIN
  BEGIN
    INSERT INTO public.talent_theme_versions (design, version, payload, source, meta, created_by)
    VALUES (p_design, p_version, p_payload, 'authored', p_meta, p_actor);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'conflict');
  END;

  BEGIN
    INSERT INTO public.talent_theme_releases (
      design_slug, from_version, to_version, channel, status, notes, items, base_payload, created_by
    ) VALUES (
      p_design,
      (p_release->>'from_version')::integer,
      p_version,
      COALESCE(p_release->>'channel', 'draft'),
      COALESCE(p_release->>'status', 'draft'),
      COALESCE(p_release->'notes', '{}'::jsonb),
      COALESCE(p_release->'items', '[]'::jsonb),
      p_release->'base_payload',
      p_actor
    ) RETURNING id INTO v_release_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'theme_publish_conflict';
  END;

  UPDATE public.talent_theme_drafts
     SET status = 'published', published_version = p_version, release_id = v_release_id,
         rev = rev + 1, updated_by = p_actor, updated_at = now()
   WHERE id = p_draft_id AND rev = p_expected_rev AND status = 'open';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'theme_publish_stale_rev';
  END IF;

  RETURN jsonb_build_object('ok', true, 'version', p_version, 'release_id', v_release_id);
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM = 'theme_publish_stale_rev' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'stale_rev');
    ELSIF SQLERRM = 'theme_publish_conflict' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'conflict');
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_theme_template_draft(uuid, integer, text, integer, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_theme_template_draft(uuid, integer, text, integer, jsonb, jsonb, jsonb, uuid) TO service_role;
