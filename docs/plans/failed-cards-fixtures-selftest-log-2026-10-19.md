# Failed-cards fixtures: rolled-back self-test run log (2026-10-19)

Staging `fxlankepwnvelxjrahwk` only. Command (from `web/`): `npx tsx scripts/seed-failed-cards-fixtures.mts --env-file <tmp preview env pull> --selftest`. The env file was a read-only `vercel env pull --environment=preview --git-branch=main`, deleted after. Nothing persisted: the run ends in ROLLBACK and a fresh read-only re-count of every fixture id returned 0. No `--apply` was run. Counts and deterministic fixture ids only; no secrets, no personal data (every mailbox is a `qa-fixture-g6` test or bot address).

A first self-test reported a +2 row drift on `public.guest_sessions` that was other staging traffic committing during the 10-minute run (read committed); the self-test now runs REPEATABLE READ, and this run shows no drift.

## Dry run (BEGIN READ ONLY)

```
[failed-cards-fixtures] target OK (staging fxlankepwnvelxjrahwk). mode=plan
[failed-cards-fixtures] plan guards OK: 146 ops, forbidden talents resolved on staging: 1
[failed-cards-fixtures] fixtures: F1, F3, F2, F5, F6, F7, F8, F9, F10, F11, F12, F14, S5, S6 | held: F13, S1
  F1    11 ops  cards TUL-280 TUL-954
  F3    37 ops  cards TUL-698 TUL-1067 TUL-1167 TUL-870 TUL-1016
  F2    10 ops  cards TUL-955
  F5     8 ops  cards TUL-935 TUL-941 TUL-1051
  F6    14 ops  cards TUL-365 TUL-998
  F7     8 ops  cards TUL-741
  F8     6 ops  cards TUL-767 TUL-1169
  F9     1 ops  cards TUL-847
  F10    1 ops  cards TUL-574
  F11    7 ops  cards TUL-571
  F12    6 ops  cards TUL-802
  F14   23 ops  cards TUL-1155
  S5     5 ops  cards TUL-837 TUL-587
  S6     9 ops  cards TUL-1052 TUL-1061
[failed-cards-fixtures] rows by table (insert / update):
  public.guest_sessions                    2 / 0
  public.inquiries                         6 / 1
  public.inquiry_requirement_groups        6 / 0
  public.inquiry_participants             14 / 0
  public.inquiry_offers                    1 / 0
  public.inquiry_offer_line_items          1 / 0
  public.inquiry_messages                 11 / 0
  auth.users                               9 / 0
  public.profiles                          0 / 9
  public.agencies                          3 / 0
  public.agency_memberships                3 / 0
  public.agency_business_identity          3 / 0
  public.agency_domains                    4 / 0
  public.agency_branding                   1 / 0
  public.talent_profiles                  11 / 0
  public.talent_booking_hours              2 / 0
  public.agency_talent_roster              6 / 0
  public.media_assets                      4 / 0
  public.talent_offerings                  7 / 0
  public.talent_offering_media             5 / 0
  public.talent_pages                      9 / 0
  public.tenant_promo_codes                7 / 0
  public.talent_theme_catalog              2 / 0
  public.talent_theme_versions             2 / 0
  public.talent_theme_releases             2 / 0
  public.talent_theme_drafts               2 / 0
  public.talent_sites                      5 / 0
  public.client_profiles                   2 / 0
  public.agency_bookings                   1 / 0
  public.talent_bookings                   1 / 0
  public.booking_talent                    1 / 0
  public.taxonomy_terms                    1 / 0
  public.talent_profile_taxonomy           1 / 0
  public.talent_discover_index             1 / 0
[failed-cards-fixtures] fixture rows already present: 0/121
[failed-cards-fixtures] schema + collision check: OK
[failed-cards-fixtures] DRY RUN: nothing written.
```

## Self-test (BEGIN REPEATABLE READ ... ROLLBACK)

```
[failed-cards-fixtures] target OK (staging fxlankepwnvelxjrahwk). mode=selftest
[failed-cards-fixtures] plan guards OK: 146 ops, forbidden talents resolved on staging: 1
[failed-cards-fixtures] selftest: skipped refresh_talent_discover_index (a global matview refresh; runs on --apply only)
[failed-cards-fixtures] rows (created / already present / updated):
  public.guest_sessions                  2 / 0 / 0
  public.inquiries                       6 / 0 / 1
  public.inquiry_requirement_groups      6 / 0 / 0
  public.inquiry_participants            14 / 0 / 0
  public.inquiry_offers                  1 / 0 / 0
  public.inquiry_offer_line_items        1 / 0 / 0
  public.inquiry_messages                11 / 0 / 0
  auth.users                             9 / 0 / 0
  public.profiles                        0 / 0 / 9
  public.agencies                        3 / 0 / 0
  public.agency_memberships              3 / 0 / 0
  public.agency_business_identity        3 / 0 / 0
  public.agency_domains                  4 / 0 / 0
  public.agency_branding                 1 / 0 / 0
  public.talent_profiles                 11 / 0 / 0
  public.talent_booking_hours            2 / 0 / 0
  public.agency_talent_roster            6 / 0 / 0
  public.media_assets                    4 / 0 / 0
  public.talent_offerings                7 / 0 / 0
  public.talent_offering_media           5 / 0 / 0
  public.talent_pages                    9 / 0 / 0
  public.tenant_promo_codes              7 / 0 / 0
  public.talent_theme_catalog            2 / 0 / 0
  public.talent_theme_versions           2 / 0 / 0
  public.talent_theme_releases           2 / 0 / 0
  public.talent_theme_drafts             2 / 0 / 0
  public.talent_sites                    5 / 0 / 0
  public.client_profiles                 2 / 0 / 0
  public.agency_bookings                 1 / 0 / 0
  public.talent_bookings                 1 / 0 / 0
  public.booking_talent                  1 / 0 / 0
  public.taxonomy_terms                  1 / 0 / 0
  public.talent_profile_taxonomy         1 / 0 / 0
[failed-cards-fixtures] selftest: table row deltas after the writes (incl. trigger side effects):
  auth.users                             +9
  auth.identities                        +9
  public.profiles                        +9
  public.client_profiles                 +2
  public.talent_profiles                 +11
  public.talent_sites                    +5
  public.talent_pages                    +9
  public.talent_booking_hours            +2
  public.talent_profile_taxonomy         +1
  public.agency_talent_roster            +17
  public.agencies                        +3
  public.agency_memberships              +3
  public.agency_business_identity        +3
  public.agency_branding                 +1
  public.agency_domains                  +4
  public.media_assets                    +4
  public.talent_offerings                +7
  public.talent_offering_media           +5
  public.tenant_promo_codes              +7
  public.talent_theme_catalog            +2
  public.talent_theme_versions           +2
  public.talent_theme_releases           +2
  public.talent_theme_drafts             +2
  public.taxonomy_terms                  +1
  public.inquiries                       +6
  public.inquiry_requirement_groups      +6
  public.inquiry_participants            +14
  public.inquiry_offers                  +1
  public.inquiry_offer_line_items        +1
  public.inquiry_messages                +11
  public.guest_sessions                  +2
  public.agency_bookings                 +1
  public.talent_bookings                 +1
  public.booking_talent                  +1
[failed-cards-fixtures] read-back: 121/121 fixture ids present
  public.guest_sessions                  2/2
  public.inquiries                       6/6
  public.inquiry_requirement_groups      6/6
  public.inquiry_participants            14/14
  public.inquiry_offers                  1/1
  public.inquiry_offer_line_items        1/1
  public.inquiry_messages                11/11
  auth.users                             9/9
  public.agencies                        3/3
  public.agency_memberships              3/3
  public.agency_domains                  4/4
  public.talent_profiles                 11/11
  public.agency_talent_roster            6/6
  public.media_assets                    4/4
  public.talent_offerings                7/7
  public.talent_pages                    9/9
  public.tenant_promo_codes              7/7
  public.talent_theme_catalog            2/2
  public.talent_theme_releases           2/2
  public.talent_theme_drafts             2/2
  public.talent_sites                    5/5
  public.client_profiles                 2/2
  public.agency_bookings                 1/1
  public.talent_bookings                 1/1
  public.booking_talent                  1/1
  public.taxonomy_terms                  1/1
  PASS F1  guest offer thread: inquiry offer_pending with a sent $300 MXN offer (1/1)
  PASS F1  guest offer thread: 3 private messages incl. the offer card (3/3)
  PASS F3  studio: plan_tier studio, MXN, ES identity (1/1)
  PASS F3  studio: 2 site-visible roster talents, one name >= 40 chars (2/2)
  PASS F3  studio: long-name talent present (1/1)
  PASS F3  studio: 3 published priced services with a photo (3/3)
  PASS F3  studio: Mon-Sat hours rows for both roster talents (2/2)
  PASS F3  studio: subdomain (active) + custom domain (unverified) (2/2)
  PASS F3  studio: logo + accent (1/1)
  PASS F3  T1/T2 services pages with a services_catalog block (2/2)
  PASS F3  T2 non-QA services: one public priced with a photo, one on_request without price (2/2)
  PASS F3  empty-state twin: published service, no hours row (1/1)
  PASS F2  group thread: 2 talent + 1 client + 1 coordinator participants (4/4)
  PASS F2  group thread: T1 in 2 non-hub rosters (Agency filter) (2/2)
  PASS F2  group thread: original request text set (1/1)
  PASS F5  promos: 6 on T1 (scoped by talent_profile_id) (6/6)
  PASS F5  promos: T2 promo is not on T1 (no bleed) (1/1)
  PASS F5  promos: page with promo blocks on T1 (1/1)
  PASS F6  builder lab: 2 designs released v1 (published) with one open draft each (2/2)
  PASS F6  builder lab: QA sites on the designs (non-demo) (2/2)
  PASS F7  padded + malformed recipients on 2 guest inquiries (2/2)
  PASS F8  unverified client: email_confirmed_at NULL with a password (1/1)
  PASS F8  blank-name client: profiles.display_name blank + client_profiles row (1/1)
  PASS F9  hidden service on T1 (draft) (1/1)
  PASS F10 area block with ES note + EN translation on T2 (1/1)
  PASS F11 C1 hub booking on TAL-96003 linked to its inquiry (1/1)
  PASS F12 taxonomy term Limpieza de casas (1/1)
  PASS F12 tagged talent is publicly listed (1/1)
  PASS F14 concierge: one handoff then 3 guest follow-ups (3/3)
  PASS F14 concierge: the workspace's only active member is the bot mailbox (1/1)
  PASS S5  free-plan talent (talent_basic) with a site (1/1)
  PASS S6  payout talents MX/US/CA (3/3)
[failed-cards-fixtures] cleanup deleted 149 rows (fixture ids and their FK descendants only)
[failed-cards-fixtures] selftest: cleanup left 0 fixture rows; row-count drift: none
[failed-cards-fixtures] selftest: after ROLLBACK, fixture rows on staging: 0 (expected 0)
[failed-cards-fixtures] selftest OK; everything rolled back, nothing persisted
```

## Fixture keys and ids (deterministic: stableId("fc:" + key))

### public.guest_sessions (2)
- F1 guest_session:f1 c32ee24a-23aa-4778-9b49-fcc5f3c9bb38
- F14 guest_session:f14 ee57949c-40a8-4df1-bddf-709cbfa7095e
### public.inquiries (7)
- F1 inquiry:f1 2eb719b4-2331-4f0c-9630-7700d2770be3
- F1 UPDATE inquiry:f1:offer 2eb719b4-2331-4f0c-9630-7700d2770be3
- F2 inquiry:f2 283348aa-f66a-40b5-8d0f-4bc0d07c47a4
- F7 inquiry:f7a ef036497-3d78-4b57-afe4-fd87b486c2bd
- F7 inquiry:f7b 59146011-1383-4527-9698-319ac6beb779
- F11 inquiry:f11 e9a81dea-141f-4d45-83f6-69d2b36d73c9
- F14 inquiry:f14 dace6d34-a2a1-47ee-b1cb-ff953e3ff0a5
### public.inquiry_requirement_groups (6)
- F1 reqgroup:f1 e6b02edf-0fc5-4ff1-b8b6-4d34ac0dfdae
- F2 reqgroup:f2 5d4ee0dc-3f47-46ed-aa3b-0469015cef0b
- F7 reqgroup:f7a d8d45b78-6e5e-494f-9e15-d05fe6cc3e87
- F7 reqgroup:f7b 3f5ce46a-728d-488b-b37b-b67209c57f1b
- F11 reqgroup:f11 6c891179-b8c4-408f-8778-4e8a5bd6653d
- F14 reqgroup:f14 9b56652c-867c-4dcc-8faf-241c8b398b1c
### public.inquiry_participants (14)
- F1 participant:f1:talent 32b67c19-551f-45db-9cf4-85796e76775f
- F1 participant:f1:client 12568236-228e-4113-8adf-226be2defa48
- F2 participant:f2:client 826fcd9b-25bf-4fa3-9106-aa58f550909c
- F2 participant:f2:coordinator 2e07676f-bf9f-49c2-bc23-a149999a681a
- F2 participant:f2:talent1 6a7b27f1-a2f8-4134-827c-c75ac011b804
- F2 participant:f2:talent2 eea9ccc1-1fe7-4850-a96d-494b6824a97c
- F7 participant:f7a:talent c8ba47ad-b9cd-4dae-bf56-45199621ab04
- F7 participant:f7a:client 3a885eb2-716a-44b7-84ac-0f1a1d55dfe4
- F7 participant:f7b:talent 3bbd09cf-45d6-4420-a8f1-6e0da842d463
- F7 participant:f7b:client 74e22d30-2134-4eaf-9416-3b22a200f29f
- F11 participant:f11:talent 32bdf9de-1966-4126-8417-15ee8ba42e1c
- F11 participant:f11:client 7309a9e5-9bf5-4ca0-bf3c-41f68e7d6d5e
- F14 participant:f14:talent 534be1df-8f34-4be8-bc83-5cd6e025c298
- F14 participant:f14:client dca71939-65ad-4d3d-909e-fd6eba828473
### public.inquiry_offers (1)
- F1 offer:f1 fc289442-a860-48dd-8621-17be665f3264
### public.inquiry_offer_line_items (1)
- F1 offer_line:f1 6ff3bc8a-b276-4749-a887-3f94386ad61f
### public.inquiry_messages (11)
- F1 message:f1:guest1 14f20884-03ac-4c91-a8ec-4795eea61d54
- F1 message:f1:talent1 d1d84ce6-f0e7-4e3d-9df2-121160042c55
- F1 message:f1:offer ff043f7f-cd2f-489d-b8d1-72b5d3b8164f
- F2 message:f2:client da942ef8-7e45-4379-9287-f48188596ee4
- F2 message:f2:coordinator 6122d62b-60ca-49ce-8142-51f111fa5b54
- F14 message:f14:guest1 65090f47-5aa6-42b8-9288-396d1e3432a2
- F14 message:f14:ai1 e4d5a77e-e960-4273-b55d-bb62ad27e5cd
- F14 message:f14:handoff 70d7d60b-3b1b-4020-b786-18f757ec38f6
- F14 message:f14:guest2 9f5c3dce-2862-412d-8465-c994ed41d31f
- F14 message:f14:guest3 22cb5a8c-4511-484e-bba1-c4beccadfdee
- F14 message:f14:guest4 9d131c32-1421-43bc-ae74-0adebbfb2b47
### auth.users (9)
- F3 user:f3-owner 9173eed7-22df-480f-9329-e04b31296df9
- F8 user:f8-unverified 157e4826-a45d-40b3-b84c-83a44460e6db
- F8 user:f8-noname 28aba799-9b2b-4140-b89c-025592e3f437
- F14 user:f14-bot 38e3ac25-02fa-46df-a8e7-8c29cc43d03a
- F14 user:f14 b4c6b06b-0726-49d7-a893-327929654d55
- S5 user:s5-free 1889e3fd-c14a-4d3f-8602-3253a90e343e
- S6 user:s6-mx 589557c1-29d9-4c95-9fbe-4e6adf9d955f
- S6 user:s6-us 499b3463-1960-43a0-8afd-80e838add43f
- S6 user:s6-ca 9c0fb3b8-d8d5-4d31-ad26-ab8eae9cd098
### public.profiles (9)
- F3 UPDATE profile:f3-owner 9173eed7-22df-480f-9329-e04b31296df9
- F8 UPDATE profile:f8-unverified 157e4826-a45d-40b3-b84c-83a44460e6db
- F8 UPDATE profile:f8-noname 28aba799-9b2b-4140-b89c-025592e3f437
- F14 UPDATE profile:f14-bot 38e3ac25-02fa-46df-a8e7-8c29cc43d03a
- F14 UPDATE profile:f14 b4c6b06b-0726-49d7-a893-327929654d55
- S5 UPDATE profile:s5-free 1889e3fd-c14a-4d3f-8602-3253a90e343e
- S6 UPDATE profile:s6-mx 589557c1-29d9-4c95-9fbe-4e6adf9d955f
- S6 UPDATE profile:s6-us 499b3463-1960-43a0-8afd-80e838add43f
- S6 UPDATE profile:s6-ca 9c0fb3b8-d8d5-4d31-ad26-ab8eae9cd098
### public.agencies (3)
- F3 workspace:f3 46557041-9817-444d-9ed8-023e16497611 (qa-fixture-g6-studio)
- F3 workspace:f3-nohours 5038daa1-875d-46c7-8f7a-a7af3d021e21 (qa-fixture-g6-studio-nohours)
- F14 workspace:f14 1a76d5c1-cb5e-4ebd-8260-768dbc3547da (qa-fixture-g6-concierge)
### public.agency_memberships (3)
- F3 membership:f3 fd929453-2fca-47b2-9c91-16f8b7a81093
- F3 membership:f3-nohours 563c7d26-7836-4e8c-ab72-b10e7dbc3635
- F14 membership:f14 cba8f605-be7e-4349-baed-90636f3d65d8
### public.agency_business_identity (3)
- F3 identity:f3
- F3 identity:f3-nohours
- F14 identity:f14
### public.agency_domains (4)
- F3 domain:f3:sub aa05714c-170a-482d-8586-8115e168f9e0 (qa-fixture-g6-studio.staging.tulala.digital)
- F3 domain:f3-nohours:sub 7414b8d1-064b-4dad-a1ef-a55022423857 (qa-fixture-g6-studio-nohours.staging.tulala.digital)
- F3 domain:f3:custom 3ff7e3d8-0df8-4c45-9cd8-8510ccce6135 (qa-fixture-g6-studio.impronta.test)
- F14 domain:f14:sub 4086cf78-4213-47b7-8257-ee2b319fb850 (qa-fixture-g6-concierge.staging.tulala.digital)
### public.agency_branding (1)
- F3 branding:f3
### public.talent_profiles (11)
- F3 talent:f3-a 7910ef88-6ece-483b-aad9-5e5bbd0ff16b (TAL-96010)
- F3 talent:f3-b 135fa86e-cb70-4253-96ba-af3160883997 (TAL-96011)
- F3 talent:f3-c 43093b30-05c6-42a0-b4fa-2c127084b3b8 (TAL-96012)
- F6 talent:f6-copy 6466b786-f802-4716-984f-d21a7764c070 (TAL-96013)
- F6 talent:f6-block 69460ea4-6173-49e3-a5d7-2d80ff55cc03 (TAL-96014)
- F12 talent:f12 056e8cfa-3c9f-4e3f-873c-08ff65f349e5 (TAL-96015)
- F14 talent:f14 1b48ed23-6f14-4a2b-b63e-2467260035b2 (TAL-96016)
- S5 talent:s5-free 0b0c761f-279c-4d25-9b21-37f4581bed71 (TAL-96017)
- S6 talent:s6-mx f9149941-300f-4c60-95d5-575e37499481 (TAL-96018)
- S6 talent:s6-us 15c1f390-1707-468f-b6c9-1f9c21c4e9c0 (TAL-96019)
- S6 talent:s6-ca 88ed4d22-cb7f-415f-a78b-b1ba399b8025 (TAL-96020)
### public.talent_booking_hours (2)
- F3 hours:f3-a
- F3 hours:f3-b
### public.agency_talent_roster (6)
- F3 roster:f3-a:ws fc95593a-f4fd-4f3c-9f1c-5ad2b88d0195
- F3 roster:f3-b:ws 70a7cc5d-2e6a-467b-94a8-1ee1d20c5cf2
- F3 roster:f3-c:ws a76c9677-a5b5-4b13-8acd-2afca51c325b
- F2 roster:f2:t1:studio 91bb3da0-a1be-4689-9959-39edae2e425d
- F2 roster:f2:t1:studio2 83362d11-4e55-42d4-98cb-07d81c060b9f
- F14 roster:f14:ws 1a3ae24c-3978-4c60-933b-f5c287ec6c0e
### public.media_assets (4)
- F3 media:f3-a-estandar 9e042710-f48e-40d5-a5e8-b5092027fa0e
- F3 media:f3-a-profunda 25dec969-004a-45d8-b305-89d8945e32ea
- F3 media:f3-b-oficina cfa6e466-0671-40ed-abd6-99f7a55a878f
- F3 media:f3-c-estandar 83e2a6f7-df11-41f4-97a9-49e2b71e82b1
### public.talent_offerings (7)
- F3 offering:f3-a-estandar d21f897d-3338-4bb5-a931-5fc4ffbbc035
- F3 offering:f3-a-profunda 520f2677-55a6-45c9-86b7-decc21a709a6
- F3 offering:f3-b-oficina f88ed6b8-a2e3-45a1-99bf-5a1728c4d431
- F3 offering:f3-c-estandar 55135000-704c-468c-a1bf-a122a434fe62
- F3 offering:f3-t2-lampara 8dc6db48-1f5f-4023-afe0-966c3151944c
- F3 offering:f3-t2-revision 73f8d656-88a8-457d-b875-366a8a77222d
- F9 offering:f9-hidden 29efd666-b453-4b28-bd7f-e6326101a3cc
### public.talent_offering_media (5)
- F3 offering_media:f3-a-estandar:f3-a-estandar
- F3 offering_media:f3-a-profunda:f3-a-profunda
- F3 offering_media:f3-b-oficina:f3-b-oficina
- F3 offering_media:f3-c-estandar:f3-c-estandar
- F3 offering_media:f3-t2-lampara:g6-media-2
### public.talent_pages (9)
- F3 page:f3:t1:servicios 9cd71862-7033-4dc5-917b-4b15a4c90d3d (qa-fixture-g6-servicios)
- F3 page:f3:t2:servicios 686490d6-e93b-411a-adf4-337c185f3d78 (qa-fixture-g6-servicios)
- F5 page:f5:promos e280af87-3909-4df8-afb6-eade8c8a0726 (qa-fixture-g6-promos)
- F6 page:f6-copy:home fb8bf539-6b20-42aa-a45b-0b89037f6661 (home)
- F6 page:f6-block:home 36986779-5378-40bd-b52f-a5073c2f19fc (home)
- F10 page:f10:zona 4e4e6611-f2bb-4c1c-8f00-0406630584d2 (qa-fixture-g6-zona)
- F12 page:f12:home 50c99a29-0e84-4832-b0fb-3ace9982b478 (home)
- F14 page:f14:home d679f02e-7679-4a67-866f-c957c8c68bcb (home)
- S5 page:s5-free:home 9e9a02e5-28bc-40c8-af0e-ce2c27bb8441 (home)
### public.tenant_promo_codes (7)
- F5 promo:t1-public 055aaeed-2292-494f-a361-6c59c1500a46
- F5 promo:t1-code f468f795-f553-4d2b-a68a-dc8c7eadefce (QA20)
- F5 promo:t1-new-clients 3a2388fa-8fd7-4c4d-824d-b45eb50aa0df
- F5 promo:t1-first3 2ee5d864-3c68-4659-a4ef-e39ec93b5233
- F5 promo:t1-countdown f45c9ee7-cc72-4217-af22-0722d7d31784
- F5 promo:t1-expired d274f565-ec53-4228-a603-b786659d117c
- F5 promo:t2-public a7653f16-6abd-4aba-a3a8-95184cb7409f
### public.talent_theme_catalog (2)
- F6 design:f6-copy 6d0b91ac-a3f5-47b8-a6ba-f25ae2c5e98a (qa-fixture-g6-qa-copy)
- F6 design:f6-block 421a5b7a-b23f-417e-9985-4e241c70f213 (qa-fixture-g6-qa-block)
### public.talent_theme_versions (2)
- F6 design_version:f6-copy (qa-fixture-g6-qa-copy)
- F6 design_version:f6-block (qa-fixture-g6-qa-block)
### public.talent_theme_releases (2)
- F6 release:f6-copy b702fe9e-4075-42f4-b401-4696c6b1623c
- F6 release:f6-block 32e7a483-d8b3-4ada-ba92-9f0a3d41bbde
### public.talent_theme_drafts (2)
- F6 draft:f6-copy 48e0136a-70a3-4543-ad5f-d750ffd4c5cb (qa-fixture-g6-qa-copy)
- F6 draft:f6-block 7a25b926-ea99-40fc-b971-ea19d1ad0b13 (qa-fixture-g6-qa-block)
### public.talent_sites (5)
- F6 site:f6-copy 2b0a5eb1-a254-4232-b9de-793b7166e683 (qa-fixture-g6-qa-copy)
- F6 site:f6-block 58bd5d53-a412-48ea-ad25-d7ae59692726 (qa-fixture-g6-qa-block)
- F12 site:f12 791b044a-82db-4183-86b0-f4ddd88a6a67 (qa-fixture-g6-limpieza-casas)
- F14 site:f14 47f001be-cced-4ebf-8257-cb393273f30d (qa-fixture-g6-concierge-talento)
- S5 site:s5-free bd4ee4f4-03ee-46d2-a4f3-6a3026e1bb22 (qa-fixture-g6-free)
### public.client_profiles (2)
- F8 client_profile:f8-unverified f2f6dca7-29ac-43d5-b334-d110c8d04602
- F8 client_profile:f8-noname f5f39633-a8c7-43e4-beb4-471e125a6d76
### public.agency_bookings (1)
- F11 booking:f11 c00c99c3-d4ea-4e91-a654-413606cf0910
### public.talent_bookings (1)
- F11 talent_booking:f11 c00c99c3-d4ea-4e91-a654-413606cf0910
### public.booking_talent (1)
- F11 booking_talent:f11 9ff869bf-3c13-4c69-b256-3ec5cc7c9b9b
### public.taxonomy_terms (1)
- F12 term:f12 16655690-edaa-4d40-a59d-a7007e230718 (qa-fixture-g6-limpieza-de-casas)
### public.talent_profile_taxonomy (1)
- F12 taxonomy:f12
### public.talent_discover_index (1)
- F12 refresh_talent_discover_index
