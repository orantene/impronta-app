-- Allow relationship_type='aspiration' for talent_type taxonomy terms.
--
-- The "professional interests / abierto a desarrollarse en" feature (admin
-- admin-talent-skills.ts + talent-self-services.addAspirationAsTalent) writes
-- talent_profile_taxonomy rows with relationship_type='aspiration' against a
-- talent_type term. The validate_talent_profile_taxonomy_relationship trigger
-- had NO 'aspiration' case → it fell through to `ELSE FALSE` and rejected every
-- such write ("relationship_type=aspiration is not allowed for taxonomy_term
-- term_type=talent_type"). Result: the feature never worked (0 aspiration rows
-- had ever persisted in prod) and the editor surfaced "Request failed".
--
-- Aspirations ARE talent_type terms (types the person is open to developing in),
-- so allow exactly that pairing. Verbatim copy of the existing function with a
-- single added WHEN clause — every other relationship rule is unchanged.
CREATE OR REPLACE FUNCTION public.validate_talent_profile_taxonomy_relationship()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_term_type TEXT;
  v_allowed   BOOLEAN;
BEGIN
  SELECT term_type INTO v_term_type
    FROM public.taxonomy_terms
   WHERE id = NEW.taxonomy_term_id;

  IF v_term_type IS NULL THEN
    RAISE EXCEPTION 'taxonomy_term % has no term_type set', NEW.taxonomy_term_id;
  END IF;

  v_allowed := CASE NEW.relationship_type
    WHEN 'primary_role'   THEN v_term_type = 'talent_type'
    WHEN 'secondary_role' THEN v_term_type = 'talent_type'
    WHEN 'aspiration'     THEN v_term_type = 'talent_type'
    WHEN 'specialty'      THEN v_term_type IN ('specialty','talent_type')
    WHEN 'skill'          THEN v_term_type = 'skill'
    WHEN 'context'        THEN v_term_type = 'context'
    WHEN 'credential'     THEN v_term_type = 'credential'
    WHEN 'attribute'      THEN v_term_type IN ('attribute','language')
    ELSE FALSE
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION
      'relationship_type=% is not allowed for taxonomy_term term_type=% (term_id=%)',
      NEW.relationship_type, v_term_type, NEW.taxonomy_term_id;
  END IF;

  RETURN NEW;
END;
$function$;
