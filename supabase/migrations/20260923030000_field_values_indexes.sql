-- Performance indexes for the unified field-values system.
-- These were not present in the original migration; adding them now so
-- Discover-style facet queries (filter talents by `value @> '{...}'`) and
-- per-talent reads stay fast as the catalog grows beyond a few thousand
-- talents.

-- GIN index on the jsonb `value` column — enables fast containment
-- queries (`WHERE value @> '"brown"'::jsonb`) used by directory facets
-- when they cut over to the new system. Partial index on workflow_state
-- = 'live' so we don't pay storage for pending/rejected rows that no
-- user-facing surface reads.
CREATE INDEX IF NOT EXISTS talent_profile_field_values_value_gin
  ON public.talent_profile_field_values
  USING gin (value)
  WHERE workflow_state = 'live';

-- B-tree on (field_definition_id, value) for narrower facet predicates
-- like "find all talents whose eye_color = 'brown'". The unique
-- constraint on (talent_profile_id, field_definition_id) already covers
-- per-talent reads.
CREATE INDEX IF NOT EXISTS talent_profile_field_values_def_id_idx
  ON public.talent_profile_field_values (field_definition_id);

-- Covering index for tenant-scoped scans (admin lists, audits).
CREATE INDEX IF NOT EXISTS talent_profile_field_values_tenant_idx
  ON public.talent_profile_field_values (tenant_id, workflow_state);
