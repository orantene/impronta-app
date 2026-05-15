-- Audit/history table for talent_profile_field_values. Every INSERT,
-- UPDATE, and DELETE on the values table writes a row here capturing the
-- before + after state, the actor, and the timestamp.
--
-- Purpose:
--   - Compliance / "who edited this".
--   - Future "Undo" UX — show the last 5 changes per field.
--   - Debugging when a profile value mysteriously changes.
--
-- Insert-only — a trigger writes here; the table itself has no edit path.
-- Cleanup is by retention policy (out of scope for this migration).

CREATE TABLE IF NOT EXISTS public.talent_profile_field_value_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at      timestamptz NOT NULL DEFAULT now(),
  -- The mutation that fired the trigger.
  operation       text        NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),

  -- Identifies which value row was touched.
  talent_profile_id     uuid  NOT NULL,
  field_definition_id   uuid  NOT NULL,
  tenant_id             uuid  NOT NULL,

  -- Before / after snapshots of the columns we care about.
  -- For INSERT: before_* are NULL.
  -- For DELETE: after_*  are NULL.
  before_value             jsonb,
  after_value              jsonb,
  before_visibility_override text[],
  after_visibility_override  text[],
  before_workflow_state    text,
  after_workflow_state     text,

  -- Actor metadata pulled from NEW (or OLD on DELETE).
  actor_user_id    uuid,
  actor_role       text
);

CREATE INDEX IF NOT EXISTS tpfv_history_talent_idx
  ON public.talent_profile_field_value_history (talent_profile_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS tpfv_history_def_idx
  ON public.talent_profile_field_value_history (field_definition_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS tpfv_history_tenant_idx
  ON public.talent_profile_field_value_history (tenant_id, changed_at DESC);

-- RLS: same model as the values table. Staff of the tenant can read; no
-- writes ever happen via PostgREST (the trigger is the only writer).
ALTER TABLE public.talent_profile_field_value_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='talent_profile_field_value_history'
       AND policyname='tpfv_history_staff_read'
  ) THEN
    CREATE POLICY tpfv_history_staff_read
      ON public.talent_profile_field_value_history
      FOR SELECT
      USING (is_staff_of_tenant(tenant_id));
  END IF;
END $$;

-- Trigger function — captures before/after on every mutation.
CREATE OR REPLACE FUNCTION public.tpfv_record_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.talent_profile_field_value_history (
      operation, talent_profile_id, field_definition_id, tenant_id,
      before_value, after_value,
      before_visibility_override, after_visibility_override,
      before_workflow_state, after_workflow_state,
      actor_user_id, actor_role
    ) VALUES (
      'INSERT', NEW.talent_profile_id, NEW.field_definition_id, NEW.tenant_id,
      NULL, NEW.value,
      NULL, NEW.visibility_override,
      NULL, NEW.workflow_state,
      NEW.last_edited_by_user_id, NEW.last_edited_role
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only record when something semantically changed.
    IF OLD.value IS DISTINCT FROM NEW.value
       OR OLD.visibility_override IS DISTINCT FROM NEW.visibility_override
       OR OLD.workflow_state IS DISTINCT FROM NEW.workflow_state THEN
      INSERT INTO public.talent_profile_field_value_history (
        operation, talent_profile_id, field_definition_id, tenant_id,
        before_value, after_value,
        before_visibility_override, after_visibility_override,
        before_workflow_state, after_workflow_state,
        actor_user_id, actor_role
      ) VALUES (
        'UPDATE', NEW.talent_profile_id, NEW.field_definition_id, NEW.tenant_id,
        OLD.value, NEW.value,
        OLD.visibility_override, NEW.visibility_override,
        OLD.workflow_state, NEW.workflow_state,
        NEW.last_edited_by_user_id, NEW.last_edited_role
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.talent_profile_field_value_history (
      operation, talent_profile_id, field_definition_id, tenant_id,
      before_value, after_value,
      before_visibility_override, after_visibility_override,
      before_workflow_state, after_workflow_state,
      actor_user_id, actor_role
    ) VALUES (
      'DELETE', OLD.talent_profile_id, OLD.field_definition_id, OLD.tenant_id,
      OLD.value, NULL,
      OLD.visibility_override, NULL,
      OLD.workflow_state, NULL,
      OLD.last_edited_by_user_id, OLD.last_edited_role
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tpfv_history_trigger ON public.talent_profile_field_values;
CREATE TRIGGER tpfv_history_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON public.talent_profile_field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.tpfv_record_history();
