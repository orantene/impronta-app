-- 2026-09-10 ~14:55Z, qa-journeys (fxlankepwnvelxjrahwk), before any write by this run.
select 'open_shifts', count(*) from pos_shifts where tenant_id='33333333-3333-4333-8333-333333333333' and status='open';   -- 1 (6cb40a72…, $100 float, opened 12:46Z by the fixture owner)
select 'orders_total', count(*) from orders where tenant_id='33333333-3333-4333-8333-333333333333';                           -- 186 (pending_payment=39, cancelled=37, paid=74, draft=36)
select status, total_client_price from inquiry_offers where inquiry_id='6a5e9455-e7ed-46dd-a53e-d26064e8b780' and status='accepted'; -- accepted, 800.00
select count(*) from agency_bookings where source_inquiry_id='6a5e9455-e7ed-46dd-a53e-d26064e8b780';                        -- 0
select count(*) from booking_transactions where source_tenant_id='33333333-3333-4333-8333-333333333333' and status='paid';    -- 40
select count(*) from booking_transactions where source_tenant_id='33333333-3333-4333-8333-333333333333' and status='refunded';-- 0
select count(*) from information_schema.columns where table_name='booking_transactions' and column_name='metadata';           -- 1 (20261231020400 applied)
select current_setting('default_transaction_read_only');                                                                     -- off
