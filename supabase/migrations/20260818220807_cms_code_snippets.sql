-- P3-C — Custom code: a tenant-owned snippet library.
--
-- WHAT THIS IS
-- ────────────
-- Until now a tenant's custom code was ONE unnamed blob per placement, stored in
-- `tenant_integrations.config_json` under the `custom_code` key (head_html /
-- body_html). You could not name a snippet, could not tell which of three things
-- glued into that blob broke the site, and could not turn one off without
-- deleting it. This table is the library the owner asked for: each snippet has a
-- name, a kind, a placement, and its own published flag + date.
--
-- The legacy blob is NOT migrated or removed here — it keeps rendering exactly
-- as it does today (lib/integrations/resolve.resolveTenantCustomCode). The two
-- coexist; the library is additive.
--
-- SECURITY SHAPE — the thing to get right
-- ───────────────────────────────────────
-- A snippet executes arbitrary code on a public page. It must run on EXACTLY one
-- site: the storefront of the tenant that owns it. Three independent layers:
--
--   1. RLS staff policy — `is_staff_of_tenant(tenant_id)` for all CRUD, the same
--      idiom every other `*_tenant_staff` policy uses (see
--      20260602100100_saas_p2_rls_tenant_scoped.sql).
--   2. RLS public policy — SELECT is permitted only when the row is published
--      AND `tenant_id = current_tenant_id()`. The GUC is set by the reader RPC
--      below, so a public read cannot see another tenant's rows even if the
--      application layer forgets its own `.eq("tenant_id", …)`. This is the
--      wire model documented in
--      20260608110000_saas_p4_cms_public_read_tenant_scoped.sql.
--   3. Application — the injector mounts only when `getPublicTenantScope()`
--      resolves a storefront tenant, so admin/auth/platform routes never call it.
--
-- CAPS
-- ────
-- `code` is capped at 20 000 characters and `src_url` at 500 so a single runaway
-- paste cannot balloon every page of a site. The per-tenant snippet count and the
-- total published byte budget are enforced in the application layer
-- (lib/site-admin/code-snippets.ts) where a friendly message can be returned;
-- these CHECKs are the backstop that holds even if that layer is bypassed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cms_code_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  /* Operator-facing label. The owner asked to "give a name" — required. */
  name text NOT NULL,
  /* css | js are INLINE snippets (`code`); external_* reference `src_url`. */
  kind text NOT NULL,
  code text NOT NULL DEFAULT '',
  src_url text,
  /* head = as early in the document as possible; body_end = after the page. */
  placement text NOT NULL DEFAULT 'head',
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_code_snippets_kind_check
    CHECK (kind IN ('css', 'js', 'external_script', 'external_style')),
  CONSTRAINT cms_code_snippets_placement_check
    CHECK (placement IN ('head', 'body_end')),
  CONSTRAINT cms_code_snippets_name_nonempty
    CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT cms_code_snippets_name_len
    CHECK (char_length(name) <= 80),
  CONSTRAINT cms_code_snippets_code_len
    CHECK (char_length(code) <= 20000),
  CONSTRAINT cms_code_snippets_src_url_len
    CHECK (src_url IS NULL OR char_length(src_url) <= 500),
  /* An inline kind needs code; an external kind needs an https URL. Without
     this a tenant could publish an empty snippet, or an external_script with a
     javascript: URL, and the render path would have to defend itself alone. */
  CONSTRAINT cms_code_snippets_payload_check CHECK (
    (kind IN ('css', 'js') AND char_length(btrim(code)) > 0)
    OR (
      kind IN ('external_script', 'external_style')
      AND src_url IS NOT NULL
      AND src_url LIKE 'https://%'
    )
  ),
  /* A published row always carries its publish stamp — the admin list shows the
     date, and "published with no date" would be a hole in that column. */
  CONSTRAINT cms_code_snippets_published_stamp
    CHECK (is_published = false OR published_at IS NOT NULL)
);

/* Admin list: the tenant's snippets in author order. */
CREATE INDEX IF NOT EXISTS cms_code_snippets_tenant_idx
  ON public.cms_code_snippets (tenant_id, sort_order, created_at);

/* Render path: published rows for one tenant, already grouped by placement. */
CREATE INDEX IF NOT EXISTS cms_code_snippets_tenant_published_idx
  ON public.cms_code_snippets (tenant_id, placement, sort_order)
  WHERE is_published;

DROP TRIGGER IF EXISTS cms_code_snippets_touch_updated_at
  ON public.cms_code_snippets;
CREATE TRIGGER cms_code_snippets_touch_updated_at
  BEFORE UPDATE ON public.cms_code_snippets
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_touch_updated_at();

ALTER TABLE public.cms_code_snippets ENABLE ROW LEVEL SECURITY;

-- Staff of the OWNING tenant: full CRUD, drafts included. Mirrors every other
-- `*_tenant_staff` policy in the CMS family.
DROP POLICY IF EXISTS cms_code_snippets_tenant_staff ON public.cms_code_snippets;
CREATE POLICY cms_code_snippets_tenant_staff ON public.cms_code_snippets
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(cms_code_snippets.tenant_id))
  WITH CHECK (public.is_staff_of_tenant(cms_code_snippets.tenant_id));

-- Public / anon read: PUBLISHED rows of the tenant currently being rendered,
-- and nothing else. `current_tenant_id()` is NULL unless the reader RPC below
-- set it, so an ordinary anon SELECT against this table returns ZERO rows.
DROP POLICY IF EXISTS cms_code_snippets_select_tenant_published
  ON public.cms_code_snippets;
CREATE POLICY cms_code_snippets_select_tenant_published ON public.cms_code_snippets
  FOR SELECT
  USING (
    is_published = TRUE
    AND public.current_tenant_id() IS NOT NULL
    AND tenant_id = public.current_tenant_id()
  );

-- ---------------------------------------------------------------------------
-- Public reader RPC — same shape as cms_public_pages_for_tenant. SECURITY
-- INVOKER, so it cannot be used to escape RLS: its only privilege is setting
-- `app.current_tenant_id` for the transaction so the policy above matches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cms_public_code_snippets_for_tenant(
  p_tenant_id UUID
)
RETURNS SETOF public.cms_code_snippets
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, TRUE);
  RETURN QUERY
    SELECT * FROM public.cms_code_snippets
     WHERE tenant_id   = p_tenant_id
       AND is_published = TRUE
     ORDER BY sort_order, created_at;
END;
$$;

COMMENT ON FUNCTION public.cms_public_code_snippets_for_tenant(UUID) IS
  'Tenant-scoped public reader for cms_code_snippets. Sets app.current_tenant_id so the tenant-aware SELECT policy permits rows; returns only PUBLISHED snippets for the given tenant. The storefront injector must use this instead of a direct SELECT.';

COMMENT ON TABLE public.cms_code_snippets IS
  'Tenant-owned custom code library (Website -> Setup -> Custom code). Each row is one named snippet with its own placement and published state. Published rows are injected into that tenant''s OWN storefront only — never the admin app, never the platform hub, never another tenant.';

COMMIT;
