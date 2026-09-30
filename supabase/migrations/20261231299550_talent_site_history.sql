-- Theme releases Phase 2: one builder history timeline per talent site, plus
-- the atomic draft writer that carries optimistic concurrency (draft_rev).
-- Additive only. Writes are service-role (server actions prove ownership
-- first); a talent reads her own rows.

CREATE TABLE IF NOT EXISTS public.talent_site_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.talent_sites (id) ON DELETE CASCADE,
  talent_profile_id uuid NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  -- Last write folded into this entry (edits batch per 60 s per site).
  last_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'talent'
    CHECK (actor IN ('talent', 'tulala', 'system')),
  kind text NOT NULL
    CHECK (kind IN ('edit', 'colors', 'design_apply', 'theme_update', 'restore', 'publish', 'auto_improve')),
  summary_en text NOT NULL DEFAULT '',
  summary_es text NOT NULL DEFAULT '',
  -- Full site state after the change: { v, source, rev, shell, tokens, design, pages{id: blocks} }.
  snapshot_ref jsonb,
  -- theme_update: the merge report (reverseMerge input); restore: { from }.
  report jsonb,
  undoable boolean NOT NULL DEFAULT false,
  draft_rev integer,
  edit_count integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  -- Backfill idempotency key (e.g. 'talent_site_revisions:<id>').
  source_ref text
);

CREATE INDEX IF NOT EXISTS idx_talent_site_history_site_at
  ON public.talent_site_history (site_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_talent_site_history_profile
  ON public.talent_site_history (talent_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS talent_site_history_source_ref_key
  ON public.talent_site_history (site_id, source_ref)
  WHERE source_ref IS NOT NULL;

ALTER TABLE public.talent_site_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.talent_site_history FROM anon;
REVOKE ALL ON public.talent_site_history FROM authenticated;
GRANT SELECT ON public.talent_site_history TO authenticated;

DROP POLICY IF EXISTS talent_site_history_owner_select ON public.talent_site_history;
CREATE POLICY talent_site_history_owner_select ON public.talent_site_history
  FOR SELECT TO authenticated
  USING (public.is_talent_profile_owner(talent_profile_id));

-- Full site state (draft or published) as one jsonb document.
CREATE OR REPLACE FUNCTION public.talent_site_history_snapshot(p_site_id uuid, p_source text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'v', 1,
    'source', p_source,
    'rev', s.draft_rev,
    'shell', CASE WHEN p_source = 'published' THEN s.shell_published ELSE s.shell_tree END,
    'tokens', CASE WHEN p_source = 'published' THEN s.design_tokens ELSE s.design_tokens_draft END,
    'design', jsonb_build_object(
      'slug', s.theme_design_slug,
      'version', s.theme_design_version,
      'look', s.theme_look_slug
    ),
    'pages', COALESCE(
      (
        SELECT jsonb_object_agg(
          p.id::text,
          CASE WHEN p_source = 'published' THEN COALESCE(p.blocks_published, '[]'::jsonb) ELSE p.blocks END
        )
        FROM public.talent_pages p
        WHERE p.talent_profile_id = s.talent_profile_id
      ),
      '{}'::jsonb
    )
  )
  FROM public.talent_sites s
  WHERE s.id = p_site_id;
$$;

-- Append one history entry (or fold it into the latest one inside the batch window).
CREATE OR REPLACE FUNCTION public.talent_site_history_append(p_site_id uuid, p_entry jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_rev integer;
  v_id uuid;
  v_kind text := p_entry->>'kind';
  v_actor text := COALESCE(p_entry->>'actor', 'talent');
  v_batch integer := COALESCE((p_entry->>'batch_seconds')::integer, 0);
  v_source text := COALESCE(p_entry->>'source', 'draft');
  v_at timestamptz := COALESCE((p_entry->>'at')::timestamptz, now());
BEGIN
  SELECT talent_profile_id, draft_rev INTO v_profile, v_rev
  FROM public.talent_sites WHERE id = p_site_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_batch > 0 THEN
    SELECT h.id INTO v_id
    FROM public.talent_site_history h
    WHERE h.site_id = p_site_id
    ORDER BY h.last_at DESC, h.at DESC
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE public.talent_site_history h
      SET last_at = v_at,
          edit_count = h.edit_count + 1,
          draft_rev = v_rev,
          snapshot_ref = public.talent_site_history_snapshot(p_site_id, v_source)
      WHERE h.id = v_id
        AND h.kind = v_kind
        AND h.actor = v_actor
        AND h.last_at > v_at - make_interval(secs => v_batch);
      IF FOUND THEN
        RETURN v_id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.talent_site_history (
    site_id, talent_profile_id, at, last_at, actor, kind, summary_en, summary_es,
    snapshot_ref, report, undoable, draft_rev, created_by, source_ref
  )
  VALUES (
    p_site_id, v_profile, v_at, v_at, v_actor, v_kind,
    COALESCE(p_entry->>'summary_en', ''), COALESCE(p_entry->>'summary_es', ''),
    CASE WHEN p_entry ? 'snapshot_ref' THEN p_entry->'snapshot_ref'
         ELSE public.talent_site_history_snapshot(p_site_id, v_source) END,
    p_entry->'report',
    COALESCE((p_entry->>'undoable')::boolean, false),
    v_rev,
    NULLIF(p_entry->>'created_by', '')::uuid,
    p_entry->>'source_ref'
  )
  ON CONFLICT (site_id, source_ref) WHERE source_ref IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF p_entry ? 'undo_of' THEN
    UPDATE public.talent_site_history
    SET undoable = false
    WHERE id = (p_entry->>'undo_of')::uuid AND site_id = p_site_id;
  END IF;

  RETURN v_id;
END;
$$;

-- One atomic draft write: CAS on draft_rev, site columns, page bodies, history entry.
-- p_expected_rev NULL = no CAS (system writers); a mismatch writes nothing.
CREATE OR REPLACE FUNCTION public.talent_site_write_draft(
  p_site_id uuid,
  p_expected_rev integer,
  p_site jsonb,
  p_pages jsonb,
  p_history jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rev integer;
  v_profile uuid;
  v_cur integer;
  v_page jsonb;
  v_patch jsonb;
  v_n integer;
  v_hist uuid;
  v_site jsonb := COALESCE(p_site, '{}'::jsonb);
BEGIN
  UPDATE public.talent_sites s
  SET draft_rev = s.draft_rev + 1,
      shell_tree = CASE WHEN v_site ? 'shell_tree' THEN v_site->'shell_tree' ELSE s.shell_tree END,
      design_tokens_draft = CASE WHEN v_site ? 'design_tokens_draft' THEN v_site->'design_tokens_draft' ELSE s.design_tokens_draft END,
      theme_design_slug = CASE WHEN v_site ? 'theme_design_slug' THEN v_site->>'theme_design_slug' ELSE s.theme_design_slug END,
      theme_design_version = CASE WHEN v_site ? 'theme_design_version' THEN (v_site->>'theme_design_version')::integer ELSE s.theme_design_version END,
      theme_look_slug = CASE WHEN v_site ? 'theme_look_slug' THEN v_site->>'theme_look_slug' ELSE s.theme_look_slug END,
      theme_token_origin = CASE WHEN v_site ? 'theme_token_origin' THEN v_site->'theme_token_origin' ELSE s.theme_token_origin END,
      style_classes = CASE WHEN v_site ? 'style_classes' THEN v_site->'style_classes' ELSE s.style_classes END,
      style_presets = CASE WHEN v_site ? 'style_presets' THEN v_site->'style_presets' ELSE s.style_presets END,
      updated_by = CASE WHEN v_site ? 'updated_by' THEN (v_site->>'updated_by')::uuid ELSE s.updated_by END,
      draft_updated_at = now(),
      updated_at = now()
  WHERE s.id = p_site_id
    AND (p_expected_rev IS NULL OR s.draft_rev = p_expected_rev)
  RETURNING s.draft_rev, s.talent_profile_id INTO v_rev, v_profile;

  IF NOT FOUND THEN
    SELECT draft_rev INTO v_cur FROM public.talent_sites WHERE id = p_site_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'site_not_found');
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'current_rev', v_cur);
  END IF;

  FOR v_page IN SELECT * FROM jsonb_array_elements(COALESCE(p_pages, '[]'::jsonb)) LOOP
    v_patch := COALESCE(v_page->'patch', '{}'::jsonb);
    UPDATE public.talent_pages t
    SET blocks = CASE WHEN v_patch ? 'blocks' THEN v_patch->'blocks' ELSE t.blocks END,
        theme = CASE WHEN v_patch ? 'theme' THEN v_patch->'theme' ELSE t.theme END,
        title = CASE WHEN jsonb_typeof(v_patch->'title') = 'string' THEN v_patch->>'title' ELSE t.title END,
        status = CASE WHEN jsonb_typeof(v_patch->'status') = 'string' THEN v_patch->>'status' ELSE t.status END,
        meta_description = CASE WHEN v_patch ? 'meta_description' THEN v_patch->>'meta_description' ELSE t.meta_description END,
        og_title = CASE WHEN v_patch ? 'og_title' THEN v_patch->>'og_title' ELSE t.og_title END,
        og_description = CASE WHEN v_patch ? 'og_description' THEN v_patch->>'og_description' ELSE t.og_description END,
        og_image_url = CASE WHEN v_patch ? 'og_image_url' THEN v_patch->>'og_image_url' ELSE t.og_image_url END,
        canonical_url = CASE WHEN v_patch ? 'canonical_url' THEN v_patch->>'canonical_url' ELSE t.canonical_url END,
        noindex = CASE WHEN v_patch ? 'noindex' THEN (v_patch->>'noindex')::boolean ELSE t.noindex END,
        json_ld = CASE WHEN v_patch ? 'json_ld' THEN NULLIF(v_patch->'json_ld', 'null'::jsonb) ELSE t.json_ld END,
        style_classes = CASE WHEN v_patch ? 'style_classes' THEN v_patch->'style_classes' ELSE t.style_classes END,
        style_presets = CASE WHEN v_patch ? 'style_presets' THEN v_patch->'style_presets' ELSE t.style_presets END,
        updated_at = now()
    WHERE t.talent_profile_id = v_profile
      AND (
        (v_page ? 'id' AND t.id = (v_page->>'id')::uuid)
        OR (NOT (v_page ? 'id') AND COALESCE((v_page->>'home')::boolean, false) AND t.is_home)
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'talent_site_write_draft: page not found (%)', COALESCE(v_page->>'id', 'home')
        USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  IF p_history IS NOT NULL AND jsonb_typeof(p_history) = 'object' THEN
    v_hist := public.talent_site_history_append(p_site_id, p_history);
  END IF;

  RETURN jsonb_build_object('ok', true, 'draft_rev', v_rev, 'history_id', v_hist, 'updated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.talent_site_history_snapshot(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.talent_site_history_append(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.talent_site_write_draft(uuid, integer, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talent_site_history_snapshot(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.talent_site_history_append(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.talent_site_write_draft(uuid, integer, jsonb, jsonb, jsonb) TO service_role;
