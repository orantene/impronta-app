-- TUL-G1 backfill APPLY. NOT a migration: the lead reviews, runs the dry run
-- (tul-g1-claim-backfill-dryrun-2026-10-13.sql), then runs this in ONE transaction.
-- Ownership linkage only: no amount, status, provider or Stripe field is written.
-- Every changed row is recorded in public._tul_g1_backfill_2026_10_13 so
-- tul-g1-claim-backfill-rollback-2026-10-13.sql can undo exactly this run.
-- Rules = web/src/lib/inquiry/claim-everything.ts. Jorgelina TAL-93938 excluded.
-- Note: inquiry participant seats / relationships / pending approvals are NOT
-- written here; claimInquiriesByConfirmedEmail repairs them on the owner's next sign-in.
begin;

create table if not exists public._tul_g1_backfill_2026_10_13 (
  tbl text not null, row_id uuid not null, col text not null, new_user uuid not null,
  applied_at timestamptz not null default now()
);
alter table public._tul_g1_backfill_2026_10_13 enable row level security; -- service role only

create temp table g1_verified on commit drop as
  select u.id user_id, lower(trim(u.email)) email
  from auth.users u join public.profiles p on p.id = u.id
  where u.email_confirmed_at is not null and p.app_role = 'client'
    and u.email is not null and u.email not ilike '%@privaterelay.appleid.com'
    and u.id <> '77afcae9-7633-4a80-9fee-022be655b231'::uuid;
create temp table g1_jor_inq on commit drop as
  select inquiry_id id from public.inquiry_participants where talent_profile_id = 'f048e578-cbae-45db-9a3b-34239abea136'::uuid;
create temp table g1_jor_bk on commit drop as
  select booking_id id from public.booking_talent where talent_profile_id = 'f048e578-cbae-45db-9a3b-34239abea136'::uuid
  union select b.id from public.agency_bookings b join public.customers c on c.id = b.customer_id
        where c.owner_talent_profile_id = 'f048e578-cbae-45db-9a3b-34239abea136'::uuid
  union select b.id from public.agency_bookings b where b.source_inquiry_id in (select id from g1_jor_inq);

-- 1. inquiries
with c as (
  select i.id, v.user_id from public.inquiries i join g1_verified v on lower(trim(i.contact_email)) = v.email
  where i.client_user_id is null and i.id not in (select id from g1_jor_inq)
), u as (
  update public.inquiries t set client_user_id = c.user_id from c
  where t.id = c.id and t.client_user_id is null returning t.id, c.user_id
)
insert into public._tul_g1_backfill_2026_10_13 (tbl, row_id, col, new_user) select 'inquiries', id, 'client_user_id', user_id from u;

-- 2. customers (one per tenant+user: customers_tenant_user_key)
with raw as (
  select c.id, c.tenant_id, v.user_id, cp.id cp_id, c.client_profile_id,
         row_number() over (partition by c.tenant_id, v.user_id order by c.created_at, c.id) rn
  from public.customers c join g1_verified v on lower(trim(c.email::text)) = v.email
  left join public.client_profiles cp on cp.user_id = v.user_id
  where c.user_id is null and c.merged_into_id is null
    and c.owner_talent_profile_id is distinct from 'f048e578-cbae-45db-9a3b-34239abea136'::uuid
    and (c.client_profile_id is null or c.client_profile_id = cp.id)
    and not exists (select 1 from public.customers o where o.tenant_id = c.tenant_id and o.user_id = v.user_id and o.merged_into_id is null)
), u as (
  update public.customers t set user_id = raw.user_id, client_profile_id = coalesce(t.client_profile_id, raw.cp_id)
  from raw where raw.rn = 1 and t.id = raw.id and t.user_id is null
  returning t.id, raw.user_id, (raw.client_profile_id is null and raw.cp_id is not null) filled_profile
)
insert into public._tul_g1_backfill_2026_10_13 (tbl, row_id, col, new_user)
  select 'customers', id, 'user_id', user_id from u
  union all select 'customers', id, 'client_profile_id', user_id from u where filled_profile;

-- 3. agency_bookings (email match, or owned customer / owned inquiry with no other email)
with c as (
  select b.id, (array_agg(distinct x.user_id))[1] user_id from public.agency_bookings b
  join lateral (
    select v.user_id from g1_verified v where lower(trim(b.contact_email)) = v.email
    union all select oc.user_id from public.customers oc where oc.id = b.customer_id and oc.user_id is not null
    union all select oi.client_user_id from public.inquiries oi where oi.id = b.source_inquiry_id and oi.client_user_id is not null
  ) x on true
  join g1_verified ve on ve.user_id = x.user_id
  where b.client_user_id is null and b.id not in (select id from g1_jor_bk)
    and (nullif(trim(b.contact_email), '') is null or lower(trim(b.contact_email)) = ve.email)
  group by b.id having count(distinct x.user_id) = 1
), u as (
  update public.agency_bookings t set client_user_id = c.user_id from c
  where t.id = c.id and t.client_user_id is null returning t.id, c.user_id
)
insert into public._tul_g1_backfill_2026_10_13 (tbl, row_id, col, new_user) select 'agency_bookings', id, 'client_user_id', user_id from u;

-- 4. booking_transactions (payer_user_id only)
with c as (
  select t.id, (array_agg(distinct x.user_id))[1] user_id from public.booking_transactions t
  join lateral (
    select v.user_id from g1_verified v where lower(trim(t.payer_email)) = v.email
    union all select b.client_user_id from public.agency_bookings b
      where b.id = t.booking_id and b.client_user_id in (select user_id from g1_verified) and nullif(trim(t.payer_email), '') is null
  ) x on true
  where t.payer_user_id is null and t.booking_id not in (select id from g1_jor_bk)
  group by t.id having count(distinct x.user_id) = 1
), u as (
  update public.booking_transactions t set payer_user_id = c.user_id from c
  where t.id = c.id and t.payer_user_id is null returning t.id, c.user_id
)
insert into public._tul_g1_backfill_2026_10_13 (tbl, row_id, col, new_user) select 'booking_transactions', id, 'payer_user_id', user_id from u;

-- 5. inquiry_messages: the guest's own lines (G7)
with c as (
  select m.id, i.client_user_id user_id from public.inquiry_messages m
  join public.inquiries i on i.id = m.inquiry_id
  join g1_verified v on v.user_id = i.client_user_id and lower(trim(i.contact_email)) = v.email
  where m.sender_user_id is null and m.guest_session_id is not null and m.guest_session_id = i.guest_session_id
    and i.id not in (select id from g1_jor_inq)
), u as (
  update public.inquiry_messages t set sender_user_id = c.user_id from c
  where t.id = c.id and t.sender_user_id is null returning t.id, c.user_id
)
insert into public._tul_g1_backfill_2026_10_13 (tbl, row_id, col, new_user) select 'inquiry_messages', id, 'sender_user_id', user_id from u;

select tbl, count(*) from public._tul_g1_backfill_2026_10_13 group by tbl;
commit;
