-- 2026-09-10 ~18:00Z. Run 11's "Create booking" on the fixture's accepted offer failed with
--   operator does not exist: uuid ~ unknown
-- and the operator read that sentence on /admin/work/6a5e9455-…. The live function body:
select md5(pg_get_functiondef(p.oid)) as live_md5,
       (pg_get_functiondef(p.oid) like '%uuid FK now%')    as is_000144_body,
       (pg_get_functiondef(p.oid) like '%[0-9a-fA-F]{8}%') as has_regex
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='bookings_write_order';
-- BEFORE: {"live_md5":"b98d2f5d02cc1644dea72b5f4c81a727","is_000144_body":false,"has_regex":true}
--   i.e. the 20261228000143 body, matching li.source_service_id (a uuid since 20261228000144) against a regex,
--   while schema_migrations listed both 20261228000143 and 20261228000144 as applied.
-- Applied supabase/migrations/20261231180621_reassert_bookings_write_order_uuid_body.sql to the branch through pg
-- (its own SQL in one transaction, then the schema_migrations row):
-- AFTER:  {"live_md5":"f83fabf8a0cfb833f91fd36ac885a419","is_000144_body":true,"has_regex":false}
-- Production (pluhdapdnuiulvxmyspd) was NOT read: its direct host does not resolve from this machine (IPv6 only)
-- and no pooled read-only string was at hand. The migration is idempotent and asserts the body, so applying it
-- there is safe; whether production carries the same drift is unknown.
