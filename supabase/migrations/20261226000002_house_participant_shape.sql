-- Menu Phase 1: shape constraints for role='house' participants.
-- Depends on 20261226000001 (enum value must already be committed).

BEGIN;

ALTER TABLE public.inquiry_participants
  DROP CONSTRAINT IF EXISTS inquiry_participants_house_shape;

ALTER TABLE public.inquiry_participants
  ADD CONSTRAINT inquiry_participants_house_shape
  CHECK (
    role <> 'house'
    OR (
      talent_profile_id IS NULL
      AND user_id IS NULL
      AND owning_party_id IS NOT NULL
      AND owning_party_type IN ('workspace', 'agency')
    )
  );

-- At most one active house participant per (inquiry, owning party).
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_participants_one_house_per_party
  ON public.inquiry_participants (inquiry_id, owning_party_id)
  WHERE role = 'house' AND status IN ('invited', 'active');

COMMENT ON CONSTRAINT inquiry_participants_house_shape ON public.inquiry_participants IS
  'House participants represent the workspace on a menu/house offer line: no talent, no user, owning_party required.';

COMMIT;
