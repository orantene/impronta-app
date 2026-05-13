-- Backfill default `inquiry_requirement_groups` for legacy inquiries.
--
-- Context: Wave 3 (commit 25621227 on phase-1) made `submitInquiry` insert a
-- default `inquiry_requirement_groups` row at creation time so the M5.6
-- trigger `trg_inquiry_participants_default_requirement_group` can fill
-- `inquiry_participants.requirement_group_id` automatically.  That fixed
-- NEW inquiries — but every inquiry submitted before the deploy still has
-- zero requirement-group rows, so admin "Add talent" on those still trips
-- the NOT NULL constraint:
--
--   null value in column "requirement_group_id" of relation
--   "inquiry_participants" violates not-null constraint
--
-- This migration inserts a single default group per legacy inquiry that
-- lacks any.  Role 'talent', quantity_required = 1 (admin can edit later),
-- sort_order = 0.  Idempotent: the WHERE NOT EXISTS guard means re-running
-- this migration on a clean DB is a no-op.

BEGIN;

INSERT INTO public.inquiry_requirement_groups (
  inquiry_id,
  tenant_id,
  role_key,
  quantity_required,
  sort_order
)
SELECT
  i.id,
  i.tenant_id,
  'talent',
  1,
  0
FROM public.inquiries i
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inquiry_requirement_groups rg
  WHERE rg.inquiry_id = i.id
);

COMMIT;
