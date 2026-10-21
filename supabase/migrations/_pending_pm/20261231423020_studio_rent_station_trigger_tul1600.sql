-- TUL-1600 · A renting member's NEW offerings hold the station too. HELD in _pending_pm. Additive: one function and one
-- trigger. A NEW migration because 20261231420700 is already on staging; depends on it (studio_rent_plans.station_resource_id).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS talent_offerings_hold_rent_station ON public.talent_offerings;
--   DROP FUNCTION IF EXISTS public.talent_offerings_hold_rent_station();

BEGIN;

CREATE OR REPLACE FUNCTION public.talent_offerings_hold_rent_station()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station uuid;
  v_ids     jsonb;
BEGIN
  SELECT p.station_resource_id INTO v_station
    FROM public.studio_rent_plans p
   WHERE p.tenant_id = NEW.tenant_id
     AND p.talent_profile_id = NEW.talent_profile_id
     AND p.status IN ('active', 'paused')
     AND p.station_resource_id IS NOT NULL
   LIMIT 1;
  IF v_station IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = v_station AND s.tenant_id = NEW.tenant_id) THEN
    RETURN NEW;
  END IF;
  v_ids := COALESCE(NEW.attributes -> 'resourceSet' -> 'spaceIds', '[]'::jsonb);
  IF jsonb_typeof(v_ids) <> 'array' THEN
    v_ids := '[]'::jsonb;
  END IF;
  IF NOT (v_ids @> to_jsonb(v_station::text)) THEN
    v_ids := v_ids || to_jsonb(v_station::text);
  END IF;
  NEW.attributes := jsonb_set(
    COALESCE(NEW.attributes, '{}'::jsonb),
    '{resourceSet}',
    COALESCE(NEW.attributes -> 'resourceSet', '{}'::jsonb) || jsonb_build_object('spaceIds', v_ids),
    true
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.talent_offerings_hold_rent_station() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS talent_offerings_hold_rent_station ON public.talent_offerings;
CREATE TRIGGER talent_offerings_hold_rent_station
  BEFORE INSERT ON public.talent_offerings
  FOR EACH ROW EXECUTE FUNCTION public.talent_offerings_hold_rent_station();

COMMIT;
