-- ============================================================================
-- T1.2b — reconcile_field_mirror_drift RPC (TRANSITIONAL drift-detection)
--
-- Returns the per-(talent, key) A↔B drift rows for the 17 bridged field keys,
-- classified a_only / b_only / disagree, with System A's typed columns and
-- System B's jsonb scalar so the TS reconcile sweep can re-apply the proven
-- legacy-mirror helpers (no slug↔label matching is done in SQL here — only
-- presence + light normalization, identical to web/scripts/field-parity-
-- harness.mjs).
--
-- Called by web/src/app/api/cron/reconcile-field-mirror via the SERVICE-ROLE
-- client (one round-trip; no Management-API token needed at runtime).
--
-- SECURITY DEFINER so the service-role cron sees the full cross-tenant set in
-- ONE query. Read-only: the function performs NO writes. The bridged key-set
-- is hard-coded here to mirror legacy-mirror.ts NEW_TO_OLD_KEY; the TS side
-- passes no key arguments so the two can't silently diverge on the key-set.
--
-- TRANSITIONAL — Phase 3 drops System A; this function + its cron become a
-- no-op and should be DROPped alongside legacy-mirror.ts.
-- ============================================================================

create or replace function public.reconcile_field_mirror_drift()
returns table (
  a_key text,
  b_key text,
  talent_profile_id uuid,
  a_only boolean,
  b_only boolean,
  disagree boolean,
  a_value_text text,
  a_value_number numeric,
  a_value_boolean boolean,
  a_value_date date,
  b_value_text text
)
language sql
stable
security definer
set search_path = public
as $$
  with
  pairs(b_key, a_key) as (
    values
      ('physical.body_type',                'body_type'),
      ('physical.dress_size',               'clothing_size'),
      ('identity.dob',                      'date_of_birth'),
      ('physical.eye_color',                'eye_color'),
      ('physical.hair_color',               'hair_color'),
      ('physical.hair_length',              'hair_length'),
      ('physical.height_cm',                'height_cm'),
      ('physical.shoe_size_eu',             'shoe_size'),
      ('experience.years_total',            'years_experience'),
      ('experience.level',                  'experience_level'),
      ('experience.notable_work',           'notable_work'),
      ('experience.professional_highlights','professional_highlights'),
      ('availability.status',               'availability_status'),
      ('availability.available_for',        'available_for'),
      ('travel.willing',                    'willing_to_travel'),
      ('travel.scope',                      'travel_scope'),
      ('media.website_url',                 'website_url')
  ),
  adefs as (
    select key as a_key, array_agg(id) as ids
    from public.field_definitions
    where key in (select a_key from pairs)
    group by key
  ),
  bdefs as (
    select field_key as b_key, array_agg(id) as ids
    from public.profile_field_definitions
    where field_key in (select b_key from pairs)
    group by field_key
  ),
  -- One A row per (talent, canonical key): keep the typed columns so the heal
  -- can rebuild the native scalar. Deterministically pick the first def-id's.
  aval as (
    select p.b_key as b_key, av.talent_profile_id,
           (array_agg(av.value_text    order by av.field_definition_id))[1] as a_value_text,
           (array_agg(av.value_number  order by av.field_definition_id))[1] as a_value_number,
           (array_agg(av.value_boolean order by av.field_definition_id))[1] as a_value_boolean,
           (array_agg(av.value_date    order by av.field_definition_id))[1] as a_value_date,
           (array_agg(
              coalesce(av.value_text, av.value_number::text, av.value_boolean::text, av.value_date::text)
              order by av.field_definition_id))[1] as a_raw
    from public.field_values av
    join pairs p on true
    join adefs ad on ad.a_key = p.a_key and av.field_definition_id = any (ad.ids)
    where coalesce(av.value_text, av.value_number::text, av.value_boolean::text, av.value_date::text) is not null
    group by p.b_key, av.talent_profile_id
  ),
  bval as (
    select p.b_key as b_key, bv.talent_profile_id,
           (array_agg((bv.value #>> '{}') order by bv.field_definition_id))[1] as b_raw
    from public.talent_profile_field_values bv
    join pairs p on true
    join bdefs bd on bd.b_key = p.b_key and bv.field_definition_id = any (bd.ids)
    where (bv.value #>> '{}') is not null
    group by p.b_key, bv.talent_profile_id
  ),
  j as (
    select
      coalesce(a.b_key, b.b_key) as b_key,
      coalesce(a.talent_profile_id, b.talent_profile_id) as talent_profile_id,
      a.a_value_text, a.a_value_number, a.a_value_boolean, a.a_value_date,
      b.b_raw as b_value_text,
      (a.b_key is not null and b.b_key is null) as a_only,
      (a.b_key is null and b.b_key is not null) as b_only,
      (a.b_key is not null and b.b_key is not null
        and nullif(btrim(regexp_replace(lower(btrim(a.a_raw)), '[-_/[:space:]]+', ' ', 'g')), '')
            is distinct from
            nullif(btrim(regexp_replace(lower(btrim(b.b_raw)), '[-_/[:space:]]+', ' ', 'g')), '')) as disagree
    from aval a
    full outer join bval b
      on a.b_key = b.b_key and a.talent_profile_id = b.talent_profile_id
  )
  select
    pr.a_key, j.b_key, j.talent_profile_id,
    j.a_only, j.b_only, j.disagree,
    j.a_value_text, j.a_value_number, j.a_value_boolean, j.a_value_date,
    j.b_value_text
  from j
  join pairs pr on pr.b_key = j.b_key
  where j.a_only or j.b_only or j.disagree
  order by j.b_key, j.talent_profile_id;
$$;

comment on function public.reconcile_field_mirror_drift() is
  'TRANSITIONAL (T1.2b) — read-only A<->B drift detection for the 17 bridged field keys. Returns per-(talent,key) drift rows for the reconcile-field-mirror cron. Drop at Phase 3 with legacy-mirror.ts.';

-- Service-role already bypasses RLS / grants; restrict the RPC to the service
-- role + the definer so anon/authenticated can't enumerate cross-tenant values.
revoke all on function public.reconcile_field_mirror_drift() from public;
revoke all on function public.reconcile_field_mirror_drift() from anon;
revoke all on function public.reconcile_field_mirror_drift() from authenticated;
grant execute on function public.reconcile_field_mirror_drift() to service_role;
