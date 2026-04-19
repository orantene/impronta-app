-- SaaS Phase 1.B / B3 — tenantise the CMS family.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B3,
--      docs/saas/phase-0/01-entity-ownership-map.md §3 (CMS is tenant-scoped).
--
-- Pages, posts, navigation, redirects, revisions, collections, and
-- collection_items all belong to an agency's storefront. Phase 1 backfills
-- every existing row to tenant #1.

BEGIN;

-- cms_pages ------------------------------------------------------------------

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.cms_pages
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- cms_posts ------------------------------------------------------------------

ALTER TABLE public.cms_posts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.cms_posts
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- cms_navigation_items -------------------------------------------------------

ALTER TABLE public.cms_navigation_items
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.cms_navigation_items
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- cms_redirects --------------------------------------------------------------

ALTER TABLE public.cms_redirects
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.cms_redirects
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- cms_page_revisions ---------------------------------------------------------

ALTER TABLE public.cms_page_revisions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.cms_page_revisions
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- cms_post_revisions ---------------------------------------------------------

ALTER TABLE public.cms_post_revisions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.cms_post_revisions
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- collections ----------------------------------------------------------------

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.collections
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- collection_items -----------------------------------------------------------

ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.collection_items
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

COMMIT;
