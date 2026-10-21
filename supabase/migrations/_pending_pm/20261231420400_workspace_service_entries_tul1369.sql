-- TUL-1369: the owner's service hub entries (groups of what people offer, sold as ONE entry).
--
-- HELD in _pending_pm. Applies AFTER 20261231419300 (workspace_service_listings, #4159); it raises
-- if that table is missing so the order cannot be got wrong silently. Additive and idempotent.
-- No backfill: until an owner decides, every accepted listing simply waits in the review queue.
--
--   workspace_service_entries   one row per entry the workspace sells: name, category, photo,
--                               hub price, who is shown, who talks to the client, booking type,
--                               feature / hide. An entry may be backed by the workspace's OWN
--                               service (own_offering_id) so own services sit in the same list.
--   workspace_service_listings  gains entry_id (the entry that holds the listing; null = waiting in
--                               the review queue) and owner_skipped_at (the owner skipped it).
--
-- Writes go through the service role after the app checks the team role (editors edit entries,
-- managers coordinate, admins change terms and money); there is NO write policy for users.
--
-- Rollback (only if nothing has written here yet):
--   ALTER TABLE public.workspace_service_listings DROP COLUMN IF EXISTS entry_id, DROP COLUMN IF EXISTS owner_skipped_at;
--   DROP TABLE IF EXISTS public.workspace_service_entries;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.workspace_service_listings') IS NULL THEN
    RAISE EXCEPTION 'apply 20261231419300 (workspace_service_listings) first' USING ERRCODE = '55000';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.workspace_service_entries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name             text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  category         text        NULL CHECK (category IS NULL OR char_length(category) <= 120),
  photo_media_id   uuid        NULL REFERENCES public.media_assets(id) ON DELETE SET NULL,
  booking_type     text        NOT NULL DEFAULT 'request' CHECK (booking_type IN ('request', 'instant')),
  hub_price_cents  bigint      NULL CHECK (hub_price_cents IS NULL OR (hub_price_cents >= 0 AND hub_price_cents <= 1000000000000)),
  currency         text        NULL CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  show_who         text        NOT NULL DEFAULT 'name' CHECK (show_who IN ('name', 'portfolio', 'hidden')),
  client_contact   text        NOT NULL DEFAULT 'workspace' CHECK (client_contact IN ('workspace', 'talent')),
  featured         boolean     NOT NULL DEFAULT false,
  hidden           boolean     NOT NULL DEFAULT false,
  own_offering_id  uuid        NULL REFERENCES public.talent_offerings(id) ON DELETE SET NULL,
  created_by       uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_service_entries_not_both CHECK (NOT (featured AND hidden))
);

CREATE INDEX IF NOT EXISTS workspace_service_entries_tenant_idx
  ON public.workspace_service_entries (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_service_entries_own_offering_uniq
  ON public.workspace_service_entries (tenant_id, own_offering_id)
  WHERE own_offering_id IS NOT NULL;

ALTER TABLE public.workspace_service_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_service_entries_read ON public.workspace_service_entries;
CREATE POLICY workspace_service_entries_read ON public.workspace_service_entries
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON public.workspace_service_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workspace_service_entries TO authenticated;

ALTER TABLE public.workspace_service_listings
  ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES public.workspace_service_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_skipped_at timestamptz;

CREATE INDEX IF NOT EXISTS workspace_service_listings_entry_idx
  ON public.workspace_service_listings (entry_id)
  WHERE entry_id IS NOT NULL;

COMMENT ON TABLE public.workspace_service_entries IS
  'TUL-1369: a service the workspace sells, made of one or more listings (people). Written by the service role after a team-role check; staff read.';
COMMENT ON COLUMN public.workspace_service_listings.entry_id IS
  'TUL-1369: the entry that holds this listing. Null = waiting in the owner review queue.';

COMMIT;
