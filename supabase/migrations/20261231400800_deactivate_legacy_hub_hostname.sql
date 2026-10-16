-- Deactivate the legacy seeded hub hostname pitiriasisversicolor.com.
-- Earlier migrations (20260605100000, 20260625110000) seeded it as the hub primary;
-- on a rebuilt staging DB it shadowed hub.staging.tulala.digital. Idempotent,
-- touches only that hostname, no-op where the row does not exist (prod).
update public.agency_domains
   set is_primary = false,
       status = 'suspended'
 where hostname = 'pitiriasisversicolor.com'
   and (is_primary = true or status <> 'suspended');
