-- D0 (Discover-specific) — per-row owning-party freezing on inquiry_participants.
--
-- Foundation for cross-tenant inquiry routing. Today, every talent in an inquiry
-- shares the inquiry's tenant_id as their owning party (single-tenant case). For
-- Discover-originated inquiries (D5 in the rollout plan), each talent's owning
-- party is resolved at submit time based on agency exclusivity and frozen here,
-- so:
--   1. commission resolution (per booking row) stays coherent if exclusivity later changes,
--   2. multi-tenant thread fan-out routes each row to the right inbox,
--   3. lineup view shows the correct per-row owning party even months after submit.
--
-- Trigger defaults talent rows to ('workspace', tenant_id) — matches today's
-- single-tenant reality without requiring any engine code change. Discover-aware
-- submit paths override by passing explicit owning_party_type/id when inserting.
-- Non-talent rows (client, coordinator) remain NULL — owning_party is a
-- talent-row concept.
--
-- See:
--   - web/docs/discover-and-unified-inquiry-2026-05-14.md §3.2 (per-row routing)
--   - web/docs/discover-and-unified-inquiry-2026-05-14.md §6.2 (data model)
--   - project_discover_unified.md (memory pointer)

ALTER TABLE public.inquiry_participants
  ADD COLUMN IF NOT EXISTS owning_party_type TEXT
    CHECK (owning_party_type IN ('agency', 'workspace', 'talent')),
  ADD COLUMN IF NOT EXISTS owning_party_id UUID;

CREATE INDEX IF NOT EXISTS idx_inquiry_participants_owning_party
  ON public.inquiry_participants (owning_party_type, owning_party_id)
  WHERE owning_party_type IS NOT NULL;

-- Backfill existing talent rows: default to 'workspace' + tenant_id.
-- Idempotent — only touches rows where owning_party_type IS NULL.
UPDATE public.inquiry_participants
   SET owning_party_type = 'workspace',
       owning_party_id   = tenant_id
 WHERE role = 'talent'
   AND owning_party_type IS NULL;

-- Auto-default trigger. Fires on every INSERT into inquiry_participants. If the
-- row is role='talent' AND owning_party_type wasn't explicitly set, default it
-- to ('workspace', tenant_id). Discover-aware code that knows the talent has
-- a different owning party passes explicit values and bypasses this default.
CREATE OR REPLACE FUNCTION public.trg_inquiry_participants_default_owning_party()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'talent' AND NEW.owning_party_type IS NULL THEN
    NEW.owning_party_type := 'workspace';
    NEW.owning_party_id   := NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_participants_default_owning_party
  ON public.inquiry_participants;

CREATE TRIGGER trg_inquiry_participants_default_owning_party
  BEFORE INSERT ON public.inquiry_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_inquiry_participants_default_owning_party();

COMMENT ON COLUMN public.inquiry_participants.owning_party_type IS
  'Per-row owning party at submit time. One of: agency / workspace / talent. Set by Discover-aware submit paths to route per-talent fan-out; auto-defaulted to "workspace" + tenant_id by trigger for talent rows when not explicitly set. Non-talent rows (client, coordinator) remain NULL. Frozen at submit — does not drift if exclusivity later changes. See project_discover_unified.md §3.2.';

COMMENT ON COLUMN public.inquiry_participants.owning_party_id IS
  'UUID of the owning party. When type=agency or type=workspace, references agencies.id. When type=talent, references talent_profiles.id. Auto-set by trigger to tenant_id for talent rows when owning_party_type is null.';
