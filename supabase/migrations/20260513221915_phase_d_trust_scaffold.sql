-- Phase D Trust scaffold — Stripe Identity-driven client verification.
-- Foundational schema only. UI + flow shipped in future session.
-- See memory: project_client_trust_badges.md

BEGIN;

-- Verification status on client_profiles. Drives the 4-tier trust
-- ladder: Basic / Verified / Silver / Gold. Higher tiers unlock
-- contact-controls (per project_client_trust_badges.md §3).
alter table public.client_profiles
  add column if not exists verification_status text not null default 'none'
    check (verification_status in ('none','submitted','verified','rejected','expired')),
  add column if not exists stripe_identity_session_id text,
  add column if not exists verified_at timestamptz,
  add column if not exists trust_tier text not null default 'basic'
    check (trust_tier in ('basic','verified','silver','gold'));

create index if not exists client_profiles_trust_tier_idx
  on public.client_profiles (trust_tier);

comment on column public.client_profiles.trust_tier is
  'Derived trust tier (basic→verified→silver→gold). Driven by verification_status + funded_account signals. See memory: project_client_trust_badges.md';

COMMIT;
