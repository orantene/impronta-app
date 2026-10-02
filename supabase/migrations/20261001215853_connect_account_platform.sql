-- Which Stripe PLATFORM account ('us' | 'mx') a connected account belongs to.
-- Additive, default 'us' (every existing account is on the US platform).
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_platform text NOT NULL DEFAULT 'us'
    CHECK (stripe_account_platform IN ('us','mx'));
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS stripe_account_platform text NOT NULL DEFAULT 'us'
    CHECK (stripe_account_platform IN ('us','mx'));

COMMENT ON COLUMN public.talent_profiles.stripe_account_platform IS
  'Stripe platform account owning stripe_account_id: us (default) or mx (Stripe Mexico).';
COMMENT ON COLUMN public.agencies.stripe_account_platform IS
  'Stripe platform account owning stripe_account_id: us (default) or mx (Stripe Mexico).';
