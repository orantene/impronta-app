# Group 6 staging fixture verification checklist (2026-10-18)

## Source note (read this first)

The "528-case plan" was **not found**. Where I looked: Notion search for "528", "528 cases staging QA plan batches", "staging test plan Verify",
"Group 6 fixture list"; `docs/plans/*.md` (grep for `528`: only unrelated hits in the release board, handoffs and execution plans; no test plan; listed
`handoff-verify-staging-db-checks-2026-10-17.md`, `verify-test-gaps-2026-10-17.md`, `verify-staging-db-checks-results-2026-10-17.md`,
`staging-reqa-checklist-2026-10-15.md`); `~/` for `*528*` and the `QA-Batch*-findings` files the cards cite under `/workspace/pm/` (not on disk here).
This checklist is therefore built from the retest map (`verify-retest-fixture-map-2026-10-18.md`) plus the "needs a fixture" cards named by PM and the
QA batch cards found in Notion. If the 528-case list is a file, drop it in `docs/plans/` and I will map the remaining rows.

Fixtures: staging `fxlankepwnvelxjrahwk` only, `qa-fixture-g6` rows (how they were built and cleaned: `staging-fixtures-group6-2026-10-18.md`).
Users (`@impronta.test`, password file `~/.tulala-qa-fixtures-g6.env`): **T1** `qa-fixture-g6-limpieza` (talent, TAL-96001), **T2** `-quote` (talent, TAL-96002),
**C1** `-client` (client with owed + paid work), **C2** `-client2` (client, everything paid, nothing owed), **O** `-owner` (workspace owner + talent, TAL-96003, workspace `qa-fixture-g6-ws`).
Status key: **covered** = fixture exists on staging and read back; **missing** = no fixture yet, with the blocker. Nothing is browser-verified; Verify supplies ES + EN + 390px evidence.

## A. Cases that need a fixture

| # | Case / card | Fixture user | URL / path | Status |
|---|---|---|---|---|
| 1 | TUL-841 / 896 / 933 booking sheet address field, confirmation reference + place, long address wraps | none (public) or C1 | hub `/t/TAL-96001` booking (one service, `where=client`) | covered |
| 2 | "Large empty gap under a single service card" | none | hub `/t/TAL-96001` | covered (T1 has exactly one published service) |
| 3 | TUL-957 sent $300 MXN offer in `/talent/money` and thread DINERO panel | T1 | app `/talent/money`, inbox thread | covered |
| 4 | Offer accept then pay (Stripe TEST card) | C1 | app client inbox -> offer -> accept -> `/pay` | covered up to checkout; completing needs staging's Stripe TEST config (no key in preview env) |
| 5 | TUL-1252 Pagar ahora -> `/pay/<code>` on the app host | C1 | app `/account` visit "QA Limpieza pendiente de pago" | covered |
| 6 | TUL-1242 Te deben stable, no endless Cargando, "tus clientes" | T1 (C1 owes, C2 paid) | app `/talent/today`, `/talent/money` | covered (two clients: C1 owed, C2 all paid) |
| 7 | TUL-1244 booking detail shows 09:00 and a place (agency booking id) | T1 | app `/talent/today` "QA Reserva de agencia..." | covered |
| 8 | TUL-1245 Detalles copy in ES (order record) | T1 | offer thread Detalles, after accepting the offer (accepting creates the order) | covered after the accept step |
| 9 | TUL-1072 away appointment label | T1 | app `/talent/today` EN + ES | covered |
| 10 | Refundable paid booking, refund CTA | T1 | app booking "QA Reserva pagada (reembolsable)" | covered for display; a real refund needs a Stripe TEST PaymentIntent: missing (seed `--stripe` + `sk_test_` key) |
| 11 | Quote-only service ("A cotizar", JSON-LD Offer) | none | T2 site via hub `/t/TAL-96002`, service "QA Cambio de tablero" | covered |
| 12 | on_request service price withheld (D-10a) | none | hub `/t/TAL-96002`, "QA Emergencia 24h" | covered |
| 13 | Offerings with images, image optimizer | none | hub `/t/TAL-96002`, `/t/TAL-96001` | covered (3 stock photos already on staging storage) |
| 14 | TUL-585 reviews + aggregateRating JSON-LD (and none when zero) | none | view-source hub `/t/TAL-96001` (3 verified) vs `/t/TAL-96002` (0) | covered |
| 15 | TUL-1009 posts: published, expired, taken down, missing | none | workspace site: `https://staging.tulala.digital/w/qa-fixture-g6-ws/blog/qa-fixture-g6-guia-limpieza` (also `-oferta-vencida`, `-articulo-oculto`) | covered on the WORKSPACE site (posts now belong to the owner workspace, tenant scope). Expected: published 200; expired 200 with a notice; taken down 404; missing 404. NOT possible on the talent host: see PRODUCT BUG below. Probed by `check-staging-nav-and-talent-host.mjs` |
| 16 | TUL-1255 `next=/<slug>/admin` for a workspace owner who is a talent | O | app `/login?next=/qa-fixture-g6-ws/admin` | covered |
| 17 | TUL-1250 `/client` not blank; TUL-1182 / 1177 / 1240 post-sign-in speed | C1, T1, T2, O | app `/client`, `/talent/today`, `/qa-fixture-g6-ws/admin` | covered (T2 = talent without agency) |
| 18 | TUL-1241 `/talent/support`, `/talent/help` in ES | T1 | app paths | covered |
| 19 | TUL-1258 client thread history | C1 | app client inbox -> offer thread (3 messages) | covered |
| 20 | TUL-1259 client language select vs UI language | C1 | app `/account` Ajustes in ES and EN | covered |
| 21 | TUL-734 empty Payments currency equals Overview | O | app `/qa-fixture-g6-ws/admin` Overview then Payments | covered (MXN workspace, no payments) |
| 22 | TUL-391 support-ticket bells in ES | T1 | app bell | covered (2 English-stored ticket bells) |
| 23 | TUL-951 / 856 / 923 / 861 / 863 hub profile drawer, share URL, phone default, times | none | hub `/es/t/TAL-96001`, `/t/TAL-96001` | covered (T1 hours Mon-Sat 9-18 Cancun) |
| 24 | TUL-1247 header links are never absolute app-host `/w/` URLs | none | hub `https://staging.tulala.digital/w/qa-b7-studio/` header (and `/w/qa-fixture-g6-ws/`) | covered by `check-staging-nav-and-talent-host.mjs`: today it FAILS on `qa-b7-studio` (5 absolute app-host links, pre-#3979 build) and PASSES on the fixture workspace; re-run after the staging cut |
| 25 | TUL-834 billing portal + invoices; plan change / proration; paid-plan half of 1059 | T1 | app `/talent/settings` billing | missing: Stripe TEST customer + subscription (`STRIPE_SECRET_KEY` empty in the preview env; run seed `--apply --stripe` with an `sk_test_` key). Proration also needs catalog TEST `product_prices` rows (a DB write needing a decision) |
| 26 | Guest inbox Lighthouse a11y 95+ on the guest thread page (TUL-1103) | none (signed out) | link in `~/.tulala-qa-guest-thread-g6.url` (written by `node scripts/print-group6-guest-thread-link.mjs --env-file <staging env pull> --check`); form `https://app.staging.tulala.digital/c/t/<token>?lang=es` | covered: guest inquiry + guest session + 3-message client thread to T1 (NEW). The page needs no cookie or login: the token is an HMAC of (inquiry, hub tenant) with `GUEST_COOKIE_SECRET`, valid 30 days (re-run the script to renew). Send the staging gate header `x-staging-gate-token` (from `~/.tulala-qa.env`) or pass the gate first |
| 27 | "+qamax fixture has no inquiries, offers, bookings or clients" (TUL-280, 715, 391 parts) | TAL-93940 persona | existing QA Max talent | not covered by design: this seed never touches existing talents; the same data now exists on T1 |
| 28 | Tenant-site header nav / ES workspace public home (TUL-699, 1247) | O | hub `/w/qa-fixture-g6-ws/` (200, default site) | covered for the nav check; the ES home copy of TUL-699 is the existing site, not a fixture |

## B. Cases that need NO fixture (public or code-only)

TUL-864 / 892 (`/es/pricing` approx MX$, currency picker), 851 (login `+` copy), 738 / 699 (`/es/discover-agencies`), 877 / 1079 (localized domain-not-connected 404 on an unknown `/w/<slug>`),
CI / lane items (#3984, #3999). Run them signed out on the hub / app hosts; no seed rows involved.

## C. Prerequisites that block whole groups

1. `STRIPE_SECRET_KEY` (sk_test_) for staging seeds: rows 10, 25 and the checkout end of row 4.
2. `TALENT_SITE_SUBDOMAINS_ENABLED="true"` on the staging deployment (the only flag; the wildcard alias exists): row 15 and any "site host" check. Full env list: `docs/plans/staging-env-vars-needed-2026-10-18.md`.
3. A PM go for catalog TEST `product_prices` (row 25). Order of the Stripe steps: `docs/plans/stripe-test-run-order-2026-10-18.md`.
4. The 528-case plan file, to map the cases beyond the ones above.

## D. Read-only scripts that prove the fixtures are usable (status codes only)

- `node scripts/check-group6-fixture-login.mjs --env-file <staging env pull>`: password grant for the 5 fixture logins (T1, T2, C1, C2, O) + app-host landing.
- `node scripts/check-staging-nav-and-talent-host.mjs --env-file <staging env pull>`: TUL-1247 nav check now (hub `/w/<slug>/`, follows the 308); talent host + post states once the env exists (skips with "env not set" until then).
- `npx tsx scripts/seed-group6-staging-fixtures.mts --env-file <tmp>`: read-only plan + schema check.

## Product bug found: talent-scope posts cannot exist on staging

`cms_posts.tenant_id` is still `NOT NULL` on staging. Posts v1 stores talent-site posts as `talent_profile_id = <id>, tenant_id = NULL`, and the public reader (`talentScopedQuery`) only returns rows with `tenant_id IS NULL`. The Posts v1 migration was recorded earlier as `20261014220352 posts_v1_blocks_categories_takedown` (without the `ALTER COLUMN tenant_id DROP NOT NULL` that `20261231400700` now carries, and `20261231400700` has no row in `schema_migrations`), so the constraint `cms_posts_scope_present` exists but the NOT NULL was never dropped. Effect: a talent without a workspace can save a post that fails on insert, and `/blog/<slug>` on a talent host is 404 for every post (the symptom PM saw). A fixture row with `tenant_id = hub` is invisible to the talent reader and leaks into the HUB's public blog, so the seed no longer writes it.
Fix is a DB change (apply the missing `DROP NOT NULL` on `cms_posts`, `cms_redirects`, `cms_post_categories` on staging): needs a migration decision, so it is NOT done here. Until then the post routes are testable only on the workspace site.
