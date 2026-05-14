-- Inquiry Funnel — Step 0 — universal-connector schema
--
-- See: web/docs/inquiry-funnel-audit-2026-05-13.md §3 P0
--      web/docs/inquiry-funnel-execution-plan-2026-05-13.md Step 0
--
-- Inquiry is THE universal connection object on Tulala. Initiator can be
-- any role (client / admin / talent / hub / free_agent), not just client.
-- Today the schema conflates "the client party" with "who initiated" —
-- works for client→agency case, breaks for admin / talent / hub / free.
-- Adding explicit initiator fields:
--   • initiator_role  — enum ('client','admin','talent','hub','free_agent')
--   • initiator_user_id — auth.users
--
-- Both nullable for now (NOT NULL constraint comes in a follow-up after
-- every insert path is writing the new fields).
--
-- Backfill: hint from existing columns. For new inserts the engine will
-- always set both — backfill is a one-shot.

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS initiator_role text
    CHECK (initiator_role IS NULL OR initiator_role IN ('client','admin','talent','hub','free_agent')),
  ADD COLUMN IF NOT EXISTS initiator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inquiries.initiator_role IS
  'Role of the party who created this inquiry. universal-connector P0 (2026-05-13). client/admin/talent/hub/free_agent.';
COMMENT ON COLUMN public.inquiries.initiator_user_id IS
  'auth.users.id of the party who created this inquiry. May differ from client_user_id when an admin / talent / hub initiates on behalf of a client.';

CREATE INDEX IF NOT EXISTS inquiries_initiator_role_idx
  ON public.inquiries (tenant_id, initiator_role)
  WHERE initiator_role IS NOT NULL;

-- One-shot backfill for existing rows. Heuristic:
--   • source_channel='pitch'                → initiator_role='admin'  (pitch is admin-authored)
--   • source_page LIKE 'admin-%' or 'admin_%' → initiator_role='admin' (admin manual)
--   • client_user_id IS NOT NULL            → initiator_role='client'
--   • ELSE                                  → initiator_role='client' (conservative; matches legacy guest path)
--
-- initiator_user_id: COALESCE(client_user_id, assigned_staff_id, NULL).
UPDATE public.inquiries
  SET initiator_role = CASE
    WHEN source_channel = 'pitch'                                  THEN 'admin'
    WHEN source_page LIKE 'admin-%' OR source_page LIKE 'admin_%'  THEN 'admin'
    ELSE                                                                'client'
  END,
  initiator_user_id = COALESCE(client_user_id, assigned_staff_id)
  WHERE initiator_role IS NULL;

COMMIT;
