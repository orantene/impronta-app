-- TUL-G1 backfill ROLLBACK: resets exactly the rows the apply recorded, and
-- only while they still hold the value the backfill wrote (later changes kept).
begin;
update public.inquiries t set client_user_id = null from public._tul_g1_backfill_2026_10_13 b
  where b.tbl = 'inquiries' and t.id = b.row_id and t.client_user_id = b.new_user;
update public.customers t set user_id = null from public._tul_g1_backfill_2026_10_13 b
  where b.tbl = 'customers' and b.col = 'user_id' and t.id = b.row_id and t.user_id = b.new_user;
-- client_profile_id: only rows where the apply filled an EMPTY value.
update public.customers t set client_profile_id = null from public._tul_g1_backfill_2026_10_13 b
  where b.tbl = 'customers' and b.col = 'client_profile_id' and t.id = b.row_id and t.user_id is null
    and t.client_profile_id = (select cp.id from public.client_profiles cp where cp.user_id = b.new_user);
update public.agency_bookings t set client_user_id = null from public._tul_g1_backfill_2026_10_13 b
  where b.tbl = 'agency_bookings' and t.id = b.row_id and t.client_user_id = b.new_user;
update public.booking_transactions t set payer_user_id = null from public._tul_g1_backfill_2026_10_13 b
  where b.tbl = 'booking_transactions' and t.id = b.row_id and t.payer_user_id = b.new_user;
update public.inquiry_messages t set sender_user_id = null from public._tul_g1_backfill_2026_10_13 b
  where b.tbl = 'inquiry_messages' and t.id = b.row_id and t.sender_user_id = b.new_user;
drop table public._tul_g1_backfill_2026_10_13;
commit;
