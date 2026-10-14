-- TUL-529 / GRK-018: Sofía Rinaldi (TAL-93105) Spanish copy uses Mexican tú.
-- Live bio + one offering description mixed vos ("buscás", "llevás", "contame").
-- Builder did NOT run db:push; PM applies before Live QA.

-- Offering description: te llevás → te llevas
UPDATE public.talent_offerings o
SET
  description = replace(o.description, 'te llevás', 'te llevas'),
  description_i18n = CASE
    WHEN o.description_i18n ? 'es' THEN
      jsonb_set(
        o.description_i18n,
        '{es}',
        to_jsonb(replace(o.description_i18n->>'es', 'te llevás', 'te llevas'))
      )
    ELSE o.description_i18n
  END,
  updated_at = now()
FROM public.talent_profiles tp
WHERE tp.id = o.talent_profile_id
  AND tp.profile_code = 'TAL-93105'
  AND (
    o.description ILIKE '%llevás%'
    OR coalesce(o.description_i18n->>'es', '') ILIKE '%llevás%'
  );

-- Bios field: buscás → buscas, llevás → llevas, contame → cuéntame
-- Avoid JOIN ... ON v.* in FROM (Postgres rejects UPDATE target refs there).
UPDATE public.talent_profile_field_values v
SET
  value = (
    SELECT coalesce(
      jsonb_agg(
        CASE
          WHEN elem->>'locale' = 'es' AND elem ? 'text' THEN
            jsonb_set(
              elem,
              '{text}',
              to_jsonb(
                replace(
                  replace(
                    replace(elem->>'text', 'buscás', 'buscas'),
                    'llevás',
                    'llevas'
                  ),
                  'contame',
                  'cuéntame'
                )
              )
            )
          ELSE elem
        END
      ),
      v.value
    )
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.value) = 'array' THEN v.value ELSE '[]'::jsonb END
    ) AS elem
  ),
  updated_at = now()
WHERE v.talent_profile_id = (
    SELECT tp.id FROM public.talent_profiles tp WHERE tp.profile_code = 'TAL-93105'
  )
  AND v.field_definition_id = (
    SELECT d.id FROM public.profile_field_definitions d WHERE d.field_key = 'bios'
  )
  AND v.value::text ILIKE ANY (ARRAY['%buscás%', '%llevás%', '%contame%']);
