-- Invalidate talent_embeddings when custom field values change or AI visibility toggles on definitions.

BEGIN;

CREATE OR REPLACE FUNCTION public.invalidate_talent_embedding_on_field_values_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
BEGIN
  tid := COALESCE(NEW.talent_profile_id, OLD.talent_profile_id);
  IF tid IS NOT NULL THEN
    DELETE FROM public.talent_embeddings WHERE talent_profile_id = tid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_field_values_invalidate_embedding ON public.field_values;
CREATE TRIGGER trg_field_values_invalidate_embedding
  AFTER INSERT OR UPDATE OR DELETE ON public.field_values
  FOR EACH ROW
  EXECUTE PROCEDURE public.invalidate_talent_embedding_on_field_values_change();

CREATE OR REPLACE FUNCTION public.invalidate_talent_embeddings_for_field_definition_ai_visible()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.ai_visible IS NOT DISTINCT FROM NEW.ai_visible THEN
    RETURN NEW;
  END IF;
  DELETE FROM public.talent_embeddings te
  USING public.field_values fv
  WHERE fv.field_definition_id = NEW.id
    AND fv.talent_profile_id = te.talent_profile_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_field_definitions_ai_visible_invalidate_embeddings ON public.field_definitions;
CREATE TRIGGER trg_field_definitions_ai_visible_invalidate_embeddings
  AFTER UPDATE OF ai_visible ON public.field_definitions
  FOR EACH ROW
  EXECUTE PROCEDURE public.invalidate_talent_embeddings_for_field_definition_ai_visible();

COMMENT ON FUNCTION public.invalidate_talent_embedding_on_field_values_change IS
  'Removes talent_embeddings when field_values change; AI document worker rebuilds vectors.';

COMMIT;
