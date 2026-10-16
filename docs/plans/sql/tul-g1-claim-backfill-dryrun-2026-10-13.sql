-- TUL-G1 backfill DRY RUN (read-only). Counts what tul-g1-claim-backfill-apply-2026-10-13.sql
-- WOULD attach. Same rules as web/src/lib/inquiry/claim-everything.ts:
--   verified client accounts only (auth.users.email_confirmed_at NOT NULL, profiles.app_role='client',
--   no Apple private relay); owner column must be NULL; an email on the row must equal the verified
--   email (trim + lower); an email-less row only through a parent the user owns (or will own).
-- Jorgelina TAL-93938 (talent_profiles f048e578-cbae-45db-9a3b-34239abea136, user 77afcae9-...) is excluded.
with jor as (select 'f048e578-cbae-45db-9a3b-34239abea136'::uuid tp, '77afcae9-7633-4a80-9fee-022be655b231'::uuid uid),
verified as (
  select u.id user_id, lower(trim(u.email)) email
  from auth.users u join public.profiles p on p.id = u.id
  where u.email_confirmed_at is not null and p.app_role = 'client'
    and u.email is not null and u.email not ilike '%@privaterelay.appleid.com'
    and u.id <> (select uid from jor)
),
jor_inq as (select inquiry_id id from public.inquiry_participants where talent_profile_id = (select tp from jor)),
jor_bk as (
  select booking_id id from public.booking_talent where talent_profile_id = (select tp from jor)
  union select b.id from public.agency_bookings b join public.customers c on c.id = b.customer_id where c.owner_talent_profile_id = (select tp from jor)
  union select b.id from public.agency_bookings b where b.source_inquiry_id in (select id from jor_inq)
),
inq as (
  select i.id, v.user_id from public.inquiries i join verified v on lower(trim(i.contact_email)) = v.email
  where i.client_user_id is null and i.id not in (select id from jor_inq)
),
owned_inq as (select id, client_user_id user_id from public.inquiries where client_user_id is not null union select id, user_id from inq),
cust_raw as (
  select c.id, c.tenant_id, v.user_id,
         row_number() over (partition by c.tenant_id, v.user_id order by c.created_at, c.id) rn
  from public.customers c join verified v on lower(trim(c.email::text)) = v.email
  left join public.client_profiles cp on cp.user_id = v.user_id
  where c.user_id is null and c.merged_into_id is null
    and c.owner_talent_profile_id is distinct from (select tp from jor)
    and (c.client_profile_id is null or c.client_profile_id = cp.id)
    and not exists (select 1 from public.customers o where o.tenant_id = c.tenant_id and o.user_id = v.user_id and o.merged_into_id is null)
),
cust as (select id, user_id from cust_raw where rn = 1),
owned_cust as (select id, user_id from public.customers where user_id is not null union select id, user_id from cust),
bk as (
  select b.id, (array_agg(distinct x.user_id))[1] user_id from public.agency_bookings b
  join lateral (
    select v.user_id from verified v where lower(trim(b.contact_email)) = v.email
    union all select oc.user_id from owned_cust oc where oc.id = b.customer_id
    union all select oi.user_id from owned_inq oi where oi.id = b.source_inquiry_id
  ) x on true
  left join verified ve on ve.user_id = x.user_id
  where b.client_user_id is null and b.id not in (select id from jor_bk)
    and (nullif(trim(b.contact_email), '') is null or lower(trim(b.contact_email)) = ve.email)
    and ve.user_id is not null
  group by b.id having count(distinct x.user_id) = 1  -- ambiguous owner: leave it
),
owned_bk as (select id, client_user_id user_id from public.agency_bookings where client_user_id is not null union select id, user_id from bk),
tx as (
  select t.id, (array_agg(distinct x.user_id))[1] user_id from public.booking_transactions t
  join lateral (
    select v.user_id from verified v where lower(trim(t.payer_email)) = v.email
    union all select ob.user_id from owned_bk ob where ob.id = t.booking_id and nullif(trim(t.payer_email), '') is null
  ) x on true
  where t.payer_user_id is null and t.booking_id not in (select id from jor_bk)
  group by t.id having count(distinct x.user_id) = 1
),
msg as (
  select m.id from public.inquiry_messages m
  join public.inquiries i on i.id = m.inquiry_id
  join owned_inq oi on oi.id = i.id
  join verified v on v.user_id = oi.user_id and lower(trim(i.contact_email)) = v.email
  where m.sender_user_id is null and m.guest_session_id is not null and m.guest_session_id = i.guest_session_id
    and i.id not in (select id from jor_inq)
)
select 'inquiries' tbl, count(*) rows_to_attach, count(distinct user_id) users from inq
union all select 'customers', count(*), count(distinct user_id) from cust
union all select 'agency_bookings', count(*), count(distinct user_id) from bk
union all select 'booking_transactions', count(*), count(distinct user_id) from tx
union all select 'inquiry_messages', count(*), null from msg
union all select 'customers_skipped_tenant_user_collision', count(*), null from cust_raw where rn > 1;
