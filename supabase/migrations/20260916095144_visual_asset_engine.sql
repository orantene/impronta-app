-- Visual Asset Engine (docs/plans/templates/03-visual-asset-engine.md v3, owner
-- decision-imagery-2026-09-16). Additive: the stock manifest gains review,
-- provenance, direction, tags and usage columns; two new tables hold the
-- per-tenant STORED selection (tenant_asset_assignments) and the per-site
-- generation queue (tenant_image_jobs). Existing rows are backfilled as
-- approved + unverified so nothing already served disappears.

-- 1. platform_stock_images: review, provenance, prompt layers, tags, usage --------------
ALTER TABLE public.platform_stock_images
  ADD COLUMN IF NOT EXISTS slot              text,
  ADD COLUMN IF NOT EXISTS approval          text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS direction         text,
  ADD COLUMN IF NOT EXISTS qa_json           jsonb,
  ADD COLUMN IF NOT EXISTS layer_versions    jsonb,
  ADD COLUMN IF NOT EXISTS tags              jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS origin_tenant_id  uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note       text,
  ADD COLUMN IF NOT EXISTS reviewed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS model             text,
  ADD COLUMN IF NOT EXISTS model_size        text,
  ADD COLUMN IF NOT EXISTS model_quality     text,
  ADD COLUMN IF NOT EXISTS prompt_version    text,
  ADD COLUMN IF NOT EXISTS generated_at      timestamptz,
  ADD COLUMN IF NOT EXISTS measured_cost_usd numeric(10,5),
  ADD COLUMN IF NOT EXISTS provenance        text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS times_placed      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_placed_at    timestamptz;

-- Backfill BEFORE the constraints: everything that existed was hand-curated and
-- already served, so it stays served; its origin is unknown, so it is
-- 'unverified' and never counted as a "photo placed" (03 §2).
UPDATE public.platform_stock_images
   SET approval   = 'approved',
       provenance = 'unverified',
       slot       = CASE WHEN role = 'gallery'
                         THEN 'gallery-' || ((sort_order % 4) + 1)::text
                         ELSE role END
 WHERE slot IS NULL;

ALTER TABLE public.platform_stock_images
  DROP CONSTRAINT IF EXISTS platform_stock_images_approval_check,
  ADD  CONSTRAINT platform_stock_images_approval_check
    CHECK (approval IN ('generated', 'qa_passed', 'approved', 'rejected', 'retired')),
  DROP CONSTRAINT IF EXISTS platform_stock_images_provenance_check,
  ADD  CONSTRAINT platform_stock_images_provenance_check
    CHECK (provenance IN ('generated', 'licensed', 'unverified')),
  DROP CONSTRAINT IF EXISTS platform_stock_images_slot_check,
  ADD  CONSTRAINT platform_stock_images_slot_check
    CHECK (slot IS NULL OR slot IN ('hero','wide','portrait','gallery-1','gallery-2','gallery-3','gallery-4','team','detail')),
  DROP CONSTRAINT IF EXISTS platform_stock_images_tags_object_check,
  ADD  CONSTRAINT platform_stock_images_tags_object_check
    CHECK (jsonb_typeof(tags) = 'object');

CREATE INDEX IF NOT EXISTS platform_stock_images_serving_idx
  ON public.platform_stock_images (family, business_type, role, approval, sort_order)
  WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS platform_stock_images_tags_gin
  ON public.platform_stock_images USING gin (tags);
CREATE INDEX IF NOT EXISTS platform_stock_images_review_idx
  ON public.platform_stock_images (approval, role, generated_at)
  WHERE approval IN ('generated', 'qa_passed');

COMMENT ON COLUMN public.platform_stock_images.approval IS
  'generated → qa_passed (automated QA) → approved (human). approved serves everywhere; qa_passed serves gallery/detail only; heroes serve approved only.';
COMMENT ON COLUMN public.platform_stock_images.direction IS
  'Visual direction inside the type (editorial | service | result | lifestyle | minimal), stored so five heroes are never one scene.';
COMMENT ON COLUMN public.platform_stock_images.tags IS
  'Stated brief facts the prompt was filled from (cuisine, clientele, setting, words, visual_direction). Only stated facts, never a guess. {} for seed assets.';
COMMENT ON COLUMN public.platform_stock_images.origin_tenant_id IS
  'The business a tenant_generated asset was made for. Kept after pool approval; the originator keeps its image.';
COMMENT ON COLUMN public.platform_stock_images.provenance IS
  'generated (prompt + model recorded) | licensed (supplier + licence) | unverified (pre-engine rows of unknown origin, never counted as photos placed).';
COMMENT ON COLUMN public.platform_stock_images.measured_cost_usd IS
  'From the provider usage reply at generation time, never a constant.';

-- Serving rule in RLS as well as in code: a non-approved row is visible only to
-- platform admins and to the tenant it was generated for.
DROP POLICY IF EXISTS platform_stock_images_read ON public.platform_stock_images;
CREATE POLICY platform_stock_images_read
  ON public.platform_stock_images FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (retired_at IS NULL AND approval IN ('approved', 'qa_passed') AND origin_tenant_id IS NULL)
    OR (origin_tenant_id IS NOT NULL AND public.is_staff_of_tenant(origin_tenant_id))
  );

-- 2. tenant_asset_assignments: the STORED selection (03 §5) --------------------------
CREATE TABLE IF NOT EXISTS public.tenant_asset_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  page_role              text NOT NULL,
  slot                   text NOT NULL,
  -- NULL for owner uploads and for the universal fallback rows that carry a src only.
  asset_id               uuid REFERENCES public.platform_stock_images(id) ON DELETE SET NULL,
  src                    text NOT NULL,
  source                 text NOT NULL,
  direction              text,
  site_compose_id        uuid,
  pending_job_id         uuid,
  selected_at            timestamptz NOT NULL DEFAULT now(),
  replaced_by_user_at    timestamptz,
  replaced_with_asset_id uuid REFERENCES public.platform_stock_images(id) ON DELETE SET NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_asset_assignments_unique UNIQUE (tenant_id, page_role, slot),
  CONSTRAINT tenant_asset_assignments_source_check
    CHECK (source IN ('owner', 'tenant_generated', 'type_pool', 'family_pool', 'universal')),
  CONSTRAINT tenant_asset_assignments_page_role_check
    CHECK (page_role IN ('shell', 'home', 'catalogue', 'transaction', 'about', 'contact', 'gallery')),
  CONSTRAINT tenant_asset_assignments_slot_check
    CHECK (slot IN ('hero','wide','portrait','gallery-1','gallery-2','gallery-3','gallery-4','team','detail'))
);
CREATE INDEX IF NOT EXISTS tenant_asset_assignments_asset_idx
  ON public.tenant_asset_assignments (asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenant_asset_assignments_pending_idx
  ON public.tenant_asset_assignments (tenant_id) WHERE pending_job_id IS NOT NULL;
COMMENT ON TABLE public.tenant_asset_assignments IS
  'Which image a tenant''s page slot holds and where it came from. Written once by the composer, updated by the per-site image job and by the builder; never recomputed at render. A retired pool asset is swapped per tenant through this table.';
COMMENT ON COLUMN public.tenant_asset_assignments.pending_job_id IS
  'Set while a per-site generation is in flight for this slot; the builder shows "your photos are being made" on exactly these slots.';

DROP TRIGGER IF EXISTS tenant_asset_assignments_updated_at ON public.tenant_asset_assignments;
CREATE TRIGGER tenant_asset_assignments_updated_at
  BEFORE UPDATE ON public.tenant_asset_assignments
  FOR EACH ROW EXECUTE FUNCTION public.platform_stock_images_set_updated_at();

ALTER TABLE public.tenant_asset_assignments ENABLE ROW LEVEL SECURITY;
-- Tenant staff read their own rows (the builder's pending state); every write
-- goes through the service role (composer, job runner, builder actions).
DROP POLICY IF EXISTS tenant_asset_assignments_read ON public.tenant_asset_assignments;
CREATE POLICY tenant_asset_assignments_read
  ON public.tenant_asset_assignments FOR SELECT
  TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_super_admin());

-- 3. tenant_image_jobs: the per-site generation queue (03 §4b) -----------------------
CREATE TABLE IF NOT EXISTS public.tenant_image_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  site_compose_id  uuid,
  business_type    text,
  family           text NOT NULL,
  -- [{ pageRole, slot, direction, status: queued|done|failed|blocked|skipped, assetId?, reason? }]
  slots            jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'queued',
  attempts         integer NOT NULL DEFAULT 0,
  cost_usd         numeric(10,5) NOT NULL DEFAULT 0,
  error            text,
  requested_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_image_jobs_status_check
    CHECK (status IN ('queued', 'running', 'done', 'partial', 'failed')),
  CONSTRAINT tenant_image_jobs_slots_array_check CHECK (jsonb_typeof(slots) = 'array'),
  CONSTRAINT tenant_image_jobs_facts_object_check CHECK (jsonb_typeof(facts) = 'object')
);
CREATE INDEX IF NOT EXISTS tenant_image_jobs_queue_idx
  ON public.tenant_image_jobs (created_at) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS tenant_image_jobs_tenant_idx
  ON public.tenant_image_jobs (tenant_id, created_at DESC);
COMMENT ON TABLE public.tenant_image_jobs IS
  'One row per site whose images are generated for that business (source tenant_generated). Enqueued by the composer only for a verified account; drained by the cron runner at concurrency 2; spend metered by the daily image ceiling.';

DROP TRIGGER IF EXISTS tenant_image_jobs_updated_at ON public.tenant_image_jobs;
CREATE TRIGGER tenant_image_jobs_updated_at
  BEFORE UPDATE ON public.tenant_image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.platform_stock_images_set_updated_at();

ALTER TABLE public.tenant_image_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_image_jobs_read ON public.tenant_image_jobs;
CREATE POLICY tenant_image_jobs_read
  ON public.tenant_image_jobs FOR SELECT
  TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_super_admin());
