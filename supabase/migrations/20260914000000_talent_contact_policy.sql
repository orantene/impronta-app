-- Phase 2 — talent contact policy.
--
-- talent_profiles.contact_policy controls which client trust tiers
-- can initiate inbound contact with this talent.
-- Keys: "basic" | "verified" | "silver" | "gold" (all boolean).
-- Default: all tiers allowed (open).

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS contact_policy JSONB NOT NULL DEFAULT '{"basic":true,"verified":true,"silver":true,"gold":true}'::jsonb;

COMMENT ON COLUMN public.talent_profiles.contact_policy IS
  'Per-trust-tier contact gate. Each key is a ClientTrustLevel; true = allowed to initiate inbound contact.';
