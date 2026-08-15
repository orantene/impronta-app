-- Social feed cache — Phase 3 of the social-feed plan.
--
-- WHY A CACHE TABLE AND NOT A LIVE FETCH:
-- The social_feed block renders on PUBLIC tenant storefront pages. Calling the
-- Instagram/TikTok APIs per page view would (a) burn the per-token rate limit
-- within minutes of any traffic, (b) put a third-party network round-trip in the
-- render path, and (c) take the page down whenever the vendor is slow. So a cron
-- refreshes into this table and the page always renders from Postgres. If the
-- vendor is down or the token expired, the last good snapshot still serves.
--
-- Rows are REPLACED per (tenant, provider) on each refresh, so this never grows
-- unbounded: it holds at most `limit` items per connected account.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_social_feed_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL
                               REFERENCES public.agencies(id) ON DELETE CASCADE,
  provider       TEXT        NOT NULL CHECK (provider IN ('instagram','tiktok')),
  -- Provider-native post id. Unique per tenant+provider so a refresh can upsert
  -- and a moderation hide survives re-fetches (see hidden below).
  external_id    TEXT        NOT NULL,
  media_url      TEXT        NOT NULL,
  media_type     TEXT        NOT NULL DEFAULT 'image'
                               CHECK (media_type IN ('image','video')),
  poster_url     TEXT,
  permalink      TEXT,
  caption        TEXT,
  -- Provider timestamp; ordering key for "latest posts".
  posted_at      TIMESTAMPTZ,
  -- Operator moderation: hide a specific post without disconnecting the
  -- account. Preserved across refreshes because the upsert targets
  -- (tenant_id, provider, external_id) and never overwrites this column.
  hidden         BOOLEAN     NOT NULL DEFAULT false,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_id)
);

COMMENT ON TABLE public.tenant_social_feed_items IS
  'Cached Instagram/TikTok media per tenant. Refreshed by /api/cron/refresh-social-feeds; public storefront pages read ONLY from here so a vendor outage or rate limit can never break a tenant page.';

-- Read path is "newest visible first, per tenant+provider".
CREATE INDEX IF NOT EXISTS tenant_social_feed_items_read_idx
  ON public.tenant_social_feed_items (tenant_id, provider, hidden, posted_at DESC);

ALTER TABLE public.tenant_social_feed_items ENABLE ROW LEVEL SECURITY;

-- Workspace staff manage their own tenant's rows (same predicate as
-- tenant_integrations and the other per-tenant tables).
DROP POLICY IF EXISTS tenant_social_feed_items_staff_all ON public.tenant_social_feed_items;
CREATE POLICY tenant_social_feed_items_staff_all ON public.tenant_social_feed_items
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- NOTE on public reads: the storefront renders server-side through the service
-- role, so no anon SELECT policy is granted here. Anonymous visitors never query
-- this table directly — keeping it staff-only avoids exposing one tenant's feed
-- rows to another tenant's authenticated session.

COMMIT;
