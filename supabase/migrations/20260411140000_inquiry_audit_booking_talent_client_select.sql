-- Inquiry-side commercial audit + client read access to booking_talent for visible bookings.

-- ---------------------------------------------------------------------------
-- inquiry_activity_log (mirrors booking_activity_log for lead-level events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inquiry_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inquiry_activity_log_inquiry
  ON public.inquiry_activity_log (inquiry_id, created_at DESC);
ALTER TABLE public.inquiry_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inquiry_activity_log_staff_all ON public.inquiry_activity_log;
CREATE POLICY inquiry_activity_log_staff_all ON public.inquiry_activity_log
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
-- ---------------------------------------------------------------------------
-- booking_talent: clients may read rows for bookings they can already see
-- (agency_bookings client SELECT policy is the source of truth)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS booking_talent_client_select ON public.booking_talent;
CREATE POLICY booking_talent_client_select ON public.booking_talent
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.agency_bookings b
      WHERE b.id = booking_talent.booking_id
        AND (
          (
            b.client_visible_at IS NOT NULL
            AND (
              b.client_user_id = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.client_account_contacts c
                WHERE c.id = b.client_contact_id
                  AND c.profile_user_id = auth.uid()
                  AND c.archived_at IS NULL
              )
            )
          )
          OR (
            b.source_inquiry_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.inquiries i
              WHERE i.id = b.source_inquiry_id
                AND i.client_user_id = auth.uid()
            )
          )
        )
    )
  );
