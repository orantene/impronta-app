-- Events program · Wave 1 / PR A — `event_schedule_items` + `events.program`.
--
-- ONE ROW PER TIMED THING inside an event: a DJ set, a panel, a food service
-- period, doors, a break. "Programa", "Lineup", "Agenda", "What's on" are
-- public PRESENTATIONS of these rows chosen per block; the model is generic
-- because a set and a ceremony differ only by `kind`, and grouping by night /
-- stage / day is a query, not a schema (docs/plans/events-program/00-proposal.md §2).
--
-- NOT A SESSION. `sessions` is the sellable capacity unit with a uniqueness
-- rule (`sessions_event_night_uniq`) that forbids two things at the same
-- instant in one venue. A program has parallel stages by design, so schedule
-- items carry NO uniqueness on time: simultaneous rows are legal and an
-- overlap in the same space is a UI warning, never a constraint.
--
-- FOUR CONCEPTS, FOREIGN KEYS ONLY:
--   event_id    → events         CASCADE   the item cannot outlive its event
--   session_id  → sessions       SET NULL  "which night" for multi-day grouping;
--                                          a cancelled night hides its items in
--                                          the reader, the row survives
--   space_id    → spaces         SET NULL  the stage / room / area
--   performer_talent_profile_id → talent_profiles SET NULL
--                                          a Tulala talent; an unpublished or
--                                          deleted profile falls back to the
--                                          stored performer_name / cover
--
-- TIMES ARE INSTANTS. `starts_at` / `ends_at` are timestamptz rendered in the
-- venue's zone by the reader; `ends_at IS NULL` means "until the next item";
-- `time_tba` lets a row exist with no instant at all (sorted last).
--
-- RLS follows `sessions`: staff of the tenant read everything, `anon` reads a
-- published + public row whose parent event is itself published, and there is
-- NO write policy of any kind. Writes are service-role only, through the
-- server actions, exactly as `sessions` and `events` work.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_schedule_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  event_id                    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  session_id                  uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  space_id                    uuid REFERENCES public.spaces(id) ON DELETE SET NULL,

  kind                        text NOT NULL DEFAULT 'other'
                                CHECK (kind IN (
                                  'set','performance','talk','panel','workshop','class',
                                  'ceremony','presentation','service','break','competition',
                                  'meet_greet','afterparty','doors','close','other')),

  title                       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  subtitle                    text CHECK (subtitle IS NULL OR char_length(subtitle) <= 200),
  description                 text CHECK (description IS NULL OR char_length(description) <= 600),

  starts_at                   timestamptz,
  ends_at                     timestamptz,
  time_tba                    boolean NOT NULL DEFAULT false,

  performer_talent_profile_id uuid REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  performer_name              text CHECK (performer_name IS NULL OR char_length(performer_name) <= 200),
  performer_tba               boolean NOT NULL DEFAULT false,

  -- Same `cover_media_id` pattern as `events` / tiers: a media_assets id with
  -- no FK, resolved by the media library reader. Falls back to the linked
  -- talent's hero when NULL.
  cover_media_id              uuid,
  media                       jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { gallery_media_ids?: uuid[<=6], video_url? }
  links                       jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { href?, label?, instagram?, website? }
  sponsor                     jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { name?, logo_media_id?, url? }
  tags                        text[] NOT NULL DEFAULT '{}',

  -- `staff` rows are the run of show (soundcheck, changeover): never public.
  visibility                  text NOT NULL DEFAULT 'public'
                                CHECK (visibility IN ('public','staff')),
  status                      text NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','published')),

  -- Manual order among rows sharing a start instant. Time is the primary order.
  sort_order                  integer NOT NULL DEFAULT 0,

  -- Same overlay shape the builder uses on nodes: { es: { title, subtitle, description } }.
  i18n                        jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_schedule_items_range
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  -- A row with no start is a TBA row; a TBA row may still carry a provisional start.
  CONSTRAINT event_schedule_items_time_or_tba
    CHECK (starts_at IS NOT NULL OR time_tba),
  CONSTRAINT event_schedule_items_media_object   CHECK (jsonb_typeof(media)   = 'object'),
  CONSTRAINT event_schedule_items_links_object   CHECK (jsonb_typeof(links)   = 'object'),
  CONSTRAINT event_schedule_items_sponsor_object CHECK (jsonb_typeof(sponsor) = 'object'),
  CONSTRAINT event_schedule_items_i18n_object    CHECK (jsonb_typeof(i18n)    = 'object')
);

CREATE INDEX IF NOT EXISTS event_schedule_items_tenant_event_starts_idx
  ON public.event_schedule_items (tenant_id, event_id, starts_at);
CREATE INDEX IF NOT EXISTS event_schedule_items_event_session_idx
  ON public.event_schedule_items (event_id, session_id);
CREATE INDEX IF NOT EXISTS event_schedule_items_event_space_idx
  ON public.event_schedule_items (event_id, space_id);

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_schedule_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_schedule_items_select_staff ON public.event_schedule_items;
CREATE POLICY event_schedule_items_select_staff ON public.event_schedule_items
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

-- Public read: the row is published AND public AND its event is published.
-- A draft event's program is a working document; a cancelled event's program
-- disappears the moment the event does (events_select_public is status =
-- 'published' only, and this predicate repeats it rather than relying on the
-- join being filtered, because anon reads this table directly).
DROP POLICY IF EXISTS event_schedule_items_select_public ON public.event_schedule_items;
CREATE POLICY event_schedule_items_select_public ON public.event_schedule_items
  FOR SELECT TO anon, authenticated USING (
    status = 'published'
    AND visibility = 'public'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.status = 'published'
    )
  );

-- No write policy of any kind: writes are service-role only, as on `sessions`.
REVOKE ALL ON TABLE public.event_schedule_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_schedule_items TO anon, authenticated;

-- ── Touch trigger (sibling of events_touch / sessions_touch) ──────────────

CREATE OR REPLACE FUNCTION public.event_schedule_items_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.event_schedule_items_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS event_schedule_items_touch_trg ON public.event_schedule_items;
CREATE TRIGGER event_schedule_items_touch_trg
  BEFORE UPDATE ON public.event_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.event_schedule_items_touch();

COMMENT ON TABLE public.event_schedule_items IS
  'One timed thing inside an event (set, talk, service, doors...). Public words "Programa" / '
  '"Lineup" / "Agenda" are presentations of these rows. NOT a session: no capacity, no tickets, '
  'no uniqueness on time (parallel stages are legal; same-space overlap is a UI warning).';
COMMENT ON COLUMN public.event_schedule_items.session_id IS
  'The night this item belongs to, for multi-day grouping. SET NULL on delete; items with no '
  'session render in a leading "General" group.';
COMMENT ON COLUMN public.event_schedule_items.ends_at IS
  'NULL means "until the next item". Rendered in the venue zone; never a wall clock.';
COMMENT ON COLUMN public.event_schedule_items.time_tba IS
  'TRUE when the start is not announced yet. TBA rows sort last inside their group.';
COMMENT ON COLUMN public.event_schedule_items.visibility IS
  'public: on the page. staff: run of show only (soundcheck, changeover); never readable by anon.';
COMMENT ON COLUMN public.event_schedule_items.i18n IS
  'Per-row translation overlay, same shape as builder nodes: { es: { title, subtitle, description } }.';

-- ── events.program ────────────────────────────────────────────────────────
--
-- { enabled: bool, heading: string, heading_i18n?: { es: string },
--   set_times_public: bool, group_by: 'day' | 'stage' | 'none' }
-- `set_times_public=false` publishes the lineup without times, which is the
-- intent `lib/events/lineup.ts` has declared for months without a column.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS program jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_program_object;
ALTER TABLE public.events
  ADD CONSTRAINT events_program_object CHECK (jsonb_typeof(program) = 'object');

COMMENT ON COLUMN public.events.program IS
  'Program settings: { enabled, heading, heading_i18n?, set_times_public, group_by }. '
  'Normalised by lib/events/schedule/model.ts; an empty object means every default '
  '(disabled). The rows themselves live in event_schedule_items.';

COMMIT;
