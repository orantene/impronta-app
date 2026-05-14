# QA fixture inventory — 2026-05-14

Output of `web/scripts/qa-fixture-inventory.mjs` against remote Supabase
(`pluhdapdnuiulvxmyspd.supabase.co`). Read-only via service role.

## Ready (✅)

| Fixture | Detail |
|---|---|
| qa-admin@impronta.test | user_id `4b9e595d…` — agency_admin in `impronta` |
| qa-client-1@impronta.test | user_id `bb31fa4c…` — used in v1 walk |
| qa-client-2@impronta.test | user_id `688787f4…` |
| tulum-talent-sofia@impronta.test | user_id `20057931…` — Sofía Herrera, talent |
| `impronta` agency | plan_tier=`agency`, status=`active` |
| `talent_profiles` TAL-92001 | Sofía Herrera, approved + public |
| `talent_profiles` TAL-92002 | Carmen Díaz, approved + public |
| 1 pitch row | token column = `share_token_id` |
| 5 recent inquiries | newest `6c1df02a` (coordination + offer attached) — qa-client-1 → Sofia |

## Blocked (❌)

| Missing | Impact | Owner action |
|---|---|---|
| `owner@novacrew.demo` user | Cross-tenant guard test (step 21) blocked | Create user OR change test approach |
| No agency with `plan_tier='studio'` | P1.G plan-tier QA gap | Seed a studio-tier agency |
| No agency with `plan_tier='network'` | P1.G plan-tier QA gap | Seed a network-tier agency (or accept gap) |
| No `agency_memberships.role='coordinator'` rows active | Steps 7/8 blocked — entire coord lane (slice F/G shipped 2026-05-13) is unreachable in QA | Seed a coord user via `agency_memberships` |
| No talent-coord hybrid identity | Slice L (shipped 2026-05-13) cannot be walked | Add an `agency_memberships` row for Sofia's user_id in `impronta` |
| No `inquiry_messages.message_kind='admin_suggested_talent'` row | Step 13 — admin-suggested-talent chat card render unverifiable without composer-side picker (which is TODO) | Hand-seed one row for QA |

## Schema corrections discovered during inventory

The QA plan v2 doc used assumed table/column names that don't match the live schema. Recording the canonical names here so the walk doesn't get tripped up:

| Plan v2 said | Reality |
|---|---|
| `tenants` table | `public.agencies` (slug, plan_tier, status) |
| `tenants.id` foreign key | `agencies.id` everywhere, but FK columns are still named `tenant_id` (e.g. `inquiries.tenant_id` references `agencies.id`) |
| `talents` table | `public.talent_profiles` |
| `talent_profiles.full_name` | `talent_profiles.display_name` (and `first_name`/`last_name`) |
| `talent_profiles.tenant_id` | does NOT exist — ownership via `created_by_agency_id` |
| `tenant_members` table | `public.agency_memberships` (`profile_id`, `tenant_id`, `role`, `status`) |
| `agency_memberships.role='agency_admin' \| 'agency_coord'` | actual enum: `('owner','admin','coordinator','editor','viewer')` |
| `inquiry_messages.message_type` | `inquiry_messages.message_kind` (with `card_payload jsonb`) |
| `pitches.public_token` | `pitches.share_token_id` |

## In-flight inquiry state (for transition walks)

| Inquiry ID | Status | Source | Offer attached |
|---|---|---|---|
| `6c1df02a…` | `coordination` | `directory_client` | yes (`0108eb6c…`) |
| `d76a4bf9…` | `submitted` | `directory_client` | none |
| `ba7a8753…` | `submitted` | `directory_client` | none |
| `283b11c4…` | `submitted` | `directory_guest` | none |
| `11111111…` | `submitted` | `directory_guest` | none |

Two `directory_guest` rows confirm E1 (public directory cart) guest path
has been exercised at least twice already in prior dev — so submit
path works for unauthed users at the DB level.

## Plan v2 §5 status update

Of 11 fixtures listed in plan v2 §5:
- 5 ✅ ready (qa-client-1, qa-client-2, Sofia, qa-admin, recent inquiries)
- 6 ❌ blocked (second-tenant admin, coord, talent-coord, studio tier, network tier, admin_suggested_talent card)

**Recommendation**: ship a `web/scripts/seed-qa-fixtures.ts` that
idempotently creates the missing 6. ~1h work, unblocks slices F/G + L
+ P1.G + step 13 verification.

Until that lands, the walk plan adapts as follows:

- **Steps 1–6** (submit + coordination on a fresh inquiry) — walkable today on `impronta` tier=agency.
- **Steps 7–8** (coordinator assignment + accept) — **BLOCKED** until coord seed lands.
- **Step 9** (add talent to roster) — walkable (works without explicit coord role).
- **Steps 10–11** (talent decline + rate submission) — walkable for Sofia + Carmen.
- **Steps 12–14** (offer draft + send) — currently blocked at UI level (admin Offer tab mocked, v1 bug #3).
- **Step 15–18** (counter / accept / approvals / booking conversion) — engine-walkable via service-role-write tests; UI walk needs the admin Offer tab unblock.
- **Step 19** (booking detail surfaces) — walkable on existing booking fixture if one exists, otherwise blocked.
- **Step 20** (freeze/unfreeze/archive) — walkable.
- **Step 21** (cross-tenant guard) — BLOCKED without second-tenant admin user.
- **Step 22** (mobile pass) — walkable any time.

## Next action

Before the walk: stand up the seed script. Otherwise the walk evidence
is full of "blocked — fixture missing" rows and we re-discover the
gap every time.
