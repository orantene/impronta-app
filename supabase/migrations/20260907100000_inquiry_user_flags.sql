-- Phase 3.12 / Messages — per-user inquiry UX flags.
--
-- The prototype messaging shell tracks two pieces of per-user state that
-- aren't covered by inquiry_message_reads:
--   1. `pinned`           — caller has pinned this inquiry to the top of inbox.
--   2. `manually_unread`  — caller marked the inquiry as unread to bring it
--                            back into focus (overrides "everything is read").
--
-- We store one row per (tenant, inquiry, profile). Both flags default false.
-- Tenant-scoped + RLS so no cross-tenant access.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inquiry_user_flags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.agencies(id)   ON DELETE CASCADE,
  inquiry_id      UUID        NOT NULL REFERENCES public.inquiries(id)  ON DELETE CASCADE,
  profile_id      UUID        NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  pinned          BOOLEAN     NOT NULL DEFAULT FALSE,
  pinned_at       TIMESTAMPTZ,
  manually_unread BOOLEAN     NOT NULL DEFAULT FALSE,
  marked_unread_at TIMESTAMPTZ,
  archived        BOOLEAN     NOT NULL DEFAULT FALSE,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.inquiry_user_flags IS
  'Per-user inquiry UX flags (pinned / manually_unread / archived) used by the workspace Messages inbox. One row per (tenant, inquiry, profile).';

CREATE UNIQUE INDEX IF NOT EXISTS inquiry_user_flags_uniq
  ON public.inquiry_user_flags (tenant_id, inquiry_id, profile_id);

CREATE INDEX IF NOT EXISTS inquiry_user_flags_profile_pinned_idx
  ON public.inquiry_user_flags (tenant_id, profile_id)
  WHERE pinned = TRUE;

CREATE INDEX IF NOT EXISTS inquiry_user_flags_profile_unread_idx
  ON public.inquiry_user_flags (tenant_id, profile_id)
  WHERE manually_unread = TRUE;

CREATE INDEX IF NOT EXISTS inquiry_user_flags_profile_archived_idx
  ON public.inquiry_user_flags (tenant_id, profile_id)
  WHERE archived = TRUE;

ALTER TABLE public.inquiry_user_flags ENABLE ROW LEVEL SECURITY;

-- Self read/write — caller can only touch their own flags.
DROP POLICY IF EXISTS inquiry_user_flags_self ON public.inquiry_user_flags;
CREATE POLICY inquiry_user_flags_self ON public.inquiry_user_flags
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- Tenant staff can read all flags (for cross-staff debugging / coordination
-- views). Writes still restricted to self via the policy above + check.
DROP POLICY IF EXISTS inquiry_user_flags_staff_read ON public.inquiry_user_flags;
CREATE POLICY inquiry_user_flags_staff_read ON public.inquiry_user_flags
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

-- Touch updated_at on every change.
CREATE OR REPLACE FUNCTION public.inquiry_user_flags_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_user_flags_touch_updated_at ON public.inquiry_user_flags;
CREATE TRIGGER trg_inquiry_user_flags_touch_updated_at
  BEFORE UPDATE ON public.inquiry_user_flags
  FOR EACH ROW EXECUTE FUNCTION public.inquiry_user_flags_touch_updated_at();

-- ─── Helper RPCs ─────────────────────────────────────────────────────────────
--
-- These are the only entry points used by the app for toggling flags.
-- Centralising lets us:
--   • Take care of upsert + tenant resolution + auth.uid() correctly in one place.
--   • Add audit hooks later without changing callers.
--   • Skip bouncing through the REST endpoint twice (toggle = read + write).

-- toggle_inquiry_pin: flip the pin flag for caller × inquiry. Returns new state.
CREATE OR REPLACE FUNCTION public.toggle_inquiry_pin(
  p_inquiry_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id   UUID := auth.uid();
  v_new       BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'inquiry not found';
  END IF;

  IF NOT public.is_staff_of_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  INSERT INTO public.inquiry_user_flags (tenant_id, inquiry_id, profile_id, pinned, pinned_at)
  VALUES (v_tenant_id, p_inquiry_id, v_user_id, TRUE, now())
  ON CONFLICT (tenant_id, inquiry_id, profile_id) DO UPDATE
    SET pinned    = NOT public.inquiry_user_flags.pinned,
        pinned_at = CASE WHEN NOT public.inquiry_user_flags.pinned THEN now() ELSE NULL END
    RETURNING pinned INTO v_new;

  -- ON CONFLICT path returns nothing if the INSERT branch fired, so re-read.
  IF v_new IS NULL THEN
    SELECT pinned INTO v_new
      FROM public.inquiry_user_flags
      WHERE tenant_id = v_tenant_id
        AND inquiry_id = p_inquiry_id
        AND profile_id = v_user_id;
  END IF;

  RETURN COALESCE(v_new, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_inquiry_pin(UUID) TO authenticated;

-- toggle_inquiry_manual_unread: flip the manual-unread flag.
CREATE OR REPLACE FUNCTION public.toggle_inquiry_manual_unread(
  p_inquiry_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id   UUID := auth.uid();
  v_new       BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'inquiry not found';
  END IF;

  IF NOT public.is_staff_of_tenant(v_tenant_id) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  INSERT INTO public.inquiry_user_flags (tenant_id, inquiry_id, profile_id, manually_unread, marked_unread_at)
  VALUES (v_tenant_id, p_inquiry_id, v_user_id, TRUE, now())
  ON CONFLICT (tenant_id, inquiry_id, profile_id) DO UPDATE
    SET manually_unread = NOT public.inquiry_user_flags.manually_unread,
        marked_unread_at = CASE WHEN NOT public.inquiry_user_flags.manually_unread THEN now() ELSE NULL END
    RETURNING manually_unread INTO v_new;

  IF v_new IS NULL THEN
    SELECT manually_unread INTO v_new
      FROM public.inquiry_user_flags
      WHERE tenant_id = v_tenant_id
        AND inquiry_id = p_inquiry_id
        AND profile_id = v_user_id;
  END IF;

  RETURN COALESCE(v_new, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_inquiry_manual_unread(UUID) TO authenticated;

-- archive_inquiries: bulk-archive a set of inquiries for caller.
-- Used by the Messages bulk action bar.
CREATE OR REPLACE FUNCTION public.archive_inquiries_for_user(
  p_inquiry_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_count    INTEGER := 0;
  v_inquiry  RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOR v_inquiry IN
    SELECT id, tenant_id FROM public.inquiries WHERE id = ANY(p_inquiry_ids)
  LOOP
    IF NOT public.is_staff_of_tenant(v_inquiry.tenant_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.inquiry_user_flags (tenant_id, inquiry_id, profile_id, archived, archived_at)
    VALUES (v_inquiry.tenant_id, v_inquiry.id, v_user_id, TRUE, now())
    ON CONFLICT (tenant_id, inquiry_id, profile_id) DO UPDATE
      SET archived    = TRUE,
          archived_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_inquiries_for_user(UUID[]) TO authenticated;

COMMIT;
