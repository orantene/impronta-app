-- Phase 1.5 / Pitch feature.
--
-- A Pitch is an admin-curated talent suggestion sent to a client (existing
-- or guest) via a public, token-gated landing page. The recipient can review
-- the suggested talents on a mobile-first page, remove talents they don't
-- want, and convert the pitch into a real inquiry with one CTA. After
-- conversion, the pitch becomes a normal inquiry under the existing
-- pipeline. Pitch is upstream of inquiry, not parallel to it.
--
-- Adds:
--   • pitch_status enum
--   • pitch_share_channel enum
--   • pitches table (the entity)
--   • pitch_talents table (ordered talent list per pitch)
--   • pitch_attachments table (images / pdfs at pitch- or talent-level)
--   • pitch_events table (timeline of state changes — append-only)
--   • storage bucket "pitch-files" for attachment binaries
--   • inquiry_source_channel enum gains 'pitch'
--   • inquiries.source_pitch_id column (lineage from inquiry → pitch)
--
-- Source-of-truth spec: docs/plans/pitch-feature-execution-plan-2026-05-07.md
-- Binding memory:       project_pitch_feature.md

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  CREATE TYPE public.pitch_status AS ENUM (
    'draft',
    'sent',
    'viewed',
    'edited',
    'converted',
    'declined',
    'cancelled',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.pitch_share_channel AS ENUM (
    'whatsapp',
    'email',
    'copy_link'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Add 'pitch' to inquiry_source_channel so converted pitches surface as
-- inquiries with a distinct origin and we can filter / report on them.
DO $$
BEGIN
  ALTER TYPE public.inquiry_source_channel ADD VALUE 'pitch';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. pitches — the core entity
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pitches (
  id                    UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID                    NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  created_by_user_id    UUID                    REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Re-pitch lineage. NULL for original pitches; set when admin sends a
  -- revised version. We do not modify the parent pitch in place; each
  -- revision is a fresh row so the timeline stays clean.
  parent_pitch_id       UUID                    REFERENCES public.pitches(id) ON DELETE SET NULL,

  -- Token revocation: the JWT we sign carries this id as the `revisionId`
  -- claim. Rotating the column (or cancelling the pitch) invalidates every
  -- previously-issued token without re-issuing a new bucket of secrets.
  share_token_id        UUID                    NOT NULL DEFAULT gen_random_uuid(),

  status                public.pitch_status     NOT NULL DEFAULT 'draft',

  -- Recipient identity. EITHER recipient_user_id (existing client) OR
  -- recipient_contact (guest contact) should be populated. We do not enforce
  -- a constraint here because drafts may have neither set.
  recipient_user_id     UUID                    REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_contact     JSONB                   NOT NULL DEFAULT '{}'::jsonb,
  -- Recommended shape: { name, email?, phone?, company? }

  share_channel         public.pitch_share_channel,  -- set at send time

  personal_note         TEXT,                                    -- shown above grid on landing
  brief                 JSONB                   NOT NULL DEFAULT '{}'::jsonb,
  -- Recommended shape: { event_date?, event_location?, rate_hint?, event_type_id? }

  expires_at            TIMESTAMPTZ,                             -- NULL = no expiry
  internal_notes        TEXT,                                    -- admin-only, never rendered publicly

  -- View tracking
  first_viewed_at       TIMESTAMPTZ,
  last_viewed_at        TIMESTAMPTZ,
  view_count            INT                     NOT NULL DEFAULT 0,

  -- Conversion lineage
  converted_inquiry_id  UUID                    REFERENCES public.inquiries(id) ON DELETE SET NULL,
  converted_at          TIMESTAMPTZ,
  declined_at           TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,

  created_at            TIMESTAMPTZ             NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ             NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pitches IS
  'Admin-curated talent suggestion shared with a recipient via token-gated public link. Converts into an inquiry on accept. Source of truth: docs/plans/pitch-feature-execution-plan-2026-05-07.md.';

COMMENT ON COLUMN public.pitches.share_token_id IS
  'Encoded as the revisionId claim in the share JWT. Rotate to revoke all outstanding tokens for this pitch.';

CREATE INDEX IF NOT EXISTS pitches_tenant_status_idx
  ON public.pitches (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS pitches_recipient_user_idx
  ON public.pitches (recipient_user_id)
  WHERE recipient_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pitches_share_token_idx
  ON public.pitches (share_token_id);

CREATE INDEX IF NOT EXISTS pitches_converted_inquiry_idx
  ON public.pitches (converted_inquiry_id)
  WHERE converted_inquiry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pitches_parent_idx
  ON public.pitches (parent_pitch_id)
  WHERE parent_pitch_id IS NOT NULL;

-- updated_at touch trigger (engine writes set updated_at explicitly, but
-- this protects against ad-hoc updates and admin SQL).
CREATE OR REPLACE FUNCTION public.pitches_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pitches_touch_updated_at ON public.pitches;
CREATE TRIGGER trg_pitches_touch_updated_at
  BEFORE UPDATE ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.pitches_touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. pitch_talents — ordered roster per pitch
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pitch_talents (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID         NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  pitch_id                UUID         NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  talent_profile_id       UUID         NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  position                INT          NOT NULL DEFAULT 0,
  admin_note              TEXT,                                   -- shown under card publicly
  removed_by_client_at    TIMESTAMPTZ,                            -- recipient pruned this talent on the landing
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (pitch_id, talent_profile_id)
);

CREATE INDEX IF NOT EXISTS pitch_talents_pitch_position_idx
  ON public.pitch_talents (pitch_id, position);

CREATE INDEX IF NOT EXISTS pitch_talents_talent_idx
  ON public.pitch_talents (talent_profile_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. pitch_attachments — images / pdfs at pitch- or talent-level
-- ════════════════════════════════════════════════════════════════════════════
--
-- Mirrors the inquiry_attachments pattern (own table with storage_path)
-- rather than reusing media_assets, because media_assets is owned by a
-- talent_profile and pitch-level attachments don't belong to any talent.

CREATE TABLE IF NOT EXISTS public.pitch_attachments (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID         NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  pitch_id            UUID         NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  -- NULL talent_profile_id = pitch-level attachment (lookbook, brief);
  -- non-NULL = scoped to a single talent's card.
  talent_profile_id   UUID         REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  uploaded_by         UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_path        TEXT         NOT NULL,
  filename            TEXT         NOT NULL,
  mime_type           TEXT,
  byte_size           BIGINT,
  kind                TEXT         NOT NULL DEFAULT 'other'
                                     CHECK (kind IN ('image', 'pdf', 'other')),
  position            INT          NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pitch_attachments_pitch_idx
  ON public.pitch_attachments (pitch_id, position)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS pitch_attachments_talent_idx
  ON public.pitch_attachments (talent_profile_id)
  WHERE talent_profile_id IS NOT NULL AND deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. pitch_events — append-only timeline
-- ════════════════════════════════════════════════════════════════════════════
--
-- Mirrors inquiry_events. tenant_id is denormalised onto the row so RLS
-- can use the standard public.is_staff_of_tenant() helper without joining
-- through pitches.

CREATE TABLE IF NOT EXISTS public.pitch_events (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  pitch_id        UUID         NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  event_type      TEXT         NOT NULL CHECK (char_length(event_type) > 0),
  -- NULL actor_user_id = anonymous viewer (guest opening the share link) or system event
  actor_user_id   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role      TEXT         NOT NULL DEFAULT 'system'
                                  CHECK (actor_role IN ('staff', 'recipient', 'guest', 'system')),
  payload         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pitch_events_pitch_idx
  ON public.pitch_events (pitch_id, created_at);

CREATE INDEX IF NOT EXISTS pitch_events_tenant_idx
  ON public.pitch_events (tenant_id, created_at DESC);

COMMENT ON TABLE public.pitch_events IS
  'Append-only timeline of pitch state changes. Event types: created, sent, viewed, talent_removed, declined, converted, cancelled, expired, pitch_curated_override.';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. inquiries.source_pitch_id — lineage from inquiry back to pitch
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS source_pitch_id UUID REFERENCES public.pitches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inquiries_source_pitch_idx
  ON public.inquiries (source_pitch_id)
  WHERE source_pitch_id IS NOT NULL;

COMMENT ON COLUMN public.inquiries.source_pitch_id IS
  'Set when the inquiry was created via convertPitchToInquiry. Used for lineage UI ("Originated from a pitch") and conversion-rate metrics.';

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RLS — staff-of-tenant get full access; recipients get read-only on
--    their own pitches; everything public goes through service-role with
--    JWT claim verification (not via RLS).
-- ════════════════════════════════════════════════════════════════════════════

-- ── pitches ─────────────────────────────────────────────────────────────────
ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitches_staff_all ON public.pitches;
CREATE POLICY pitches_staff_all ON public.pitches
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- A signed-in recipient can read pitches addressed to them. We do not
-- expose drafts (which haven't been sent yet) and we honour cancellation.
DROP POLICY IF EXISTS pitches_recipient_select ON public.pitches;
CREATE POLICY pitches_recipient_select ON public.pitches
  FOR SELECT
  USING (
    recipient_user_id = auth.uid()
    AND status NOT IN ('draft', 'cancelled')
  );

-- ── pitch_talents ───────────────────────────────────────────────────────────
ALTER TABLE public.pitch_talents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_talents_staff_all ON public.pitch_talents;
CREATE POLICY pitch_talents_staff_all ON public.pitch_talents
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS pitch_talents_recipient_select ON public.pitch_talents;
CREATE POLICY pitch_talents_recipient_select ON public.pitch_talents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pitches p
      WHERE p.id = pitch_talents.pitch_id
        AND p.recipient_user_id = auth.uid()
        AND p.status NOT IN ('draft', 'cancelled')
    )
  );

-- ── pitch_attachments ───────────────────────────────────────────────────────
ALTER TABLE public.pitch_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_attachments_staff_all ON public.pitch_attachments;
CREATE POLICY pitch_attachments_staff_all ON public.pitch_attachments
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS pitch_attachments_recipient_select ON public.pitch_attachments;
CREATE POLICY pitch_attachments_recipient_select ON public.pitch_attachments
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.pitches p
      WHERE p.id = pitch_attachments.pitch_id
        AND p.recipient_user_id = auth.uid()
        AND p.status NOT IN ('draft', 'cancelled')
    )
  );

-- ── pitch_events ────────────────────────────────────────────────────────────
ALTER TABLE public.pitch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_events_staff_all ON public.pitch_events;
CREATE POLICY pitch_events_staff_all ON public.pitch_events
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- Recipients do NOT need to read pitch_events directly — the timeline is
-- staff-facing. Public landing reads happen via service role.

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Storage bucket for attachment binaries
-- ════════════════════════════════════════════════════════════════════════════
--
-- Path convention: {tenant_id}/{pitch_id}/{uuid}-{filename}
-- Public landing reads happen through signed URLs minted server-side after
-- token verification — there is no "anyone with a pitch token" RLS path
-- on storage. Direct authenticated reads are staff-only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pitch-files',
  'pitch-files',
  FALSE,
  52428800,                      -- 50 MB cap per file (lighter than inquiry-files)
  NULL                           -- accept all types; UI guards extension
)
ON CONFLICT (id) DO NOTHING;

-- Helper: extract tenant_id (first path segment).
CREATE OR REPLACE FUNCTION public._pitch_files_tenant_from_path(name TEXT)
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(name, '/', 1), '')::UUID
$$;

GRANT EXECUTE ON FUNCTION public._pitch_files_tenant_from_path(TEXT) TO authenticated;

DROP POLICY IF EXISTS pitch_files_staff_select ON storage.objects;
CREATE POLICY pitch_files_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pitch-files'
    AND public.is_staff_of_tenant(public._pitch_files_tenant_from_path(name))
  );

DROP POLICY IF EXISTS pitch_files_staff_insert ON storage.objects;
CREATE POLICY pitch_files_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pitch-files'
    AND public.is_staff_of_tenant(public._pitch_files_tenant_from_path(name))
  );

DROP POLICY IF EXISTS pitch_files_staff_update ON storage.objects;
CREATE POLICY pitch_files_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pitch-files'
    AND public.is_staff_of_tenant(public._pitch_files_tenant_from_path(name))
  )
  WITH CHECK (
    bucket_id = 'pitch-files'
    AND public.is_staff_of_tenant(public._pitch_files_tenant_from_path(name))
  );

DROP POLICY IF EXISTS pitch_files_staff_delete ON storage.objects;
CREATE POLICY pitch_files_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'pitch-files'
    AND public.is_staff_of_tenant(public._pitch_files_tenant_from_path(name))
  );

COMMIT;
