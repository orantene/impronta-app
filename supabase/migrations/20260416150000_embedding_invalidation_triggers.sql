-- Phase 9: refresh triggers — drop stale ANN rows when source data changes so the embed worker can re-upsert.

BEGIN;

CREATE OR REPLACE FUNCTION public.invalidate_talent_embedding_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.ai_search_document IS NOT DISTINCT FROM NEW.ai_search_document
       AND OLD.workflow_status IS NOT DISTINCT FROM NEW.workflow_status
       AND OLD.visibility IS NOT DISTINCT FROM NEW.visibility
       AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
    THEN
      RETURN NEW;
    END IF;
  END IF;

  DELETE FROM public.talent_embeddings WHERE talent_profile_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_profiles_invalidate_embedding ON public.talent_profiles;
CREATE TRIGGER trg_talent_profiles_invalidate_embedding
  AFTER INSERT OR UPDATE ON public.talent_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.invalidate_talent_embedding_on_profile_change();

CREATE OR REPLACE FUNCTION public.invalidate_talent_embedding_on_taxonomy_change()
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

DROP TRIGGER IF EXISTS trg_talent_profile_taxonomy_invalidate_embedding ON public.talent_profile_taxonomy;
CREATE TRIGGER trg_talent_profile_taxonomy_invalidate_embedding
  AFTER INSERT OR UPDATE OR DELETE ON public.talent_profile_taxonomy
  FOR EACH ROW
  EXECUTE PROCEDURE public.invalidate_talent_embedding_on_taxonomy_change();

COMMENT ON FUNCTION public.invalidate_talent_embedding_on_profile_change IS
  'Removes talent_embeddings when ai_search_document, workflow, visibility, or delete state changes; worker repopulates.';

COMMENT ON FUNCTION public.invalidate_talent_embedding_on_taxonomy_change IS
  'Removes talent_embeddings when taxonomy assignments change; worker repopulates.';

COMMIT;
