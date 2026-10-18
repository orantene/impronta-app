# Parked-card unblock sweep, 2026-10-18 (PKG-D)

Scope: the 67 PARKED rows of `truly-broken-triage-2026-10-18.md` plus the Building/Blocked cards the PM named
(TUL-1251, 953, 886, 699, 738, 540, 700, 1237, 896, 933, 746). For each card: can a CODE-SIDE action unblock or
fix it without Oran, production data, a Stripe key or a migration?

Decision codes: **FIX** = changed in this PR. **FIXTURE** = covered by the Group-6 staging seed (branch
`fixtures-group6-staging`, PR #4006; T1 = TAL-96001 single cleaning service, offer, posts, reviews; T2 = quote /
on_request; C/C2 = clients; O = owner of workspace `qa-fixture-g6-ws`). **RETEST** = needs a QA retest on a fresh
staging cut or a 390px / signed-in repro, nothing to code. **BLOCKER** = a true Oran / prod / Stripe key /
migration / PM-ruling dependency.

## Counts

| Decision | Cards |
|---|---|
| FIX in this PR | 4 (TUL-953, TUL-1237, TUL-1238 partial, TUL-888 stale test) |
| FIXTURE (G6 seed) | 9 (incl. 2 fixture gaps: TUL-587, TUL-767) |
| RETEST | 16 |
| BLOCKER | 48 (the rest of the 67 + TUL-540, 700, 746) |

## Fixed in this PR

| Card | Root cause found | Change |
|---|---|---|
| TUL-953 half-typed date submits empty | A half-typed native date reports `value=""` so the intent looks valid; `canSubmit` ignored it. The inline error existed (#3885) but Send stayed enabled and the date went out empty. | `EventDateInput` reports `badInput` to the drawer (`onIncompleteChange`); `InquiryDrawer` holds Send and shows the same ES/EN message in the footer while the date is incomplete. Test added to `event-date-input.test.tsx`. |
| TUL-1237 /es links drop Spanish | The home sections are all localised (guard test passes), but `/about` audience cards are DATA hrefs (`href: "/agencies"`) rendered by a plain `next/link`, which the literal-`href="/..."` guard cannot see. | `/about` cards go through `withLocaleHref`; guard test extended. |
| TUL-1238 English "Lineup" in the ES concierge | The lineup system note is STORED in English (`buildLineupNoteBody`, one row read by agency and guest) and the guest cluster rendered it raw. | `localizeLineupNoteBody` maps the two canonical bodies at render (`SystemNoteCluster`), new `public.guestChat.systemLineup*` keys en+es, unit test. Double "Agregar" and header "Solicitud 2 vs (1)" could not be reproduced from code: RETEST. |
| TUL-888 (coordinator add-on) | `mkt-b-mobile-polish.static.test.ts` is an ORPHAN (in no lane, so main was not red). Test 4 expected the exact string `line-clamp-2 break-words`; `TalentCard` now has `select-none` between the two utilities. The product did NOT regress: the name still wraps to two lines, the badge/availability no longer hard-truncate (`min-w-0 break-words`, `min-h-[26px]` pill). The test was stale. | Regex relaxed to `line-clamp-2[^"`]*break-words` with a comment; the file is now enrolled in `scripts/lanes/directory-cards.txt` so it gates. 7/7 pass. |

## All parked cards

| Card | Decision | Reason / who |
|---|---|---|
| TUL-43 legal review | BLOCKER | Oran / legal counsel sign-off on MX tax wording; RFC capture needs schema |
| TUL-158 client look on agency sites | FIXTURE + RETEST | G6 workspace `qa-fixture-g6-ws` + client C: open `/w/qa-fixture-g6-ws/client` on the next cut |
| TUL-225 WhatsApp channel | BLOCKER | Oran: Twilio vs Meta, cost, templates |
| TUL-307 support emails to Gmail | BLOCKER | Oran/Infra: `RESEND_INBOUND_FORWARD_TO`, mailbox choice |
| TUL-320 booking AI cap | BLOCKER | money rule, Oran OK on `credits.ts` cap |
| TUL-364 theme text ships on release | BLOCKER | prod release proof on TAL-93900 |
| TUL-365 Builder Lab text-only publish | BLOCKER | platform-admin fixture plus release GO (a write) |
| TUL-367 Maison v2 opt-in release | BLOCKER | shared DB write, Production-Migrate + Oran |
| TUL-368 stale theme notices | BLOCKER | held prod theme-release data steps |
| TUL-370 old theme drafts | BLOCKER | prod write, Oran decides drafts |
| TUL-406 Folio non-model demos | BLOCKER | needs prod URLs checked; PM/Oran accept staging evidence |
| TUL-437 paid-return theming | BLOCKER | `sk_test_` key; then pay the G6 sent offer (FIXTURE exists) |
| TUL-443 switched-off service types | BLOCKER | prod `deploy:smoke` proof (Oran/PM) |
| TUL-464 paid booking E2E | BLOCKER | isolated stack + `sk_test_` |
| TUL-467 premium /pay | BLOCKER | designer frames A-J + `sk_test_` |
| TUL-483 3 charges on missing account | BLOCKER | Stripe dashboard access |
| TUL-527 A-B-C-A theme switch | RETEST | signed-in builder on a fresh cut (G6 owner O or T1 can sign in) |
| TUL-549 theme header contrast | BLOCKER | Infra connects impronta-demo staging host; PM scope |
| TUL-556 /es/pricing plan names | BLOCKER | PM ruling: brand names vs bug |
| TUL-573 cold-start | BLOCKER | Oran OK for money-file lazy loads |
| TUL-581 SEO checklist | BLOCKER | PM defines checks and weights |
| TUL-583 one-click GSC | BLOCKER | Oran: GCP OAuth app verification |
| TUL-587 free-talent SEO | FIXTURE gap | G6 talents are on a paid plan; add a free-plan talent to the seed (seed branch owner), then QA |
| TUL-590 mobile speed numbers | BLOCKER | CrUX / Speed Insights data, PM grooming |
| TUL-645 talent-chat traceability | FIXTURE | G6 T1 offer thread; Oran/PM confirm option c |
| TUL-660 support AI handoff | RETEST | signed-in staging session driving the live support AI |
| TUL-693 guest claim email English | RETEST | chat copy fixed (#3942); email is the Supabase Send Email hook; retest after the hook. The lineup note localisation above removes one English system line. |
| TUL-694 account entry in every header | BLOCKER | Infra/Oran: `CLIENT_ACCOUNT_HOSTS` env + redeploy |
| TUL-698 /book ES | RETEST | capture the public slots response for the fixture workspace (hours/API, not copy) |
| TUL-709 client signup vs talent-only | BLOCKER | PM ruling |
| TUL-727 Datos fiscales MX fields | BLOCKER | Oran + legal (TUL-43) |
| TUL-741 email delivery | RETEST | trigger `inquiry.submitted` with a padded address on staging, read the notification log |
| TUL-743 Stripe live-mode catalog | BLOCKER | Oran, Stripe dashboard |
| TUL-753 unpaid cancelled-order bookings | BLOCKER | prod data + migration 20261231380714, Oran live yes |
| TUL-767 unverified-account error | FIXTURE gap | needs a seeded user without `email_confirmed_at`; add to the G6 seed (not in this PR) |
| TUL-774 confirm link, other user signed in | RETEST | `auth/confirm` is being edited by open #3980; re-assess after it merges (two-user repro) |
| TUL-787 mobile header avatar | BLOCKER | `CLIENT_ACCOUNT_HOSTS` env (same as TUL-694) |
| TUL-790 in-thread refund | FIXTURE + BLOCKER | G6 refundable paid booking exists; a real refund click needs `sk_test_` |
| TUL-793 service URL localisation | BLOCKER | PM/Oran SEO product decision |
| TUL-807 sticky Continuar at 390 | RETEST | 390px repro on `/start` services/zone step |
| TUL-832 cancel/resume subscription | BLOCKER | Stripe TEST prices (draft #4010) + `sk_test_` |
| TUL-833 promo codes | BLOCKER | Stripe TEST coupons + prices |
| TUL-834 billing portal | BLOCKER | paid-plan Stripe TEST fixture (G6 `--stripe` path needs the key) |
| TUL-837 entitlements unlock | BLOCKER | `stripe_test_product_prices` seed with `sk_test_` |
| TUL-838 billing E2E required check | BLOCKER | PM/Oran branch-protection decision |
| TUL-847 "Limpieza profunda" copy | FIXTURE | G6 T1 single cleaning service ("QA Limpieza de casa"); use it for the subtitle/tagline check |
| TUL-862 seed talent in directory | BLOCKER | Oran sets `is_publicly_hidden` on the confirmed rows |
| TUL-919 "Reservado" after failed payment | BLOCKER | needs a failed payment: `sk_test_` + pay offered on a fixture |
| TUL-935 promos PR1 | BLOCKER | staging migration-history repair (Prod-migrate) |
| TUL-940 promo void-not-delete | BLOCKER | Stripe TEST order full refund |
| TUL-960 bell backdrop at 390 | RETEST | `::backdrop` CSS is on main (MobileChromeStyles); signed-in talent at 390px |
| TUL-998 Builder Lab problem link | BLOCKER | PM call on link residual |
| TUL-1000 Builder Lab side-nav | RETEST | signed-in super_admin repro (cross-ref TUL-1188) |
| TUL-1004 Posts v1 migration | BLOCKER | staging migration-history repair |
| TUL-1009 Posts public routes | FIXTURE | G6 T1 has published ES/EN, expired and taken-down posts; also needs `TALENT_SITE_SUBDOMAINS_ENABLED` on the cut |
| TUL-1012 Posts QA pass | BLOCKER | migration history + localhost slot |
| TUL-1050 Posts widget | RETEST | signed-in builder session (G6 T1 has Posts) |
| TUL-1051 promo widgets | BLOCKER | Oran prod smoke on TAL-93900 |
| TUL-1052 Americas payouts | BLOCKER | Oran Stripe prerequisites + `sk_test_` |
| TUL-1113 shared 2 s loader budget | BLOCKER | PM budget-policy decision |
| TUL-1153 QA service name mismatch | BLOCKER | data owner renames/hides two `talent_offerings` rows |
| TUL-1191 client entry ES/EN sweep | BLOCKER | `CLIENT_ACCOUNT_HOSTS` + fresh client (G6 client C then available) |
| TUL-1225 account dock at 390 | RETEST | persona with the account dock at 390px |
| TUL-1233 facet counts vs results | BLOCKER (migration) | Root cause found in code: results use `directory_search_public_talent_ids` (FTS + synonyms + similarity) but the facet RPCs filter `p_search` with a plain ILIKE on name/bio/code, so 'limpieza' counts 1 where results are 41. Code-only was checked and is not possible: every facet RPC takes only `p_search text` (no id-array parameter) and the list search is a DB function (`directory_search_public_talent_ids(text)`, SETOF uuid), so the counts cannot be fed the list's ids. Migration written, NOT applied, parked at `supabase/migrations/_pending_pm/20261231412000_directory_facet_counts_use_list_search.sql`: it redefines the 6 facet functions (location x2, scalar_base_ids x2, taxonomy_counts x2; gender/boolean/text counts go through scalar_base_ids) replacing only the inline ILIKE block with `tp.id IN (SELECT public.directory_search_public_talent_ids(p_search))`. Needs Oran's migration OK. Static test pins the shape. |
| TUL-1238 Concierge ES | FIX (partial) | see above; rest RETEST |
| TUL-1254 hub.staging gate | BLOCKER | Infra, only if it recurs |
| TUL-1263 /workspace picker EN | RETEST/PM | no `/workspace` route exists; `landing-path.ts` can return it but no caller passes `membershipSlugs`, so the product never sends anyone there. The QA hit is a typed URL; PM can close or request the picker as a feature |

## Named extras (Building / Blocked cards)

| Card | Decision | Reason |
|---|---|---|
| TUL-1251 login rate limit on mode switch | RETEST | `QuietAction` is `type=button` and a static test pins that no mode switch calls a server action. Likely the Supabase 60 s per-address interval or the shared-IP 20/15 min floor on staging; needs the staging request log |
| TUL-953 | FIX | see above |
| TUL-886 header overflow 390 | RETEST | tap targets are on main (#3743 #3793 #3833 #3928); overflow claim needs a 390 repro naming the page |
| TUL-699 / TUL-738 ES directory | RETEST | merged in #3985, waiting for the next staging build |
| TUL-540 salon AI step | BLOCKER | needs a staging trace of the model output for the salon brief; detectors are unit tested |
| TUL-700 calendar timezone | BLOCKER (data) | zone resolves from the workspace (`calendar-clock.ts`); qa-b7-studio is configured UTC; read-only check of its `timezone` |
| TUL-1237 /es links | FIX | see above |
| TUL-896 / TUL-933 address | FIXTURE | G6 T1 single service with `where=["client"]`; 933 merged in #3992 |
| TUL-746 English descriptions | BLOCKER | needs the exact screen/URL; all 11 built-in designs have ES copy (`theme-gallery-builtin-copy`); the reward dialog title "Your free website" is plan-independent and may be the 'free' wording QA saw |

Verification: `npm run test:wt` on the touched tests (event-date-input 4/4, marketing-locale-hrefs guard 3/3,
mkt-b-mobile-polish 7/7, lineup-note-coalesce 31/31). No browser QA; user-visible items need Verify screenshots
ES + EN + 390px. tsc / eslint / i18n parity are left to CI (`full-ci`).
