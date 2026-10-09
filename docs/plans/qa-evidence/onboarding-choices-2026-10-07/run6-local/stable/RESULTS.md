# Run 6 evidence: pre-merge integration (PR heads), isolated Supabase fxlankepwnvelxjrahwk

Stack: local production build of branch qa/run6-stack (origin/main batch 7h + PR heads #2865 #2903 #2901 #2900 #2921 #2945 #2953 #2954 #2925), TALENT_AGENDA_V2=1, PREVIEW_JWT_SECRET set, SUPPORT_DESK_ENABLED=1, Cloudflare always-pass TEST Turnstile keys, desktop 1440 unless noted. Every result below is **pre-merge integration (PR heads)**, not production.
Accounts (throwaway, qa-r6-*@impronta.test): A myself, M2 myself (then moved to both), S studio, B both (front door), D myself (TUL-89). Machine note: Supabase reads from this machine intermittently threw "fetch failed"/timeouts; the harness retries network errors and waits were raised; no product verdict depends on a timeout.
Files: this folder (run6-local/stable/). Logs/JSON per step in run6-local/work-N/.

## Per card

| Card | Result | Evidence (stable/) | Facts |
|---|---|---|---|
| TUL-125 /en | **FAIL** | TUL-125-home-en.png, -home-es.png, -hub-profile-en.png, TUL-125-result.json | bio_i18n has es+en, but secondary_locales=[] so /en = "Page not found"; ?lang=en shows Spanish h1; hub /t/<code>?lang=en shows Spanish bio |
| TUL-86 myself->both | **PASS** (#2945) | TUL-86-myself-both-*.jpg, -result.json | owner membership, roster active+site_visible, no "Something went wrong", no [how-you-work.move] log lines |
| TUL-86 myself->both, new workspace site | **FAIL** | TUL-86-myself-both-workspace-site-no-services.jpg | workspace site: "servicios aun no publicados", no hours, inquiry form only |
| TUL-86 studio->both | **FAIL** (fix card #2976) | TUL-86-studio-both-*.jpg, -result.json | "Display name is required." (how-you-work.server.ts:53 reads talent display name, null for a studio owner) |
| TUL-84 hours + timezone | **PASS** (note) | TUL-84-result.json | B talent hours+tz, B and S workspace opening_hours + business_place. Note: studio-only S stores no timezone (settings.appointments null) |
| TUL-77/82 'both' records, services | **PASS** | work-8 result (TUL-82-both-booking-result.json for booking) | 1 talent profile, owner membership, roster, published site, 2 talent + 2 workspace services |
| TUL-77 'both' bookable slot (talent site) | **FAIL** (#451) | TUL-82-both-talent-site-booked-by-request.jpg, TUL-82-both-booking-result.json | "This one is booked by request..." no booking created |
| TUL-77 studio with a provider bookable (B workspace site) | **FAIL** | TUL-123-studio-booking-page-no-captcha-widget.jpg | slots offered but captcha required with no widget, so booking impossible |
| #2901 / TUL-360 calendar "Reservada" | **FAIL** | TUL-360-calendar-solicitud-not-reservada.jpg, TUL-360-result.json | confirmed talent_bookings shown as "Solicitud . no bloquea" / "Cliente sin nombre" |
| phone re-login lands on Spanish dashboard | **PASS** | (work-8 step 11 JSON in work-8/results) | 390 wide, landed /<slug>/admin, 4 es markers, 0 en |
| retry creates nothing new | **PASS** (UI path limited) | work-7 results | /start reopened as signed-in B: row counts unchanged; arrival-retry button not reachable (no failed arrival) |
| TUL-118 header name (#2953) | **PASS** | TUL-118-header-1440.png, -390.png, TUL-118-header-result.json | name shown at 1440 and 390 |
| TUL-118 /en part | **FAIL** | (same as TUL-125) | /en 404 |
| TUL-132 event_location (#2954) | **PASS** | TUL-132-*.jpg, TUL-132-result.json | no delivery setting -> null; offering where=studio -> "En el estudio" (label, no typed address) |
| TUL-157 | **PASS** | TUL-157-*.jpg, TUL-157-result.json | roster active, services listed, media upload row, hero stock image, languages row |
| TUL-115 hours form | **PASS** | TUL-115-01..03*.jpg, TUL-115-result.json | tz Cancun saved, toast "Disponibilidad guardada.", reload shows the week |
| TUL-87 studio builder Assets | **PASS** | TUL-87-studio-assets-panel*.jpg, TUL-87-result.json | "Mostrando 0 de 0", no alert, no media API error |
| TUL-397 builder (talent + studio) | **evidence** | TUL-397-*.png, TUL-397-studio-*.png, *-facts.json | rails overlay hero at 768, topbar overflow + inspector over canvas at 390, blank frame at 100 ms after device switch, EN text in Spanish tablet panel; Mobile health row "Todo en orden" |
| TUL-89 | **PASS** (caveat) | TUL-89-*.jpg, TUL-89-result.json | blocker + disabled Publish with no design; enabled with design; UI "apply design" not achieved (service-role restore) |
| TUL-123/138 booking sheet | **PASS** (widget, no token refused, valid token accepted) | TUL-123-talent-sheet-*.jpg, -captcha-result.json | invalid token NOT PROVABLE with always-pass secret |
| TUL-123/138 chat | **BLOCKED** | TUL-123-chat-*.jpg | 2nd message not sent, velocity not reachable |
| TUL-123 studio booking page | **FAIL** | TUL-123-studio-booking-page-no-captcha-widget.jpg | "Please complete the challenge" with no widget; English labels; low contrast |
| TUL-120 | **PASS** | TUL-120-*.jpg, TUL-120-result-06/07/08.json, TUL-120-support-directive-stub.txt | no banner, Messages empty state Spanish, sign-out, AI-stubbed directive (support-ai-language.ts:20-25, route.ts:177) |
| #2921 rail switch | **FAIL** | TUL-303-2921-*.png | no Talent|Admin switch on /talent/today for both B and M2 (talent.tsx:229 needs state.alsoTalent); present on the admin rail |
| #2900 Today locale | **PASS** | TUL-2900-today-locale-result.json | chrome es == content es, cookie absent and cookie=en, no hydration error |
| #2900 clients dates | **PASS** (#418) | TUL-2900-clients-tz-run1/2-result.json | no hydration error in LA or Tokyo |
| #2929 client spec | **BLOCKED (stack env)** | 2929-rerun-registered-host-*.log, 2929-client_*.png, 2929-host-row.txt | Rerun on registered agency-kind host qa-r6-client.localhost:3107: 3 fail/4 skip, cause CLIENT_ACCOUNT_HOSTS unset (client account OFF, flag.ts): TUL-61 icon button not found (spec:81), TUL-62 nav link "visits" not found (spec:99), TUL-64 /me stays /me (spec:151). Needs server restart with CLIENT_ACCOUNT_HOSTS=agency. Throwaway agency_domains row 10334b31-9a28-48a2-9026-50b309a34576 could not be deleted (DB guard: subdomain rows are permanent); proxy 29622 stopped |
| TUL-93 emails | unproven: hook (TUL-333) | | |
| TUL-31 | skipped (closed) | | |

## TUL-16: choices x viewport (myself / studio / both, desktop 1440 / phone 390)

Run 4 = full front-door journey on main before these PRs (run4-local/results/*.json). Run 6 = this integration pass. "-" = not re-run on the integration branch in run 6 (only the steps listed in the cards above were repeated).

| Step | myself desktop (r4) | myself phone (r4) | studio desktop (r4) | studio phone (r4) | both desktop (r4) | both phone (r4) | Run 6 integration |
|---|---|---|---|---|---|---|---|
| front door | PASS | PASS | PASS | PASS | PASS | PASS | PASS (A, M2, S, B signups through the front door, desktop) |
| screens + email code | PASS | PASS | PASS | PASS | PASS | PASS | PASS (code minted; email hook TUL-333) |
| build + DB records | PASS | PASS | PASS | PASS | FAIL (workspace offering missing) | FAIL (same) | PASS for both (B: talent + house services, hours, roster): the run-4 gap is fixed on the integration branch |
| finish screen + URL real | PASS | PASS | PASS | PASS | PASS | PASS | PASS (finish links open) |
| sign out/in lands Spanish dashboard | PASS | FAIL (90 s) | FAIL (37 s > 15 s) | FAIL (90 s) | PASS | FAIL (90 s) | PASS on phone for both B (390 wide, es dashboard); myself/studio phone not re-run; TUL-120 sign-out PASS desktop |
| guest books a service | PASS | PASS | FAIL (no widget, inquiry-only) | FAIL | FAIL (no slot) | FAIL | myself A PASS (5 bookings); studio without provider = inquiry-only; **both talent site FAIL (#451)**, both workspace site slots shown but booking blocked by captcha-without-widget |

Summary of what is still open on the integration branch: TUL-125 /en, TUL-86 studio->both (#2976), TUL-86 myself->both workspace site empty, both talent-site booking (#451), #2901 calendar label, #2921 rail switch, studio booking page captcha, #2929 not provable locally.
