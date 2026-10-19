# Group 6 staging fixtures (2026-10-18)

Staging only (`fxlankepwnvelxjrahwk`). Script: `web/scripts/seed-group6-staging-fixtures.mts`
(+ `web/scripts/lib/group6-fixtures.mjs`, test `web/scripts/lib/group6-fixtures.test.mjs`).

## How the script behaves

| Mode | What it does |
|---|---|
| (none) | Read-only plan. Checks the target, prints which fixture rows already exist. Writes nothing. |
| `--selftest` | Writes everything in one transaction, runs `--cleanup`, asserts 24 watched tables are back to their starting row counts and 0 fixture rows remain, then ROLLS BACK. Proves FK/check/trigger constraints against the real staging schema. |
| `--apply` | Writes everything, COMMIT. New rows only (`ON CONFLICT DO NOTHING` on the row's own id; never UPDATE of an existing row). A second run creates nothing. |
| `--cleanup --apply` | Deletes only rows reachable (FK descendants) from this seed's deterministic ids. |
| `--stripe` | With `--apply`: also creates Stripe TEST objects (real PaymentIntent for the refundable booking, TEST customer + subscription row). Needs `STRIPE_SECRET_KEY=sk_test_...`. NOT run (see blockers). |

Guards: `DATABASE_URL` login must be `postgres.fxlankepwnvelxjrahwk` (pooler) or `db.fxlankepwnvelxjrahwk.supabase.co`;
refuses if any DB/Supabase env mentions `pluhdapdnuiulvxmyspd`; refuses unless the staging-only agency `qa-journeys`
exists; prints ids only, never secrets. Env comes from the process env or `--env-file <path>`; the Vercel pull file
(`vercel env pull <tmp outside the repo> --environment=preview --git-branch=main`) works and must be deleted after.
Fixture logins use `QA_FIXTURE_PASSWORD` (>= 12 chars). Without it the accounts have no password.

Run (from `web/`, `node_modules` linked): `npx tsx scripts/seed-group6-staging-fixtures.mts --env-file <tmp> [--selftest|--apply]`.

## Applied on staging (2026-10-18)

`--selftest` passed (rolled back), then `--apply` committed once; a re-run created 0 rows. Rows created
(counts): auth.users 3, talent_profiles 2, talent_sites 2, talent_pages 2, talent_offerings 4, talent_offering_media 5,
media_assets 3, agency_bookings 5, talent_bookings 5, booking_talent 5, booking_transactions 4, inquiries 1,
inquiry_offers 1, inquiry_offer_line_items 1, inquiry_participants 2, talent_reviews 3, cms_posts 4, customers 1,
taxonomy/hours rows 4. The `profiles` rows are created by the existing `on_auth_user_created` trigger and then set up.

The 3 logins' shared password is in `~/.tulala-qa-fixtures-g6.env` (`QA_FIXTURE_PASSWORD`, mode 600). It is not in
this repo or any chat. Emails are `qa-fixture-g6-{limpieza,quote,client}@impronta.test` (not real inboxes: sign in with the password).

Sign-in check (read-only, prints status codes only): `node scripts/check-group6-fixture-login.mjs --env-file <staging env pull>`.
It signs the 3 fixture users in with the Supabase password grant, then opens `app.staging.tulala.digital` (`/talent/today`, `/client`, `/account`) with that session and the gate token header. Last run: all 3 grants 200; both talents land signed in on `/talent/today` (200); the client lands on `/account` (200). The plan mode (no flags) also checks, read-only, that all 26 tables/columns the seed writes exist in the staging schema. A `client_profiles` row is seeded for the client, otherwise `/client` bounces to `/onboarding/role`.

## Fixtures and how Verify uses them

Ids: T1 talent_profile `ea77cae1-4065-4e0c-82c8-b632bc8c0ef3` (TAL-96001), T2 `a5c8919d-e9c7-4076-8547-a2d1b0478482` (TAL-96002),
client user `3647899e-36f1-428c-8074-946942bf5aab`, T1 user `ee89bab2-95b3-4976-a062-955201249a52`,
T2 user `886a406d-ed4d-4df8-8087-8f7a4546dc66`. Both talents: unlisted (not in the public directory), hub roster active,
plan `talent_portfolio`, currency MXN, published site (slugs `qa-fixture-g6-limpieza`, `qa-fixture-g6-quote`), hours Mon-Sat 9-18 Cancun.

| Need | Rows | Verify steps |
|---|---|---|
| (b) single-service cleaning site, address field. TUL-841/896/933, and the "gap under a single service card" card | T1 has exactly ONE published public service "QA Limpieza de casa" ($800 MXN, instant, `attributes.where = ["client"]`, 1 photo) | Open T1 site and the hub page `/t/TAL-96001`, start a booking: the address field must show (service has a client place), long address wraps, confirmation shows reference + address. 390px + desktop, ES + EN. |
| (a) offer accept then pay. TUL-957 | Inquiry `58cb8c66-052b-482f-b97d-1b254940ea0c` + SENT offer `67d2b787-64be-40f8-be4c-b032668bbf99`, $300 MXN, valid 14 days, client = fixture client, talent = T1 | Sign in as the T1 user: offer shows on `/talent/money` and in the thread DINERO panel (not "Sin cargos aun"). Sign in as the client: accept the offer, pay on `/pay` (app host) with Stripe TEST card 4242 4242 4242 4242. |
| TUL-1072 away appointment | Booking `122ed4fd-9dc5-479a-abb0-98ae5818c3b7`: today 15:00-17:00 Cancun, venue "Calle 12 #34, Col. Centro, Cancun", unpaid, confirmed | `/talent/today` (T1 user), EN and ES: location reads as the real address (away), never "At studio". |
| refundable paid booking | Booking `9ac86359-a038-4a90-bd38-ce34f5d2cdda` tomorrow 10:00, $800 MXN, transaction `paid` (provider stripe) | Refund CTA/flow visible on the booking and `/talent/money`. A real refund click only works with `--stripe` (see blockers). Refund-pending derivation and CTA visibility can be checked now. |
| (c) quote service | T2 "QA Cambio de tablero" (`price_type custom`, `price_display quote`, no amount, request mode) | T2 site: shows "A cotizar" / "Quote" + request CTA, no price; JSON-LD Offer (card "Quote-only services"). |
| (c) on_request service (D-10a) | T2 "QA Emergencia 24h" (`visibility on_request`, $900 stored) | Service stays listed but the price is withheld ("Bajo consulta"/"On request"). |
| (c) offerings with images | T2 "QA Instalacion de contacto" ($450, 2 photos), plus the 2 other T2 services with photos, T1 service photo (5 links, 3 real stock images already on staging storage) | Image optimizer + service cards/pages show photos. |
| TUL-585 published reviews | 3 published reviews on T1 (5, 4, 5 stars), each tied to a completed paid booking (`talent_reviews.verified_paid = true`, `rating_count 3`, avg 4.67) | View-source of T1's profile/site has `aggregateRating` + review JSON-LD; the zero-review T2 page has none. |
| TUL-1009 posts | On T1 (plan has Posts): published ES `qa-fixture-g6-guia-limpieza`, published EN `qa-fixture-g6-cleaning-guide` (translation_of the ES), expired `qa-fixture-g6-oferta-vencida`, taken down `qa-fixture-g6-articulo-oculto` | `/blog/<slug>` on the T1 site host: first two render; expired renders with notice + noindex; taken-down answers the unavailable state; `/posts` 301s. |
| "cosas que faltan" counts | Known totals on T1: 1 sent offer, 1 appointment today, 1 paid booking tomorrow, 3 completed bookings, 3 reviews, 4 posts; T2: 3 services (1 quote, 1 on_request) | Compare any count badge/summary against these numbers. See blocker 5: the exact "cosas que faltan" check list was not found in Notion. |

Note on AGENTS.md "QA test data on public sites": service titles carry `QA` and talents are unlisted (not in directory/search), but
the services are PUBLISHED on purpose (the single-service/quote/booking checks need a live public service). Same precedent as the
existing `QA- Limpieza profunda` rows. `npm run qa:scan-test-services` against staging would list them; that scan is for prod/isolated.

## Not built, with the exact blocker

1. **TUL-834 paid plan (billing portal + invoices) and plan change/proration:** needs a real Stripe TEST customer + subscription
   whose ids go in `talent_subscriptions`. The preview env on this machine has `STRIPE_SECRET_KEY=""` (empty), so the `--stripe`
   path (written, untested) could not run. Blocker: a person provides an `sk_test_` key for the staging Stripe account (same one
   staging uses) and runs `--apply --stripe`. Proration needs catalog TEST prices (`supabase/seed-staging-notes/stripe_test_product_prices.sql`
   is not on `main`; it lives in another agent's unpushed work), and `--stripe` uses an inline price, not the catalog price.
2. **Real refund click on the refundable booking:** same key. Without it the booking is paid in the DB only (no PaymentIntent), so
   Stripe would reject the refund call. With `--stripe` the seed makes one real TEST PaymentIntent (`pm_card_visa`), as TUL-690 does.
3. **Payout receiver:** money rows reuse the hub's existing payout account `16c37580-...` ("QA Paid Owner (fixture)"), as the TUL-690
   seed does, because `payout_accounts` is tenant-scoped and creating a connected account needs Stripe. Payout/transfer lines
   therefore name that account, not T1.
4. **Fixture logins need the password file** (above). Sessions Verify already holds (TAL-93950 etc.) are unchanged and do NOT see
   these rows; Verify must sign in as the fixture users.
5. **PM decisions:** (a) the Notion "Group 6 fixture list" page was not found by search; this covers the PM's list plus the cards
   named in the task. If "cosas que faltan" means a specific screen's counts, send me the screen. (b) Keep the fixtures published
   long term, or run `--cleanup --apply` after Verify (cleanup is verified by `--selftest`). (c) Fixture `profile_code`s are
   `TAL-96001/96002` because the DB constraint forces `TAL-<digits>`; the app's generator is at 93952, so no collision is expected.

## Not verified (needs Verify screenshots, ES + EN + 390px)

Nothing user-visible was browser-checked. Only DB read-backs and the transactional selftest were run: published public services on T1 = 1,
quote-only 1, on_request 1, offering photo links 5, T1 `rating_count` 3, 4 of 4 paid transactions `paid`, site lookup RPC resolves
`qa-fixture-g6-limpieza`.

## Extension: failed-cards fixtures (2026-10-19)

Script: `web/scripts/seed-failed-cards-fixtures.mts` (pure planners and guards in `web/scripts/lib/failed-cards-*.mjs`,
unit tests `web/scripts/lib/failed-cards-fixtures.test.mjs`, lane `orphans-enrolled-core`). It extends this Group-6 seed
(which must be applied first; the script refuses otherwise) for the fixtures in the Failed-card inventory of 2026-10-19:
F1 F2 F3 F5 F6 F7 F8 F9 F10 F11 F12 F14 S5 S6 (DB) and S2 S3 S4 S6 (Stripe TEST). F13 (shared-row edits) is WAITING ON PM
and S1 (staging Stripe keys + webhook) is PM dashboard work: neither is implemented.

Rules it enforces before any write (unit-tested): DATABASE_URL user must contain `postgres.fxlankepwnvelxjrahwk` and no
variable may name `pluhdapdnuiulvxmyspd`; the staging marker agency must exist; every id is `stableId("fc:" + key)`
(deterministic, separate from Group-6 ids); every slug / hostname / design slug starts `qa-fixture-g6`; every mailbox is
`qa-fixture-g6-*@impronta.test` or `tulalaqa+qa-fixture-g6-*@mail.grokbot.com` (F7's malformed address is the one named
exception); no written value names TAL-93938, TAL-93940 (observe-only; its staging id is resolved and refused) or TUL-52;
updates touch only this seed's own rows; workspace slugs, subdomain labels and site slugs never share a DNS label; no
service title, description or category says QA / test / E2E (public loaders hide those on fixture talents on purpose).

Run from `web/` with a read-only `vercel env pull --environment=preview --git-branch=main <tmp>` (delete it after):

| Step | Command | Writes |
|---|---|---|
| Dry run (default) | `npx tsx scripts/seed-failed-cards-fixtures.mts --env-file <tmp>` | nothing (`BEGIN READ ONLY`): ops per table, rows already present, schema + natural-key collision check |
| Self-test | `... --selftest` | nothing that persists: `BEGIN ISOLATION LEVEL REPEATABLE READ`, apply, read back every fixture id + per-card checks, cleanup, row-count drift check, `ROLLBACK`, then re-count fixture rows (must be 0) |
| Apply (after the PM note) | `QA_FIXTURE_PASSWORD=... npx tsx ... --apply --backup-file <new path>` | the rows in the write list; the backup file records the before-image of every pre-existing row changed (none expected) |
| Subset | `--only F1,F5` (F2 pulls in F3) | |
| Stripe preflight | `... --stripe S2,S3,S4,S6 [--stripe-key-file <mode-600 file>] [--stripe-mx-key-file <file>]` | nothing (GETs only; key must be `sk_test_` and `/v1/balance` must say `livemode=false`) |
| Stripe apply | `... --apply --backup-file <f> --stripe S2,S3,S4,S6` | S2 promotion code QA20 on `tulala_test_20pct_3m`; S3 customer + `workspace.studio` monthly subscription on `qa-fixture-g6-studio` (+1 `workspace_subscriptions`); S4 billing-portal configuration + a paid invoice on T1's subscription; S6 Express TEST accounts MX (MX platform key) / US / CA (US key) written to the S6 payout talents |
| Undo | `... --cleanup` (plan) then `... --cleanup --apply --backup-file <f>` | deletes only fixture ids and their FK descendants (deleted rows' images go to the backup file); subdomain rows go with their workspace (ON DELETE CASCADE) |

Notes:
- The F3 studio is a NEW workspace `qa-fixture-g6-studio` (owner `qa-fixture-g6-studio-owner@impronta.test`) plus the empty-state
  twin `qa-fixture-g6-studio-nohours`; `qa-fixture-g6-ws` is left unchanged (free, no payments) because TUL-1255/1182/734 rely on it.
  S3 therefore subscribes `qa-fixture-g6-studio`.
- F3 also gives T1 and T2 a published `qa-fixture-g6-servicios` page with a `services_catalog` block and adds two T2 services with
  real titles (one public priced with a photo, one on_request without a price). Every Group-6 T1/T2 service title starts with "QA",
  which `hideTestServiceOnPublicSite` drops on test-account talents, so those services never show publicly. T1 gets no new service
  (TUL-841/896/933 need a single-service site). TAL-93023 (`qa-journeys-talent`, a shared journeys fixture) is not touched.
- F12's tagged talent is a non test-account (it must be publicly listed), so it shows in the staging public directory; `--apply`
  also runs `select public.refresh_talent_discover_index()` (skipped in the self-test).
- The raw inserts send no email or bell (fan-out is app code). F14's thread lives in a workspace whose only member is a bot mailbox,
  so later app-driven message digests for it never reach a person.
- The self-test takes about 10-15 minutes on the pooler (FK-descendant cleanup walks every referencing table).
