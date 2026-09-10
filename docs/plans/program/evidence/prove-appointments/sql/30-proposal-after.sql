-- Read back 2026-09-10 ~16:54Z. Each "QA Stylist C <stamp>" is one run's fixture person (seeded by
-- the spec's beforeAll with the service client: auth user, profiles, talent_profiles, roster; no
-- hours, no proposal). Everything else in these rows was written by a screen.
select tp.display_name, pr.status, pr.source, pr.timezone as proposal_tz, pr.decided_at is not null as decided,
       h.timezone as hours_tz, h.weekly->'1' as monday
  from talent_profiles tp
  left join talent_booking_hours_proposals pr on pr.talent_profile_id = tp.id
  left join talent_booking_hours h on h.talent_profile_id = tp.id
 where tp.display_name like 'QA Stylist C %'
 order by tp.created_at;
-- display_name                 status    source           proposal_tz          decided  hours_tz             monday
-- QA Stylist C 1789056442571   null      null             null                 false    null                 null   <- run aborted before publish (selector), never published
-- QA Stylist C 1789056697210   null      null             null                 false    null                 null   <- same
-- QA Stylist C 1789056763904   proposed  publish_default  America/Mexico_City  false    null                 null   <- published; the WORKSPACE accept was refused ("This person sets their own hours.")
-- QA Stylist C 1789057258133   proposed  publish_default  America/Mexico_City  false    null                 null   <- published; run stopped at the (now removed) workspace accept
-- QA Stylist C 1789058000476   accepted  publish_default  America/Mexico_City  true     America/Mexico_City  [{"endMin":1020,"startMin":540}]  <- accepted by the person in their Calendar
-- QA Stylist C 1789058206222   accepted  ...              (same)
-- QA Stylist C 1789058391126   accepted  ...              (same)
-- QA Stylist C 1789058780034   accepted  ...              (same, the traced run)
-- Reading: publishing wrote a proposal and NO hours (rows 3 and 4 are exactly that state, frozen);
-- acceptance wrote the hours row in the zone typed, and stamped the proposal accepted.
