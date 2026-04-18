-- Final system lock: participant membership uniqueness.
--
-- Two additional integrity rules missing from 20260523000000:
--   1) At most one ACTIVE participant row per (inquiry_id, user_id, role).
--      This prevents duplicate user rows in the same role on the same inquiry
--      while allowing historical declined/removed rows to remain for audit
--      and allowing re-invite after a decline.
--   2) At most ONE active coordinator per inquiry. (The active-client
--      uniqueness is already handled by
--      `inquiry_participants_one_active_client` from the prior migration.)
--
-- Note the role-specific nulls: for role='talent' the `user_id` may be null
-- (talents keyed by `talent_profile_id`), so the (inquiry, user, role)
-- uniqueness is restricted to roles where user_id is required — the same
-- roles whose CHECK constraints from 20260523000000 mandate a user_id.
--
-- Idempotent: everything is CREATE UNIQUE INDEX IF NOT EXISTS.

BEGIN;

-- 1) One active row per (inquiry, user, role) for user-keyed roles.
-- Covers role ∈ ('client', 'coordinator'): these must have user_id (enforced
-- by the CHECK constraints in 20260523000000). This index also prevents
-- re-adding the same human as a second client/coordinator on the same
-- inquiry while leaving declined/removed history intact.
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_participants_active_user_role_unique
  ON public.inquiry_participants (inquiry_id, user_id, role)
  WHERE status = 'active' AND user_id IS NOT NULL;

-- 2) At most one active coordinator per inquiry.
--    The client equivalent already exists as
--    `inquiry_participants_one_active_client`.
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_participants_one_active_coordinator
  ON public.inquiry_participants (inquiry_id)
  WHERE role = 'coordinator' AND status = 'active';

-- 3) One active-role row per talent_profile per inquiry.
--    Mirrors rule (1) for talent-keyed rows. Prevents duplicate active
--    talent entries for the same talent_profile_id on the same inquiry.
--    Re-invite after decline/remove is still permitted because only the
--    'active' status is constrained.
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_participants_active_talent_unique
  ON public.inquiry_participants (inquiry_id, talent_profile_id)
  WHERE role = 'talent' AND status = 'active' AND talent_profile_id IS NOT NULL;

COMMIT;
