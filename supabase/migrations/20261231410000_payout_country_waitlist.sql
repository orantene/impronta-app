-- TUL-1052: waitlist for payout countries (and USDC) that are not live yet.
-- A talent taps "Notify me when it's available" on a coming-soon row; the
-- server action (service role) upserts one row per (talent, country).
-- country is an ISO-2 code or the literal 'USDC'.
-- RLS enabled with NO policies: only the service role can read or write.
-- Not applied: PM applies after merge (additive, new table, nothing reads it until the code ships).

CREATE TABLE IF NOT EXISTS public.payout_country_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id uuid NOT NULL,
  user_id uuid,
  country text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talent_profile_id, country)
);

ALTER TABLE public.payout_country_waitlist ENABLE ROW LEVEL SECURITY;
