# Confirm pass on 8e76b7a5b (local prod build, isolated Supabase fxlankepwnvelxjrahwk)

Build: exactly main 8e76b7a5b, `next start` :3008 (TALENT_AGENDA_V2=1, SUPPORT_DESK_ENABLED=1, CLIENT_ACCOUNT_HOSTS=agency, Cloudflare always-pass TEST Turnstile keys). PR #2865 (arrival live-check) NOT in build: run-6 throwaway accounts reused (A myself, B both, S studio, M2, D draft). Harness: run6-evidence.spec.ts with RUN6_ONLY per card (worktree confirm; spec edits: server-log path, TUL-157 media upload made non-fatal + longer waits). Every result below is labelled for 8e76b7a5b.

Harness note (captcha bypassed): the hub tenant 00000000-...-0002 captcha integration row (hcaptcha test key + custom secret, set 2026-10-09 01:40Z by another session) rejected every guest booking ("Completa la verificacion"). Two temporary borrows (provider -> none, env Turnstile always-pass applies) were made, both backed up, restored and verified identical (stable/_hub-captcha-backup*.json, _hub-captcha-before-after*.json, _hub-captcha-restore-verify*.txt; only updated_at differs). Bookings from those windows are marked "captcha bypassed" in their JSON. PM rule since: no more shared-row changes without asking.

| Card | Result | Evidence (stable/) | Facts |
|---|---|---|---|
| TUL-84 hours + tz | CONFIRMED on 8e76b7a5b | c01-* | B talent_booking_hours tz America/Mexico_City + weekly; B and S opening_hours saved; studio-only S has no timezone (settings.appointments null) |
| TUL-87 studio Assets | CONFIRMED on 8e76b7a5b | c02-* | "Mostrando 0 de 0", no role=alert, no media API errors |
| TUL-89 | CONFIRMED on 8e76b7a5b (caveat) | c03-* | no design: blocker "Aplica un diseno antes de publicar", Publish now disabled; with design enabled. Design restored by service role, UI apply not exercised |
| TUL-115 Horario | CONFIRMED on 8e76b7a5b | c04-* | toast "Disponibilidad guardada.", reload shows week, tz America/Cancun |
| TUL-118 header name | CONFIRMED on 8e76b7a5b | c05-*, TUL-118-header-* via c05 | name visible at 1440 and 390 |
| TUL-118/125 /en | PARTIAL on 8e76b7a5b | c-TUL-125-*, c05-* | /en 200, lang en, EN chrome + switcher, EN bio in About; hero paragraph still SPANISH bio. secondary_locales=['en'] set 25s after signup (21:48:05Z) |
| TUL-120 | CONFIRMED login/sign-out; Spanish empty state FAIL | c06-* | no banner/5xx; /talent/messages empty state is English "Nothing in this view" (#2925 not in sha) |
| TUL-123/138 talent sheet | CONFIRMED on 8e76b7a5b (captcha bypassed) | c11-* | Turnstile widget loads, no token refused, valid token accepted; arbitrary token also accepted (always-pass secret, invalid not provable). Chat BLOCKED (velocity). Without the borrow hub default hcaptcha shows instead |
| TUL-132 event_location | CONFIRMED on 8e76b7a5b (captcha bypassed) | c07-* | no delivery setting -> NULL; where=[studio] -> "En el estudio" |
| TUL-157 | CONFIRMED on 8e76b7a5b (talent D) | c08-*, c08e-* | roster active, services listed, upload via Agregar fotos 0->1, hero image ref, languages es. On A (already 1 photo) the "Agregar fotos" label is absent |
| TUL-451 both-owner booking | CONFIRMED on 8e76b7a5b (captcha bypassed) | c09-*, c-TUL-451-* | guest booking on B talent site creates inquiry (B's tenant) + order pending_payment; no "booked by request" refusal |
| TUL-433 /book request slot | CONFIRMED core on 8e76b7a5b (captcha bypassed) | c-TUL-433-* | request creates inquiry, no slot_taken text. Same-slot repeat/other guest not submittable: held slot vanishes from list. DEFECT: post-confirm page = "This page is no longer here" (see 481) |
| TUL-481 | QA-ENV ARTIFACT (captcha bypassed) | c-TUL-481-* | Set-Cookie impronta_guest is Secure; dropped over http -> /c/<id> 404. With Secure stripped in-flight the page lands on /c/<inquiryId>?instant_booked=1 thread; chromium insecure-origin flag does not help |
| #2901 calendar label | FAIL on 8e76b7a5b | c09-* (08-01-calendar.jpg) | items "Solicitud . no bloquea" / "Cliente sin nombre", 0 "Reservada" |
| #2900 Today language | CONFIRMED on 8e76b7a5b | c13-* | chrome es == content es (cookie absent and cookie=en), 0 hydration errors |
| #2900 clients tz | CONFIRMED on 8e76b7a5b | c14a-*, c14b-* | 0 hydration errors LA and Tokyo (run1 LA list slow = harness) |
| TUL-86 myself->both (A) | FAIL (old behavior, #2945 pending) on 8e76b7a5b | c16-* | "Something went wrong", forbidden capability=agency.site_admin.homepage.compose no_membership; A got owner membership in new tenant but no roster row there. studio->both (S) "Display name is required" |
| B workspace-site booking / studio booking | FAIL on 8e76b7a5b | c09-* | inquiry-only harness path, not diagnosed |
| #2929 client spec | FAIL = stack/host-kind (not proven defect) | c15-2929-* | host qa-r6-client.localhost is hub kind; CLIENT_ACCOUNT_HOSTS=agency leaves surface OFF (/account -> /client "No client account here"; /me legacy). Spec lines 84, 99, 151 fail; others skip. Guest user lands on /onboarding/role (no profile). Awaiting restart with agency,hub,talent for rerun |

Found along the way: stale shared state (hub captcha row), post-booking 404 card on workspace /book, hero bio not localized on /en, English empty state on Spanish /talent/messages.
