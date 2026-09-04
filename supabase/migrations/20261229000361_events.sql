-- Phase 2 · E1 — `events`: a composition, owning nothing that already exists.
--
-- An event is sessions (Sessions & Classes) + a venue (Spaces) + tiers as
-- catalog variants with pools (Capacity) + orders (Orders) + a lineup on the
-- inquiry spine + a page (Page Builder). It contributes policy and identity and
-- nothing else. It has NO availability logic of its own, on purpose: sessions
-- and pools do that, and an event that could also refuse a sale would be a
-- second place to look when a customer says the site let them buy a sold seat.
--
-- DELETING AN EVENT MUST NOT PUBLISH ITS SESSIONS, and this is the reason
-- `sessions.event_id` is `ON DELETE SET NULL` rather than anything cleverer.
-- `20261229000214:159-160` grants `anon` a SELECT on `sessions` where
-- `status = 'scheduled'`. So a bare SET NULL would leave a deleted show's four
-- nights sitting there, publicly selectable, bookable, and belonging to nothing
-- -- promoted to standalone schedule entries by the removal of the thing that
-- explained them. CASCADE is not the alternative: it destroys occurrences people
-- bought, against the standing rule that a sold session is history.
--
-- The ruling, ratified: deleting an event IS a cancellation (sessions to
-- 'cancelled' plus deactivating their pools), cancelling an event does the same
-- explicitly -- that is the path that actually gets used, and a cancelled show
-- whose nights stay on sale is the identical bug behind a likelier door -- and
-- DELETE is permitted only for a `draft` event with zero admissions. SET NULL is
-- then a backstop that should never fire, which is the correct job for one.
--
-- WHY THAT IS ENFORCED IN THE DELETE PATH AND NOT BY A TRIGGER HERE. A
-- `BEFORE DELETE` trigger refusing non-draft events reads as the stronger
-- choice and is a trap: `tenant_id` is `ON DELETE CASCADE` from `agencies`, so
-- the trigger would also fire on every row of a tenant being deleted and block
-- tenant deletion entirely -- a guard firing where it was never aimed, which
-- this board already has three entries about. The behaviour lives in
-- `lib/events/delete.ts` where a person can read it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  venue_id             uuid REFERENCES public.venues(id) ON DELETE SET NULL,

  -- NULLABLE AND UNREAD UNTIL SPACES S4. Delete it if S4 slips: it exists so
  -- their migration adds a constraint rather than a column, which is a
  -- difference in who writes one ALTER and nothing else. Framed as a reason to
  -- remove it rather than a reason to keep it, deliberately.
  layout_id            uuid,

  series_id            uuid REFERENCES public.session_series(id) ON DELETE SET NULL,
  offering_id          uuid REFERENCES public.talent_offerings(id) ON DELETE SET NULL,

  slug                 text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 120),
  title                text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description          text,
  cover_media_id       uuid,
  page_id              uuid,

  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','published','cancelled')),

  -- A WORD, NOT A SCHEMA. Selects the customer-facing noun from the words table;
  -- a free conference registration and a $600 VIP table are the same three rows
  -- with different numbers, and nothing downstream branches on this.
  admission_kind       text NOT NULL DEFAULT 'ticket'
                         CHECK (admission_kind IN ('ticket','pass','registration','rsvp')),

  -- DOORS IS AN OFFSET, NOT A TIME. "Doors 30 minutes before" is right for a
  -- whole series without a per-occurrence edit, and it needs no timezone: it is
  -- subtraction against `sessions.starts_at`, which is already a resolved
  -- instant. A `doors_at` column on `sessions` would be a second wall clock to
  -- keep in step with the first, and this platform shipped two zone resolvers
  -- with opposite DST policies last week. If a one-off session ever needs its
  -- own doors time, that is Sessions' column to add, with a reader.
  doors_offset_minutes int NOT NULL DEFAULT 0
                         CHECK (doors_offset_minutes >= 0 AND doors_offset_minutes <= 1440),

  -- NULL MEANS INHERIT THE WORKSPACE DEFAULT, which is why these are nullable
  -- rather than defaulted. An absent value is not a value: defaulting them here
  -- would silently freeze today's workspace policy onto every event ever created
  -- and make a later change to the default do nothing.
  age_gate             int CHECK (age_gate IS NULL OR age_gate BETWEEN 1 AND 99),
  refund_cutoff_hours  int CHECK (refund_cutoff_hours IS NULL OR refund_cutoff_hours >= 0),

  -- HOURS, NOT DAYS, against the brief's wording. Every screen says 48h, and a
  -- venue cancelling at noon for a 21:00 show is an hours-shaped question. Days
  -- is a lossy unit for something that happens after dinner.
  payout_release_rule  text NOT NULL DEFAULT 'on_session_end'
                         CHECK (payout_release_rule IN ('immediate','on_fulfilment','on_session_end')),

  published_at         timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Published implies a stamp; it does not forbid one on a draft, because an
  -- event that was published and pulled back keeps the record of when it went
  -- live. Cancelled is biconditional: the stamp IS the cancellation.
  CONSTRAINT events_published_stamp CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT events_cancelled_stamp CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS events_tenant_slug_uniq
  ON public.events (tenant_id, lower(slug));
CREATE INDEX IF NOT EXISTS events_tenant_status_idx
  ON public.events (tenant_id, status);
CREATE INDEX IF NOT EXISTS events_venue_idx
  ON public.events (venue_id) WHERE venue_id IS NOT NULL;

-- ── The link to occurrences ────────────────────────────────────────────────
--
-- On `sessions` rather than a join table, and pointing this way rather than the
-- other, by the department's rule: two events cannot legitimately share one
-- session, so it is one-to-many and the link belongs on the many side. A join
-- table would permit exactly the thing this is protecting against. Written by
-- me, into Sessions' table, with their agreement -- the manager who needs the
-- column writes it, the same way Orders let Sessions put `session_id` on
-- `order_lines`.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sessions_event_idx
  ON public.sessions (event_id, starts_at) WHERE event_id IS NOT NULL;

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- Public read is `status = 'published'` ONLY. A draft event is a working
-- document and a cancelled one must stop being listed the moment it is
-- cancelled, which is the same reason `sessions` exposes only 'scheduled'.
-- Writes are service-role, as everywhere else in this spine.

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_staff ON public.events;
CREATE POLICY events_select_staff ON public.events
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS events_select_public ON public.events;
CREATE POLICY events_select_public ON public.events
  FOR SELECT TO anon, authenticated USING (status = 'published');

REVOKE ALL ON TABLE public.events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.events TO anon, authenticated;

-- ── Touch trigger ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.events_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_touch_trg ON public.events;
CREATE TRIGGER events_touch_trg
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_touch();

COMMENT ON TABLE public.events IS
  'A composition: sessions + venue + tiers-as-variants + orders + lineup + page. Owns policy and '
  'identity only. It has NO availability logic; sessions and capacity pools do that.';
COMMENT ON COLUMN public.events.doors_offset_minutes IS
  'Minutes before sessions.starts_at that doors open. An offset, not a time: no timezone is '
  'involved because starts_at is already a resolved instant.';
COMMENT ON COLUMN public.events.refund_cutoff_hours IS
  'Hours before the session start after which no refund is due. NULL inherits the workspace '
  'default; it is NOT defaulted here, because defaulting would freeze today policy onto every '
  'event and make a later change to the default do nothing.';
COMMENT ON COLUMN public.events.layout_id IS
  'Unread until Spaces S4. Delete it if S4 slips.';
COMMENT ON COLUMN public.sessions.event_id IS
  'The event this occurrence belongs to, if any. ON DELETE SET NULL is a BACKSTOP: deleting an '
  'event is a cancellation of its sessions, and DELETE is restricted to draft events with zero '
  'admissions. Without that, a bare SET NULL would leave a deleted show nights publicly '
  'selectable via the sessions anon policy.';

COMMIT;
