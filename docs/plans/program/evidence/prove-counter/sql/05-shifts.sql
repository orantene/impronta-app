-- The drawer. Every row below was opened or closed through the counter's own
-- Shifts screen; none was inserted. The chain shows each run closing the
-- shift it inherited (counted 100.00) and opening its own float (100.00).
SELECT id, status, opening_cash_cents, closing_cash_cents, opened_at, closed_at, opened_by, version
  FROM pos_shifts
 WHERE tenant_id = '33333333-3333-4333-8333-333333333333'
 ORDER BY opened_at;
-- [{"id":"6cb40a72-7755-4a77-affa-f6d1e870ba84","status":"closed","opening_cash_cents":10000,
--   "closing_cash_cents":10000,"opened_at":"2026-09-10 12:46:19.077+00",
--   "closed_at":"2026-09-10 15:15:31.302+00","opened_by":"33330001-0000-4000-8000-000000000001","version":2},
--   ^ the previous run's drawer, closed by this run's first local attempt
--  {"id":"796ee710-7343-4ebf-bf88-62caeb324122","status":"closed","opening_cash_cents":10000,
--   "closing_cash_cents":10000,"opened_at":"2026-09-10 15:15:50.493+00",
--   "closed_at":"2026-09-10 15:22:23.164+00","opened_by":"33330001-0000-4000-8000-000000000001","version":2},
--  {"id":"a0df8241-1208-4111-aaad-d212b262c595","status":"open","opening_cash_cents":10000,
--   "closing_cash_cents":null,"opened_at":"2026-09-10 15:22:42.049+00","closed_at":null,
--   "opened_by":"33330001-0000-4000-8000-000000000001","version":1}]
--   ^ opened by run 4 at 15:22:42, ten seconds before the proven sale was
--     started; it is the shift_id stamped on that sale's money row (04-journey-rows.sql).
