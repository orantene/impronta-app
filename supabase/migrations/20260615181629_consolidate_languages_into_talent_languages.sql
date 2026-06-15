-- Consolidate languages onto the canonical talent_languages table (2026-06-15).
--
-- Languages lived in TWO places: the canonical `talent_languages` table (rich:
-- proficiency, native, can_host/sell/translate/teach) — written by the roster
-- editor, read by the public profile (structured-first), the directory cards
-- (via the trigger-synced talent_profiles.languages cache), and the AI search
-- doc — AND a legacy `taxonomy_terms` mirror (term_type='language', 18 terms,
-- kind='language') assigned via talent_profile_taxonomy. The taxonomy path was
-- only a profile fallback + an internal directory-preview route.
--
-- Step 1: backfill talent_languages from the taxonomy assignments so no talent
--   loses language data (slug = ISO language_code; proficiency unknown in the
--   taxonomy path → 'conversational'). The cache trigger syncs
--   talent_profiles.languages automatically.
-- Step 2: drop the taxonomy language terms (cascades the talent_profile_taxonomy
--   assignments + agency_taxonomy_settings).
--
-- Code repointed in the same change: profile fallback removed, preview route now
-- reads the cache, and 'language' is no longer a creatable taxonomy term_type.
-- Idempotent: after the terms are gone, both steps are no-ops.

-- Step 1 — backfill
insert into public.talent_languages
  (talent_profile_id, tenant_id, language_code, language_name, speaking_level, is_native, can_host, can_sell, can_translate, can_teach, display_order)
select s.talent_profile_id, s.tenant_id, s.language_code, s.language_name,
       'conversational', false, false, false, false, false, s.display_order
from (
  select
    x.talent_profile_id,
    coalesce(
      (select tl.tenant_id from public.talent_languages tl where tl.talent_profile_id=x.talent_profile_id and tl.tenant_id is not null order by tl.created_at limit 1),
      (select r.tenant_id from public.agency_talent_roster r where r.talent_profile_id=x.talent_profile_id and r.status='active' limit 1)
    ) as tenant_id,
    t.slug as language_code,
    t.name_en as language_name,
    coalesce((select max(tl.display_order) from public.talent_languages tl where tl.talent_profile_id=x.talent_profile_id), -1)
      + row_number() over (partition by x.talent_profile_id order by t.name_en) as display_order
  from public.talent_profile_taxonomy x
  join public.taxonomy_terms t on t.id=x.taxonomy_term_id and t.term_type='language'
  where not exists (
    select 1 from public.talent_languages tl
    where tl.talent_profile_id=x.talent_profile_id and tl.language_code=t.slug
  )
) s
on conflict (talent_profile_id, language_code) do nothing;

-- Step 2 — remove the redundant taxonomy language system
delete from public.taxonomy_terms where term_type='language';
