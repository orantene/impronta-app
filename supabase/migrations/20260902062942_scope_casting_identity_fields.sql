-- Scope the two casting-identity fields, and stop making nationality searchable.
--
-- Closes the gap the 2026-09-01 engine audit found: the profile EDITOR scopes
-- fields by talent category through `parent_category_field_groups`, and the
-- `physical-casting` group (height, weight, bust/waist/hips, dress size, shoe
-- sizes, hair, eyes, skin tone…) is correctly limited to four categories. But
-- three fields carried directory surfaces with NO field group at all, so they
-- were universal by default:
--
--   identity.gender       filter + CARD + sidebar
--   identity.dob          filter + sidebar
--   identity.nationality  searchable
--
-- ── gender + dob ────────────────────────────────────────────────────────────
-- Both are genuine casting attributes: a casting brief specifies an age range
-- and often a gender, and that is the job. Neither has any bearing on booking a
-- plumber, a private chef, a driver or a wedding photographer, where they are
-- simply protected characteristics attached to a filter.
--
-- They go into a new `casting-identity` group scoped to the five categories
-- where casting is the actual transaction:
--
--   models · hosts-promo · performers · influencers-creators · sports-fitness
--
-- DELIBERATELY EXCLUDED, with the reasoning recorded so it is not re-litigated
-- from scratch: wellness-beauty and security-protection have a real
-- same-gender request pattern (a client booking a massage or close protection
-- may have a genuine comfort or safety preference). That is a BOOKING
-- PREFERENCE expressed at enquiry time, not a public directory facet, and no
-- tenant on the platform represents either category yet. When one does, model
-- it as a preference on the enquiry rather than by widening this group.
--
-- ── nationality ─────────────────────────────────────────────────────────────
-- Removed from search entirely. Nationality is a protected characteristic in
-- essentially every jurisdiction Tulala operates in, and the two legitimate
-- needs behind it are already served by their own fields: work authorisation
-- (`travel.work_authorization`, `logistics.workEligibility`) and language
-- (`talent_languages`). It REMAINS a profile field — agencies genuinely need it
-- for contracts and visas — it simply stops being a way to search people.
--
-- ── EFFECT TODAY ────────────────────────────────────────────────────────────
-- The gender/dob scoping changes NOTHING for any current tenant: every roster
-- on the platform is models/hosts-promo, both of which are in the group, so
-- both fields stay exactly as visible as they are now. It takes effect the day
-- a non-casting agency onboards. The nationality change is live immediately.
--
-- REVERSIBLE. To undo:
--   UPDATE public.profile_field_definitions SET field_group_id = NULL
--    WHERE field_key IN ('identity.gender','identity.dob');
--   UPDATE public.profile_field_definitions SET is_searchable = true
--    WHERE field_key = 'identity.nationality';
--   DELETE FROM public.profile_field_groups WHERE slug = 'casting-identity';

INSERT INTO public.profile_field_groups (slug, name_i18n, sort_order)
SELECT
  'casting-identity',
  '{"en":"Casting identity","es":"Identidad de casting"}'::jsonb,
  COALESCE((SELECT MAX(sort_order) FROM public.profile_field_groups), 0) + 10
WHERE NOT EXISTS (
  SELECT 1 FROM public.profile_field_groups WHERE slug = 'casting-identity'
);

UPDATE public.profile_field_definitions
   SET field_group_id = (
         SELECT id FROM public.profile_field_groups WHERE slug = 'casting-identity'
       ),
       updated_at = now()
 WHERE field_key IN ('identity.gender', 'identity.dob')
   AND field_group_id IS NULL;

INSERT INTO public.parent_category_field_groups (
  parent_category_id, field_group_id, is_default, weight,
  display_order, in_registration_wizard, in_profile_editor, completeness_weight
)
SELECT
  t.id,
  g.id,
  true,
  'light',
  20,
  true,
  true,
  1
FROM public.taxonomy_terms t
CROSS JOIN public.profile_field_groups g
WHERE g.slug = 'casting-identity'
  AND t.level = 1
  AND t.slug IN (
    'models', 'hosts-promo', 'performers', 'influencers-creators', 'sports-fitness'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.parent_category_field_groups m
     WHERE m.parent_category_id = t.id AND m.field_group_id = g.id
  );

UPDATE public.profile_field_definitions
   SET is_searchable = false,
       updated_at = now()
 WHERE field_key = 'identity.nationality'
   AND is_searchable IS TRUE;
