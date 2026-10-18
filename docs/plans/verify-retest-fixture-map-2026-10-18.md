# Verify retest fixture map (2026-10-18)

For the PRs merged on `main` after staging's deployment (`dpl_8GkWu...`, pre-#3984): #3984 #3999 #3982 #3978 #3980 #3979 #3985 #3987 #3992 #3997 #3981.
Fixtures are the `qa-fixture-g6` rows on staging only (project `fxlankepwnvelxjrahwk`), built by
`web/scripts/seed-group6-staging-fixtures.mts` (see `docs/plans/staging-fixtures-group6-2026-10-18.md` for how it runs, guards and cleanup).
Hosts: app = `https://app.staging.tulala.digital`, hub = `https://staging.tulala.digital`. The talent subdomain site host is not routable on
staging (`TALENT_SITE_ROOT_DOMAIN` and `TALENT_SITE_SUBDOMAINS_ENABLED` are empty in the preview env), so the T1 public site is reached through the
hub profile `/t/TAL-96001` (and `/es/t/TAL-96001`). Sign in with the password in `~/.tulala-qa-fixtures-g6.env` (never pasted anywhere).
All checks: ES + EN, 390px + desktop; nothing here was browser-verified by the dev.

## Fixture users (all on staging, all `@impronta.test`, password login)

| Key | Email | Role | Notes |
|---|---|---|---|
| T1 | `qa-fixture-g6-limpieza@impronta.test` | talent (plan Max, ES, MXN) | owns TAL-96001: one service, offer, bookings, reviews, posts, bells |
| T2 | `qa-fixture-g6-quote@impronta.test` | talent, no agency (ES) | owns TAL-96002: quote / on_request / photo services |
| C | `qa-fixture-g6-client@impronta.test` | client (ES stored locale) | has a client profile, the offer, all T1 bookings, thread history |
| O | `qa-fixture-g6-owner@impronta.test` | talent role (own profile TAL-96003) AND owner of workspace `qa-fixture-g6-ws` | for next=/admin and Overview/Payments |

Rows (deterministic ids; list with the seed's dry run): T1 `ea77cae1-4065-4e0c-82c8-b632bc8c0ef3`, T2 `a5c8919d-e9c7-4076-8547-a2d1b0478482`,
sent offer `67d2b787-64be-40f8-be4c-b032668bbf99` (inquiry `58cb8c66-052b-482f-b97d-1b254940ea0c`),
away booking `122ed4fd-9dc5-479a-abb0-98ae5818c3b7`, refundable `9ac86359-a038-4a90-bd38-ce34f5d2cdda`, completed `a0901ee2-a373-4e75-96a0-615951e768c0`.
New in this round (ids): owner user `4fcb0a37-9355-41ea-a8f2-1f63b03ae2ec`, workspace `b1393a50-6ecd-41b2-8779-5d8c71722ee0`, owner talent_profile `75a57f9a-5576-4c23-a5ef-1f6b86f42238`, pay-later booking `b46d5965-d389-4220-915a-630ac29dc91f` (open order), agency-only booking `26eaac6c-59be-4eb2-a183-2ab7af629d67` (no talent_bookings row), 3 inquiry messages, 2 support-ticket bells.
Applied on staging 2026-10-18 after a passing clean-start --selftest; a second --apply created 0 rows. Sign-in check: all 4 grants 200, owner lands on /qa-fixture-g6-ws/admin 200.

## Card -> PR -> fixture -> exact check

| Card | PR | Sign in as | URL / path | Expected | Covered by |
|---|---|---|---|---|---|
| 1252 Pagar ahora 404 | #3982 | C | app `/account` -> open visit "QA Limpieza pendiente de pago" -> **Pagar ahora** (it mints `/pay/<code>` itself; links expire so none is pre-made) | lands on `/pay/<code>` on the app host (not Page not found); Stripe TEST checkout opens, no `/c` or `/r` link on a non-tenant host | pay-later booking + order (NEW). Paying needs the Stripe TEST card 4242 4242 4242 4242 on staging's own Stripe TEST config |
| 1242 Te deben stable | #3978 | T1 | app `/talent/today` ("Owed to you" tile), `/talent/money` | amount does not flip $500/$0 across reloads; no endless "Cargando"; copy says "tus clientes" | T1 has owed work (away $800, pay-later $800, agency-only $500 unpaid) and paid clients (3 completed + refundable) |
| 1255 next= for owners | #3980 | O | app `/login?next=/qa-fixture-g6-ws/admin` | after sign-in lands on `/qa-fixture-g6-ws/admin`, not blank `/talent/today` | O (NEW workspace + owner membership) |
| 1250 /client blank | #3980 | C | app `/client` | lands on `/account` with content (skeleton then content, never blank) | C has a client profile; sign-in check script confirms 307 -> `/account` 200 |
| 1241 /talent/support, /talent/help | #3980 | T1 (ES) | app `/talent/support`, `/talent/help` | support panel opens; no English "This page couldn't load" | T1 |
| 1258 client thread history | #3980 | C | app `/account` or `/client` inbox -> the offer conversation | thread starts with the client's own request, then the talent reply and the offer card; not just a reply box | 3 messages on the offer inquiry (NEW) |
| 864 /es/pricing MX$ | #3979 | none | hub `/es/pricing` | every priced plan has "approx MX$ N al mes, se cobra en USD" (display only) | no fixture needed (public) |
| 892 pricing currency picker | #3979 | none | hub `/es/pricing` at 390px | picking MXN shows MXN, monthly/annual toggle present | no fixture needed |
| 1259 client language select | #3979 | C | app `/account` Ajustes, UI in ES and again in EN | select shows the language the page is in (Espanol/English native names) | C (stored locale es, view in both) |
| 1247 own-site /w/ links | #3979 | O or none | workspace site nav link whose URL is `app.staging.../w/<slug>/...` | resolves to the site's own address | PARTLY: needs a nav item with that stored URL on a site; NOT seeded (card says root cause of the stored URL is unverified) |
| 851 login `+` warning | #3979 | none | app `/login` | no warning blaming `+` addresses | no fixture needed |
| 1059 billing price/currency display | #3979 | T1 (paid plan card) | app `/talent/settings` billing, `/es/pricing` | prices show MX$ approx on ES | needs the Stripe-backed paid plan: BLOCKED (below) |
| 738 / 699 ES discover | #3985 | none | hub `/es/discover-agencies` | filters, badges, city line (Ciudad de Mexico), tags, stats in Spanish | no fixture needed |
| 391 support-ticket bells in ES | #3985 | T1 (ES) | app any talent page -> bell | "Resolved: ..." / "Your ticket needs you" bell texts render in Spanish | 2 English-stored ticket bells (NEW) |
| 951 inquiry drawer ES | #3987 | none or C | hub `/es/t/TAL-96001` -> request drawer | whole drawer Spanish incl. search field, map labels, "Talento" | T1 profile |
| 923 guest phone default | #3992 | none | hub `/t/TAL-96001` booking sheet | country defaults to MX (+52) for a non-US browser region / Cancun talent | T1 (ES site, Cancun hours) |
| 856 share URL keeps /es | #3992 | none | hub `/es/t/TAL-96001` share row; auth popup + legal links | URLs are `/es/t/TAL-96001`, `/es/legal/...` | T1 profile |
| 877 / 1079 domain-not-connected 404 | #3992 | none | `https://app.staging.tulala.digital/w/no-such-workspace` with an ES browser language | localized 404 + title | no fixture needed |
| 863 | #3992 | none | hub `/t/TAL-96001` "Create account"/"Sign in" `next=` | next points to the public profile host, not app | T1 profile (card says unconfirmed) |
| 861 booking times | #3992 | none | hub `/t/TAL-96001` booking | times offered (hours Mon-Sat 9-18 Cancun), local time label, not UTC | T1 hours |
| 734 empty Payments currency | #3997 | O | app `/qa-fixture-g6-ws/admin` Overview then Payments | both show MXN ($0 MXN), not USD | workspace has preferred_currency MXN and no payments (NEW) |
| 1240 / 1177 / 1182 dashboard speed, blank after sign-in | #3981 | T2 (no agency) and T1 (hub roster); O for admin | sign in then `/talent/today`, `/talent/settings`; O: `/qa-fixture-g6-ws/admin` | first paint fast, no textless skeleton, no locale-seed redirect loop | T1, T2, O |
| 1244 booking detail time | #3981 | T1 (ES) | app `/talent/today` -> "QA Reserva de agencia (sin fila de talento)" (today 09:00) -> detail | shows 09:00 and a place, not "Sin hora asignada" / "Donde: -" | agency-only booking: agency_bookings + booking_talent, NO talent_bookings row (NEW). The "accepted offer's order id" half appears after Verify accepts the offer (accepting creates the order) |
| 1245 Detalles raw English | #3981 | T1 (ES) | app thread of the offer inquiry -> Detalles | no "Principal: order" / "paid" English | offer thread + the order Verify creates by accepting the offer (accept first) |
| 957 sent offer in Dinero | #3880 (not in this batch) | T1, C | `/talent/money`, thread DINERO panel; client accepts then pays | offer shows as owed; accept then pay works | the sent $300 MXN offer |
| 1072 away appointment | #3830 (not in this batch) | T1 | `/talent/today` EN + ES | location is the address, not "At studio" | away booking (today 15:00) |
| #3984 / #3999 | CI and lane list | n/a | n/a | CI only, nothing to retest on staging | n/a |

## Still missing (and why)

1. **Paid plan billing portal / invoices / proration (TUL-834, plan change, the paid-plan half of 1059):** needs a Stripe TEST customer and subscription. The preview env `STRIPE_SECRET_KEY` is empty. Run the seed with `--apply --stripe` and an `sk_test_` key (code written, untested). Proration additionally needs catalog TEST prices (`product_prices`), a DB write that is a separate decision.
2. **Real refund click and a Stripe-backed pay-later payment:** the refundable booking has no real PaymentIntent without `--stripe`. Paying the pay-later booking through checkout works with staging's own Stripe TEST config, not this seed.
3. **TUL-1247 stored absolute `/w/` URL:** no nav item with that URL is seeded because the real stored value is unknown. Needs the staging nav data from the reporter.
4. **Talent subdomain site host:** staging does not route `*.` talent hosts (env empty); `/blog/<slug>` posts on T1 (published, expired, taken down) can only be checked once a site host works. PM decision: enable the staging talent root domain, or accept hub-only checks.
5. **A second paying client for TUL-1242:** one client (C) covers both owed and paid. If Verify wants two distinct clients, ask and the seed adds a second client user.
