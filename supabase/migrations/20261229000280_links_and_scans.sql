-- QR & Links Q1 — the link is the object; the QR is a rendering.
--
-- WHAT THIS IS
-- A QR code, an NFC tap, a WhatsApp share and a printed flyer are four ways of
-- handing someone the same tracked link to something bookable. So the thing we
-- store is the link, and every rendering reads from it. One table for the link,
-- one for the scans it collects.
--
-- WHY THE CODE IS SHORT AND READABLE AND NOT A SECRET
-- `code` is 't7', 'door', 'reserve'. A code printed on a table tent in a public
-- dining room is not a secret: anyone who can photograph it has it, so making it
-- unguessable protects nothing while costing the two things the product needs —
-- a link a guest can TYPE off the bottom of a card, and one staff can recognise.
--
-- The forgeable thing is not the code, it is the CLAIM: "I am Table 7", "promo
-- SALSA10 applies". That is why `context` lives on this row and never in the
-- URL. The resolver looks the code up and reads the context off the row it owns,
-- so there is nothing in the URL to tamper with — which is stronger than signing
-- a parameter would be, because a signature can only detect tampering with a
-- value that is present. Enumeration is answered by a rate limit at the edge,
-- not by a secret.
--
-- WHY `targets` IS AN ORDERED LIST AND NOT A COLUMN
-- The printed code never changes; the destination can, and must be able to
-- change BY TIME OF DAY. The front-door code sells tonight's tickets before
-- doors and the menu after. That is a list of rules evaluated first-match-wins
-- against a wall clock in the VENUE's timezone, not a single destination.
-- The evaluation lives in `lib/links/resolve-target.ts`, pure and tested; this
-- column only stores it. The one rule the database does enforce is that the
-- list ends in a reachable default (see `links_targets_shape`), because a link
-- with no default is discovered at 23:30 on a Saturday by a guest holding a
-- phone, and this repo has a standing lesson about functions that answer
-- instead of refusing.
--
-- WHY `context` IS JSONB WITH NO FOREIGN KEYS, THOUGH THE TABLES NOW EXIST
-- `spaces`, `sessions` and `orders` landed on main while this was being written.
-- The keys are still FK-free on purpose: a link is a PRINTED artefact with a
-- life measured in years, and `ON DELETE CASCADE` from a space to a link would
-- silently destroy a code that is glued to eleven tables the moment a room is
-- reconfigured. A dangling `space_id` must degrade to "the menu with no table
-- attached", which is a fine guest experience; a deleted link is a dead tent.
-- The consuming feature decides what a context key MEANS; this table only
-- carries it.
--
-- WHY `tenant_id` IS ON THE SCAN TOO
-- Denormalised on purpose. The proposal's own 0.9 item is "analytics_events
-- .tenant_id written by every producer" — the same mistake one level down — and
-- joining through `links` for every analytics read is the slower answer anyway.
--
-- WHAT A SCAN MAY RECORD
-- `session_key` is a salted hash of IP plus user agent, computed in the app and
-- never stored raw. Enough to tell "one person refreshed five times" from "five
-- people scanned"; not enough to identify anyone. No raw IP is stored here and
-- none is ever put in a URL.
--
-- NAMING
-- Not `short_links`, not `qr_codes`: the QR is a rendering of this row, not the
-- row. No table here is called reservations, bookings or holds.
--
-- Rollback: DROP TABLE public.link_scans; DROP TABLE public.links;
-- Nothing else references them yet.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

CREATE TABLE IF NOT EXISTS public.links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'other',
  targets       jsonb NOT NULL DEFAULT '[]'::jsonb,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'active',
  printed_count integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Lowercase, digit-or-letter first, hyphens inside, 1 to 32 characters. The
  -- shape a person can read off a printed card and type without a keyboard
  -- fight: no underscores, no case to get wrong, no trailing hyphen.
  CONSTRAINT links_code_format CHECK (code ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$'),
  CONSTRAINT links_status_valid CHECK (status IN ('active', 'paused')),
  CONSTRAINT links_kind_valid CHECK (kind IN (
    'table', 'event', 'session', 'appointment', 'campaign',
    'person', 'reserve', 'bill', 'profile', 'menu', 'other'
  )),
  CONSTRAINT links_printed_count_sane CHECK (printed_count >= 0),

  -- A link must be a non-empty ARRAY of rules whose LAST element is the
  -- unconditional default. Checked here rather than only in the application
  -- because this is the invariant whose violation is invisible until a guest
  -- scans at the wrong hour: every other rule is allowed to not match, and if
  -- none of them does there has to be something left to answer with.
  CONSTRAINT links_targets_shape CHECK (
    jsonb_typeof(targets) = 'array'
    AND jsonb_array_length(targets) >= 1
    AND targets -> (jsonb_array_length(targets) - 1) ->> 'when' = 'always'
  ),
  CONSTRAINT links_context_is_object CHECK (jsonb_typeof(context) = 'object')
);

-- One tenant, one host, so "unique per host" IS unique per tenant. Two
-- restaurants both get /q/t7 on their own domains. Indexed on lower(code)
-- because the resolver lowercases before it looks up: a guest who types T7 off
-- a printed card in a dark bar must land where they expect.
CREATE UNIQUE INDEX IF NOT EXISTS links_tenant_code_key
  ON public.links (tenant_id, lower(code));

CREATE INDEX IF NOT EXISTS links_tenant_status_idx
  ON public.links (tenant_id, status);

COMMENT ON TABLE public.links IS
  'Tracked, retargetable short links. The link is the object; QR, NFC, share '
  'and print are renderings of it. Resolved at /q/<code> on the tenant host.';
COMMENT ON COLUMN public.links.code IS
  'Short, lowercase, typeable, unique per tenant. Deliberately NOT a secret: a '
  'code printed in a public room cannot be one. Context is what is protected, '
  'by living on this row instead of in the URL.';
COMMENT ON COLUMN public.links.targets IS
  'Ordered rules, first match wins, last must be {"when":"always"}. Evaluated '
  'by lib/links/resolve-target.ts against a wall clock in the venue timezone.';
COMMENT ON COLUMN public.links.context IS
  'What rides along to whatever the guest does next: space_id, session_id, '
  'promo_code, talent_profile_id, campaign. FK-free on purpose — a printed '
  'code outlives the rows it points at, and must degrade rather than vanish.';

CREATE TABLE IF NOT EXISTS public.link_scans (
  id           bigserial PRIMARY KEY,
  link_id      uuid NOT NULL REFERENCES public.links(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  scanned_at   timestamptz NOT NULL DEFAULT now(),
  device_class text NOT NULL DEFAULT 'unknown',
  is_nfc       boolean NOT NULL DEFAULT false,
  referrer     text,
  country      text,
  session_key  text,
  -- The destination the rules actually picked, stored so the detail drawer can
  -- answer "what did people get when they scanned at 9pm" without replaying
  -- the rules against a `targets` list that has since been edited. A scan is a
  -- historical fact; re-deriving it from current configuration would be a
  -- different question wearing the same label.
  resolved_to  text,

  CONSTRAINT link_scans_device_class_valid CHECK (
    device_class IN ('phone', 'tablet', 'desktop', 'bot', 'unknown')
  ),
  CONSTRAINT link_scans_country_shape CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS link_scans_link_at_idx
  ON public.link_scans (link_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS link_scans_tenant_at_idx
  ON public.link_scans (tenant_id, scanned_at DESC);

COMMENT ON TABLE public.link_scans IS
  'One row per resolution of /q/<code>. Never stores a raw IP; session_key is '
  'a salted hash of IP + user agent, enough to separate a refresh from a new '
  'visitor and not enough to identify anyone.';
COMMENT ON COLUMN public.link_scans.resolved_to IS
  'The destination the rules picked AT SCAN TIME. A scan is a historical fact, '
  'not something to re-derive from a targets list that may since have changed.';

-- RLS. Staff of the tenant read their own links and scans. There is no anon
-- grant and no public policy: the resolver runs service-role at the edge, and
-- an unauthenticated reader has no business enumerating a tenant's codes even
-- though any single code is public once printed. Writes are service-role only
-- (link-store.ts), so no INSERT/UPDATE policy is granted here.
ALTER TABLE public.links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS links_select_staff ON public.links;
CREATE POLICY links_select_staff ON public.links
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS link_scans_select_staff ON public.link_scans;
CREATE POLICY link_scans_select_staff ON public.link_scans
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

GRANT SELECT ON TABLE public.links      TO authenticated;
GRANT SELECT ON TABLE public.link_scans TO authenticated;

-- Reserve the `q` slug (layer 2 of 2), because /q/<code> now resolves on every
-- tenant host. Once a root segment resolves there, a CMS page authored at that
-- slug can never open, so it must be reserved on both layers or the page is
-- silently unreachable. Layer 1 is web/src/lib/site-admin/reserved-routes.ts
-- (PLATFORM_RESERVED_SLUGS) plus the two allow-list reserved sets; layer 2 is
-- this table plus cms_pages_reserved_slug_guard. Same shape as
-- 20261229000500 for `me`.
--
-- Verified against production before writing this: zero rows in
-- public.cms_pages hold slug 'q' and zero rows in public.agency_domains have
-- tenant_slug 'q', so nothing is grandfathered or disturbed.
INSERT INTO public.platform_reserved_slugs (slug, reason) VALUES
  ('q', 'tracked link resolver (/q/<code>), a platform route on every tenant host, not tenant-authored')
ON CONFLICT (slug) DO NOTHING;
