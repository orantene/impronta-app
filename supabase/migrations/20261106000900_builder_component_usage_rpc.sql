-- Builder Lab P3 — scale-safe usage counting via SECURITY DEFINER RPCs.
--
-- The Lab Catalog's D1 "Used N" column and the D7 template-adoption tally both
-- previously SELECT-ed entire tables into Node and folded them in JS. That path
-- (a) truncates at PostgREST's 1000-row max_rows and (b) ships every tree-bearing
-- column's full JSON over the wire on Lab open. These three RPCs move the
-- aggregation server-side so the counts are exact at any scale and the Lab-open
-- critical path no longer streams whole tables.
--
-- All three are SECURITY DEFINER + service_role-only (mirroring list_applied_
-- migrations' grant model). They are called exclusively through the service-role
-- client BEHIND requireSuperAdmin() in the action layer — the gate IS the auth
-- boundary, exactly as the existing four-table scan was. Idempotent
-- (CREATE OR REPLACE + explicit REVOKE/GRANT), so re-applying is safe.

-- ── D1.a — per-component-TYPE usage across every tenant tree-bearing column ────
--
-- Walks all four JSONB sources with a recursive-descent jsonpath (`$.**.kind`),
-- the same vector the JS walker (component-usage-scan.ts walkInto) uses: every
-- object carrying a non-empty string `kind` is counted once, wherever it sits in
-- the tree (bare node array, { tree: [...] } envelope, section props, snapshot
-- object, shell). `jsonb_path_query` over a NULL column yields no rows, so a null
-- snapshot/shell column simply contributes nothing (no special-casing needed).
CREATE OR REPLACE FUNCTION public.count_builder_component_usage()
RETURNS TABLE(kind text, n bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH kinds AS (
    -- cms_pages.blocks
    SELECT (jsonb_path_query(p.blocks, '$.**.kind')) #>> '{}' AS kind
    FROM public.cms_pages p
    WHERE p.blocks IS NOT NULL
    UNION ALL
    -- cms_sections.props_jsonb
    SELECT (jsonb_path_query(s.props_jsonb, '$.**.kind')) #>> '{}' AS kind
    FROM public.cms_sections s
    WHERE s.props_jsonb IS NOT NULL
    UNION ALL
    -- cms_builder_components.subtree_jsonb
    SELECT (jsonb_path_query(c.subtree_jsonb, '$.**.kind')) #>> '{}' AS kind
    FROM public.cms_builder_components c
    WHERE c.subtree_jsonb IS NOT NULL
    UNION ALL
    -- talent_sites.draft_snapshot
    SELECT (jsonb_path_query(t.draft_snapshot, '$.**.kind')) #>> '{}' AS kind
    FROM public.talent_sites t
    WHERE t.draft_snapshot IS NOT NULL
    UNION ALL
    -- talent_sites.published_snapshot
    SELECT (jsonb_path_query(t.published_snapshot, '$.**.kind')) #>> '{}' AS kind
    FROM public.talent_sites t
    WHERE t.published_snapshot IS NOT NULL
    UNION ALL
    -- talent_sites.shell_tree
    SELECT (jsonb_path_query(t.shell_tree, '$.**.kind')) #>> '{}' AS kind
    FROM public.talent_sites t
    WHERE t.shell_tree IS NOT NULL
    UNION ALL
    -- talent_sites.shell_published
    SELECT (jsonb_path_query(t.shell_published, '$.**.kind')) #>> '{}' AS kind
    FROM public.talent_sites t
    WHERE t.shell_published IS NOT NULL
  )
  SELECT k.kind, count(*) AS n
  FROM kinds k
  WHERE k.kind IS NOT NULL AND k.kind <> ''  -- match the JS walker: non-empty string kinds only
  GROUP BY k.kind;
$$;

-- ── D1.b — per-section-embed-key usage (curated section_embed nodes) ──────────
--
-- Mirrors sectionEmbedKeyOf in component-usage-scan.ts: for nodes whose
-- kind == "section_embed", extract props.sectionTypeKey and count by key. The
-- jsonpath filter selects only section_embed nodes' sectionTypeKey scalar.
CREATE OR REPLACE FUNCTION public.count_builder_component_section_embed_keys()
RETURNS TABLE(embed_key text, n bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH keys AS (
    SELECT (jsonb_path_query(
      p.blocks,
      '$.** ? (@.kind == "section_embed").props.sectionTypeKey'
    )) #>> '{}' AS embed_key
    FROM public.cms_pages p
    WHERE p.blocks IS NOT NULL
    UNION ALL
    SELECT (jsonb_path_query(
      s.props_jsonb,
      '$.** ? (@.kind == "section_embed").props.sectionTypeKey'
    )) #>> '{}' AS embed_key
    FROM public.cms_sections s
    WHERE s.props_jsonb IS NOT NULL
    UNION ALL
    SELECT (jsonb_path_query(
      c.subtree_jsonb,
      '$.** ? (@.kind == "section_embed").props.sectionTypeKey'
    )) #>> '{}' AS embed_key
    FROM public.cms_builder_components c
    WHERE c.subtree_jsonb IS NOT NULL
    UNION ALL
    SELECT (jsonb_path_query(
      t.draft_snapshot,
      '$.** ? (@.kind == "section_embed").props.sectionTypeKey'
    )) #>> '{}' AS embed_key
    FROM public.talent_sites t
    WHERE t.draft_snapshot IS NOT NULL
    UNION ALL
    SELECT (jsonb_path_query(
      t.published_snapshot,
      '$.** ? (@.kind == "section_embed").props.sectionTypeKey'
    )) #>> '{}' AS embed_key
    FROM public.talent_sites t
    WHERE t.published_snapshot IS NOT NULL
    UNION ALL
    SELECT (jsonb_path_query(
      t.shell_tree,
      '$.** ? (@.kind == "section_embed").props.sectionTypeKey'
    )) #>> '{}' AS embed_key
    FROM public.talent_sites t
    WHERE t.shell_tree IS NOT NULL
    UNION ALL
    SELECT (jsonb_path_query(
      t.shell_published,
      '$.** ? (@.kind == "section_embed").props.sectionTypeKey'
    )) #>> '{}' AS embed_key
    FROM public.talent_sites t
    WHERE t.shell_published IS NOT NULL
  )
  SELECT k.embed_key, count(*) AS n
  FROM keys k
  WHERE k.embed_key IS NOT NULL AND k.embed_key <> ''
  GROUP BY k.embed_key;
$$;

-- ── D7 — per-template adoption totals (applied count + distinct tenants) ───────
--
-- Replaces select-ALL-rows + JS fold (which truncated at 1000 rows). Uses the
-- existing builder_template_usage_template_id_idx index. tenant_count counts
-- DISTINCT non-null tenant_id (a null-tenant apply still counts toward
-- applied_count but not tenant_count), matching aggregateTemplateUsage.
CREATE OR REPLACE FUNCTION public.builder_template_usage_totals()
RETURNS TABLE(template_id uuid, applied_count bigint, tenant_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.template_id,
    count(*) AS applied_count,
    count(DISTINCT u.tenant_id) AS tenant_count
  FROM public.builder_template_usage u
  WHERE u.template_id IS NOT NULL
  GROUP BY u.template_id;
$$;

-- ── Grants — service_role only (the action layer's requireSuperAdmin is the gate) ──
REVOKE ALL ON FUNCTION public.count_builder_component_usage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_builder_component_section_embed_keys() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.builder_template_usage_totals() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.count_builder_component_usage() TO service_role;
GRANT EXECUTE ON FUNCTION public.count_builder_component_section_embed_keys() TO service_role;
GRANT EXECUTE ON FUNCTION public.builder_template_usage_totals() TO service_role;
