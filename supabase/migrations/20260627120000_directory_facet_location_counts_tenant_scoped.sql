-- SaaS Phase 1.C — tenant-scope the directory location facet RPC.
--
-- Context: `directory_facet_location_counts(int, int, uuid[], text)` (added
-- in 20260411220000_directory_facet_count_rpcs.sql) computes city counts
-- from `talent_profiles` joined to `locations`, with no tenant constraint.
-- On a tenant storefront (e.g. midnight-muse.local) the sidebar shows
-- inflated counts sourced from every agency's roster, which is both a
-- trust leak ("Midnight has 12 Miami models" — false) and a UX leak
-- ("Cancun" shown on an Ibiza-focused tenant).
--
-- This migration adds a new overload that takes `p_tenant_id uuid` and
-- restricts the base rowset through `agency_talent_roster` (status=active)
-- so counts reflect only talent attached to the requesting tenant. The
-- legacy signature is kept intact for admin/global-directory callers.
--
-- Callers (application layer) should prefer the tenant-scoped overload on
-- tenant storefronts. `rpcFacetLocation` in
-- web/src/lib/directory/field-driven-filters.ts is updated in the same PR.

BEGIN;

CREATE OR REPLACE FUNCTION public.directory_facet_location_counts(
  p_tenant_id uuid,
  p_height_min int,
  p_height_max int,
  p_selected_taxonomy_ids uuid[],
  p_search text
)
RETURNS TABLE (city_slug text, profile_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH sel AS (
    SELECT tt.id, tt.kind
    FROM unnest(coalesce(p_selected_taxonomy_ids, array[]::uuid[])) AS x(id)
    JOIN public.taxonomy_terms tt ON tt.id = x.id AND tt.archived_at IS NULL
    WHERE tt.kind::text NOT IN ('location_city', 'location_country')
  ),
  tenant_tp AS (
    SELECT tp.id
    FROM public.talent_profiles tp
    JOIN public.agency_talent_roster r
      ON r.talent_profile_id = tp.id
      AND r.tenant_id = p_tenant_id
      AND r.status = 'active'
    WHERE tp.deleted_at IS NULL
      AND tp.workflow_status = 'approved'
      AND tp.visibility = 'public'
      AND (p_height_min IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm >= p_height_min))
      AND (p_height_max IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm <= p_height_max))
      AND (
        p_search IS NULL
        OR trim(p_search) = ''
        OR tp.display_name ILIKE '%' || trim(p_search) || '%'
        OR tp.first_name  ILIKE '%' || trim(p_search) || '%'
        OR tp.last_name   ILIKE '%' || trim(p_search) || '%'
        OR tp.short_bio   ILIKE '%' || trim(p_search) || '%'
        OR tp.profile_code ILIKE '%' || trim(p_search) || '%'
      )
  ),
  other_kinds AS (
    SELECT sk.kind, array_agg(sk.id) AS term_ids
    FROM sel sk
    GROUP BY sk.kind
  ),
  constrained AS (
    SELECT b.id
    FROM tenant_tp b
    WHERE NOT EXISTS (
      SELECT 1
      FROM other_kinds ok
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_taxonomy tpt
        WHERE tpt.talent_profile_id = b.id
          AND tpt.taxonomy_term_id = ANY (ok.term_ids)
      )
    )
  )
  SELECT l.city_slug::text, count(DISTINCT tp.id)::bigint AS profile_count
  FROM public.locations l
  INNER JOIN public.talent_profiles tp
    ON (tp.residence_city_id = l.id OR tp.location_id = l.id)
  INNER JOIN constrained c ON c.id = tp.id
  WHERE l.archived_at IS NULL
  GROUP BY l.city_slug;
$$;

GRANT EXECUTE ON FUNCTION public.directory_facet_location_counts(uuid, int, int, uuid[], text) TO anon;
GRANT EXECUTE ON FUNCTION public.directory_facet_location_counts(uuid, int, int, uuid[], text) TO authenticated;

COMMIT;
