-- Isolated branch fxlankepwnvelxjrahwk, 2026-09-10 ~16:10Z, after the People journeys.
-- One human, three hats, as rows. QA Journeys Talent holds a roster row (public
-- profile + bookable) and THREE `removed` membership rows: one per
-- grant/revoke cycle this spec ran (the live-status partial unique index
-- permits history). No live membership remains, which is the state the
-- access test ends on. Therapist B has no account and no membership.
select 'roster' as tbl, r.talent_profile_id::text as id, p.display_name, r.status,
       r.direct_booking_enabled::text as agency_half,
       (p.booking_terms->>'directBookingOptIn') as person_half, p.user_id::text as account
from public.agency_talent_roster r join public.talent_profiles p on p.id=r.talent_profile_id
where r.tenant_id='33333333-3333-4333-8333-333333333333'
union all
select 'membership', m.profile_id::text, pr.display_name, m.status, m.role, m.removed_at::text, u.email
from public.agency_memberships m
  left join public.profiles pr on pr.id=m.profile_id
  left join auth.users u on u.id=m.profile_id
where m.tenant_id='33333333-3333-4333-8333-333333333333'
order by 1,2;
-- OUTPUT:
-- membership 33330001-...-0001 QA Journeys Owner   active  owner
-- membership 33330001-...-0002 QA Journeys Viewer  active  viewer
-- membership 33330001-...-0005 QA Journeys Talent  removed manager (removed_at 2026-09-10 15:48:32Z)
-- membership 33330001-...-0005 QA Journeys Talent  removed viewer
-- membership 33330001-...-0005 QA Journeys Talent  removed viewer
-- roster     33330003-...-0001 QA Journeys Talent       active agency_half=true person_half=true account=33330001-...-0005
-- roster     33330003-...-0002 QA Journeys Therapist B  active agency_half=true person_half=true account=null
