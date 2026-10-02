-- Policy snapshot at booking: which published talent policy version the client
-- saw when an inquiry, offer, order or booking was created. Additive and
-- nullable: old rows and non-talent flows stay null. SET NULL on delete so a
-- cascade from talent_profiles never blocks.
ALTER TABLE public.inquiries       ADD COLUMN IF NOT EXISTS policy_version_id uuid NULL REFERENCES public.talent_policy_versions(id) ON DELETE SET NULL;
ALTER TABLE public.inquiry_offers  ADD COLUMN IF NOT EXISTS policy_version_id uuid NULL REFERENCES public.talent_policy_versions(id) ON DELETE SET NULL;
ALTER TABLE public.agency_bookings ADD COLUMN IF NOT EXISTS policy_version_id uuid NULL REFERENCES public.talent_policy_versions(id) ON DELETE SET NULL;
ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS policy_version_id uuid NULL REFERENCES public.talent_policy_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inquiries.policy_version_id IS 'talent_policy_versions.id in force when the inquiry was created (null when none).';
COMMENT ON COLUMN public.inquiry_offers.policy_version_id IS 'Policy version accepted with the offer.';
COMMENT ON COLUMN public.agency_bookings.policy_version_id IS 'Policy version accepted with the booking.';
COMMENT ON COLUMN public.orders.policy_version_id IS 'Policy version in force at checkout.';
