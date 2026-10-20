-- 20261231419000_docs_host_agency_domains.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- For the Production Migration Manager (TUL-1393, release notes program WIKI-34).
-- Version sits above the newest held/applied file on purpose (an out-of-order
-- version breaks db push); renumber if something newer landed.
--
-- WHAT: register docs.tulala.digital as a platform host, same shape as the
-- qa-1..6 seed (20261231310000_qa_host_pool.sql). The proxy redirects the host
-- to tulala.digital/help before host resolution, so the redirect does NOT depend
-- on this row; the row keeps the host registered (no "Host not registered" 404
-- if the redirect is ever removed, for example when developer docs replace it).
-- The label "docs" is already reserved by platform_subdomain_label_taken, so no
-- talent site can claim it.
--
-- Idempotent. VERIFY after apply:
--   select hostname, kind, status from public.agency_domains where hostname = 'docs.tulala.digital';

insert into public.agency_domains
  (tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at)
values
  (null, 'docs.tulala.digital', 'app', false, 'active', now(), now())
on conflict (hostname) do nothing;
