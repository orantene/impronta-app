-- Backfill: every tenant that owns at least one agency_domains row must have
-- exactly one primary domain, so host/canonical resolution always has a stable
-- target. A prior gap left tenants whose only domain was added through the
-- platform-admin "Add domain" action without any primary (that path hardcoded
-- is_primary = false). The accompanying code fix (actionAddDomain) promotes a
-- domain to primary whenever the tenant has none; this migration repairs the
-- rows that already exist.
--
-- Selection: for each affected tenant, promote a single domain — preferring a
-- platform `.tulala.digital` subdomain, then an active row, then the oldest —
-- so the choice is deterministic. Idempotent: once a tenant has a primary it
-- no longer matches the CTE, so re-running is a no-op.
with needs_primary as (
  select tenant_id
  from public.agency_domains
  group by tenant_id
  having coalesce(bool_or(is_primary), false) = false
),
ranked as (
  select
    d.id,
    row_number() over (
      partition by d.tenant_id
      order by
        (d.hostname like '%.tulala.digital') desc,
        (d.status = 'active') desc,
        d.created_at asc,
        d.id asc
    ) as rn
  from public.agency_domains d
  join needs_primary n on n.tenant_id = d.tenant_id
)
update public.agency_domains ad
set is_primary = true
from ranked
where ad.id = ranked.id
  and ranked.rn = 1;
