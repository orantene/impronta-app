-- Observed 2026-09-10 ~15:09Z on the isolated branch, BEFORE commit-order-holds.ts existed.
-- Orders are PAID (pay in person, $0 or nothing owed up front) and the person's hold still
-- carries the fifteen-minute reservation TTL. load-busy stops counting it at expires_at and
-- cron/expire-calendar-holds deletes it; see 00-defect-hold-expires-after-payment.txt for the
-- public slots endpoint re-offering 15:00Z, 15:45Z and 16:30Z twenty minutes later.
select h.title, h.starts_at, h.ends_at, h.expires_at, h.hold_strength, h.inquiry_id,
       o.status as order_status, o.total_cents
  from talent_holds h
  join orders o on ('order:' || o.id || ':reserve') = h.operation_key
 where h.tenant_id = '33333333-3333-4333-8333-333333333333'
 order by h.created_at desc limit 5;
-- title            starts_at               expires_at                    order_status  total_cents
-- Couples massage  2026-09-11 15:00:00+00  2026-09-10 15:17:43.766334+00 paid          0
-- Couples therapist 2026-09-11 15:00:00+00 2026-09-10 15:17:43.766334+00 paid          0
-- Couples therapist 2026-09-10 18:45:00+00 2026-09-10 15:17:26.954743+00 paid          0
-- Couples massage  2026-09-10 18:45:00+00  2026-09-10 15:17:26.954743+00 paid          0
-- Gel manicure     2026-09-10 18:00:00+00  2026-09-10 15:16:42.854364+00 pending_payment 5000
