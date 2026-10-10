-- Talent social feed cache — TUL-562.
--
-- The talent-owned twin of tenant_social_feed_items. A paid talent connects
-- Instagram from their own Settings (talent_integrations, provider 'instagram')
-- and their personal site's social_feed block renders from here. Same contract
-- as the tenant cache: a cron refreshes, public pages read ONLY from Postgres,
-- so a vendor outage or an expired token never breaks a talent page.
--
-- A sibling table rather than a nullable owner column on the tenant cache:
-- tenant_social_feed_items is keyed by agencies(id) with staff RLS, and an
-- independent talent has no agency at all.

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_social_feed_items (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id  UUID        NOT NULL
                                   REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  provider           TEXT        NOT NULL CHECK (provider IN ('instagram')),
  external_id        TEXT        NOT NULL,
  media_url          TEXT        NOT NULL,
  media_type         TEXT        NOT NULL DEFAULT 'image'
                                   CHECK (media_type IN ('image','video')),
  poster_url         TEXT,
  permalink          TEXT,
  caption            TEXT,
  posted_at          TIMESTAMPTZ,
  -- Owner moderation; preserved across refreshes (the upsert never writes it).
  hidden             BOOLEAN     NOT NULL DEFAULT false,
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (talent_profile_id, provider, external_id)
);

COMMENT ON TABLE public.talent_social_feed_items IS
  'Cached Instagram media per talent profile. Refreshed by /api/cron/refresh-social-feeds; talent site pages read ONLY from here via the service role.';

CREATE INDEX IF NOT EXISTS talent_social_feed_items_read_idx
  ON public.talent_social_feed_items (talent_profile_id, provider, hidden, posted_at DESC);

ALTER TABLE public.talent_social_feed_items ENABLE ROW LEVEL SECURITY;

-- The talent may read their own cached posts. Writes go through the service
-- role only (cron, Sync now, disconnect), so no write policy is granted.
DROP POLICY IF EXISTS talent_social_feed_items_owner_select ON public.talent_social_feed_items;
CREATE POLICY talent_social_feed_items_owner_select ON public.talent_social_feed_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_social_feed_items.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

-- No anon policy: public talent pages render server-side through the service
-- role, so visitors never query this table directly.

COMMIT;
