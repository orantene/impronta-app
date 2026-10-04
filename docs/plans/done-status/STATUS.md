Updated: 2026-10-04 16:40Z · Scoreboard: ✅ 7 / 🟡 62 / ❌ 15 / ⏸ 2 / ❓ 14
Live SHA: 15e65e2d5091 · origin/production: 15e65e2d5091 · Main SHA: 15e65e2d5091
**Ownership:** overnight done-board owner `bc-9c0ba4c9` (~10h, Oran offline). Sole STATUS writer on `status/done-board`. No Oran ping.
Top 3 blockers right now
1. Parked — **#45 fee-line** ❌ (seller-pays $101.50 LIVE charge / D15 still unproven). Soft Gel Preview PAID + LIVE Guardar smoke PASS do **not** clear #45.
2. Parked — Free **`QA_FREE_PASSWORD`** (Oran-only) blocks Free-persona drains that need that secret. Do not invent ✅.
3. **LIVE READY:** Live=prod=main `15e65e2d5091` / `dpl_3QPTZnu8…`. **#94 ✅**. Open: refunds BLOCKED · [#2477](https://github.com/orantene/impronta-app/pull/2477) do not merge · S5/S7 waiting `QA_JOR_CLONE_PASSWORD`. Portfolio: talent wall [`bc-73428b52`](https://cursor.com/agents/bc-73428b52-ec56-5670-bb98-eebbe2a889c0) IDLE — [#2490](https://github.com/orantene/impronta-app/pull/2490) MERGED on tip (no resume). Visual refresh [`bc-3c434583`](https://cursor.com/agents/bc-3c434583-99a4-513b-8bab-c9721cc398d6) IDLE — [#2491](https://github.com/orantene/impronta-app/pull/2491) MERGED on tip (no resume / no second worker). No Oran ping.

Rows are grouped by the 14 QA stories. Questions with no story stay ❓. ✅ only with Live proof (see below).

## Process — Live proof (required for ✅)

Every **✅ DONE** row requires **Live proof**:
1. Screenshot from production **`app.tulala.digital`** (never localhost), logged in as **TAL-93900** (Jor clone). Free-only rows that cannot apply to paid may use Free QA on `app.tulala.digital`, but the shot must still be live and linked.
2. Link or attach the shot in the Evidence column of this file (store `media/…` path or equivalent).
3. Tip SHA alone, code audit, CI green, or localhost = **not** ✅. Until the shot exists: stay **🟡** or mark **Live proof owed**.
4. Ops-only rows (e.g. open-PR inventory) may ✅ without a talent screenshot when Evidence is the live GitHub list — still never localhost.
5. `REPLIES.md` is Claude-owned — agents do not overwrite it. Record STATUS deltas here; Oran/Claude replies go in REPLIES.


## Story 1 — Sofía opens her business (S1)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 1 | Register, verify, land in onboarding | 🟡 | **Fresh signup tip-prove PASS** 2026-10-04 LIVE `07200ab` (#2516): `qa-fresh-20261004-e@impronta.test` → **TAL-93937** — signup_intent + talent role + no role loop; Free Presence OK. Evidence `docs/theme-release-and-fresh-signup.md` + `media/theme-release-signup/` (`signup-tip-prove.json`, `s30-talent-site.png`, `s40-dashboard.png`). | **Not full-story ✅** — tip-prove PASS recorded; broader S1 onboarding/publish still open. Stay 🟡. | S1 steps 1–2 | — | 2026-10-04 |
| 2 | Onboarding ends on a published own URL | ❌ | Code audit 2026-10-02: talent path ends at `finish_my_page` / photos and does not auto-publish an own URL. | No published talent URL is created at the end of onboarding. | S1 step 5 | — | 2026-10-03 |
| 3 | AI pick or gallery applied in onboarding | ❌ | Code audit 2026-10-02: style tiles are business-only. Talent onboarding skips the design step. | Talent signup has no AI pick and no gallery choose-and-apply. | S1 step 4 | — | 2026-10-03 |
| 4 | Every trade gets sensible defaults | ❌ | Code audit 2026-10-02: stated-service drafts only. No per-trade packs for beauty, wellness, chef, creative, technical. | Default services, copy, and imagery are not seeded per trade. | S1 step 3 | — | 2026-10-03 |
| 5 | 18+ rule enforced and explained | 🟡 | Cloud Chrome 2026-10-03 (`internal/done-walks-latest.md`): ES `/es/register?as=talent` — 18+ checkbox `required`; unchecked + Crear → stay on register; `validationMessage` “Please check this box…”. Shots `media/done-walks/a05-20-ready.png`, `a05-21-after-create-click.png`. Live tip `c4f0a097a`. | **Live proof owed** — register shots exist (`media/done-walks/a05-*`) but not TAL-93900 on `app.tulala.digital`. | S1 step 2 | — | 2026-10-03 |
| 6 | Free plan live with no approval wait | 🟡 | **Fresh signup tip-prove PASS** LIVE `07200ab`: TAL-93937 Free Presence OK after register (`docs/theme-release-and-fresh-signup.md`, `media/theme-release-signup/s40-dashboard.png`). | Tip-prove PASS; full Free publish path not separately ✅ this pass. Stay 🟡. | S1 step 5 | — | 2026-10-04 |
| 7 | Stop halfway and resume tomorrow | 🟡 | Resume machine plus e2e exist on main. | Not walked: close mid-services, log back in, land on that step. | S1 step 6 | — | 2026-10-03 |
| 8 | Whole ES flow, no English leaks | 🟡 | Onboarding key parity is in code. | No full ES walk of signup through the live site. | S1 check (ES, phone and desktop) | — | 2026-10-03 |
| 11 | “What to do next” on a new home | 🟡 | `FirstSessionChecklist` on Today (`TodayPage.tsx`). | Not seen on a brand-new talent home, ES or EN. | S1 check | — | 2026-10-03 |
| 15 | No placeholder data on a real dashboard | ✅ | Live wall re-proof 2026-10-03 (`internal/stories-qa-oct3.md`): TAL-93900 on `app.tulala.digital` — Today/Services/Money/Inbox load with no “Profile created — you're in!” / roster wall (`media/stories-qa/s3-wall-*.png`). #2490 ancestor of live tip `c4f0a097a` (HTML sentry-release + Vercel `dpl_BR3mdrA163SmKuHfVqZFeEPHTNxD`). **Live proof:** TAL-93900 on `app.tulala.digital` — `media/stories-qa/s3-wall-*.png`. | None for wall. Broader placeholder hunt not a separate fail this pass. | S1 check | — | 2026-10-03 |
| 54 | Free site is one page and publishes | 🟡 | Cloud Chrome CDP 2026-10-03 20:22Z Free Diego TAL-QAFIXFREE tip `7d30bb9d1` (`internal/done-bar-drain-2004.md`): Plan GRATIS; Today **Tu sitio está en línea** → `qa-fixture-free-talent.tulala.digital`; builder Páginas = **Tu sitio INICIO / Editando ahora**; `hasNewPageCta=false`. Public Free Diego + Valeria HTTP 200, sentry-release `7d30bb9d1…`. Shots `media/done-walks/d54-*`. | **Live proof owed** — Free Diego one-page publish shots (`media/done-walks/d54-*`); Free QA live, but re-attach under Live-proof rule for ✅. | S1 step 5 | — | 2026-10-03 |

## Story 2 — Valeria on the Free plan (S2)

**Free Builder Valeria PASS** + Done walks + Free avatar menu PASS + Pass B settings/quote walks 2026-10-03 19:30Z: TAL-93901 / Free Diego on live tip — Plan GRATIS; site live at `valeria-unas.tulala.digital`; `/talent/page-builder` opens. Evidence: `internal/free-builder-valeria-s2.md`, `internal/done-walks-latest.md`, `internal/done-walks-pass-b-1915.md`, `media/done-walks/`, `internal/free-avatar-menu-live.md`, `media/free-avatar-menu/`. Avatar [#2492](https://github.com/orantene/impronta-app/pull/2492) **LIVE**. **#13 ✅** on tip `56f0c147d` via [#2506](https://github.com/orantene/impronta-app/pull/2506) TAL-93900 Live prove. **#55/#57/#59 → 🟡 Live proof owed**.

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 13 | Avatar links Site, Builder, Money, Messages, Settings | ✅ | [#2506](https://github.com/orantene/impronta-app/pull/2506) **LIVE PASS** 2026-10-04 tip `56f0c147d` (`dpl_AmBn9M3…`): TAL-93900 on `app.tulala.digital` — account menu open; subtitle **`TAL-93900`** (not generic “Talent”); links Mi sitio web · Constructor · Dinero · Mensajes · Ajustes. **Live proof:** `media/pr-2506-avatar-menu/tal-93900-avatar-menu-open.png`, `media/pr-2506-avatar-menu/tal-93900-subtitle-closeup.png`; note `internal/pr-2506-merge-prove.md`. Prior Free Valeria/Diego shots remain supporting (`media/free-avatar-menu/`, `media/done-walks/b13-*`). | None for avatar menu destinations + TAL subtitle on TAL-93900. | S2 step 1 | — | 2026-10-04 |
| 55 | Free Add and Move blocked in UI and server | 🟡 | Cloud Chrome Free Diego (`internal/done-walks-latest.md`): Agregar banner “Disponible en Oficina Web” + Add/Move/duplicate/paste locked; Estructura “Disponible en Oficina Web”. Shots `media/done-walks/a55-04-add-panel.png`, `a55-20-structure.png`. [#2495](https://github.com/orantene/impronta-app/pull/2495) on tip `c4f0a097a`. | UI lock proven. Server reject not separately hit — not blocking ✅ for this row. **Live proof owed** — Free Diego Add/Move lock shots (`a55-*`); re-prove/link under Live-proof rule for ✅. | S2 steps 3–5 | — | 2026-10-03 |
| 57 | Builder back arrow to dashboard, no new pages | 🟡 | Cloud Chrome (`internal/done-walks-latest.md`): `a[aria-label="Volver a mi panel"]` → `/talent/site` (`a57-41-back-control.png`, `a57-42-after-back.png`). Páginas: single INICIO; `has_new_page_cta=false` (`a57-40-pages-detail.png`). Live tip `c4f0a097a`. | **Live proof owed** — Free builder back/no-new-page shots (`a57-*`); re-prove/link under Live-proof rule for ✅. | S2 step 2 | — | 2026-10-03 |
| 59 | Website Settings change the live site | 🟡 | Pass B Cloud Chrome Free Diego (`internal/done-walks-pass-b-1915.md`, `internal/done-walks-latest.md`): Chat del sitio OFF → Guardar → DB `chat_enabled=false` → public `qa-fixture-free-talent.tulala.digital` `.tl-fab` **0**; restore ON → DB true → public `.tl-fab` **1**. Evidence `media/done-walks/b59c-*`, `b59-roundtrip.json`, `b-result.json`. Emergencies is immediate-write (not draft/Save). Live tip `c4f0a097a`. | **Live proof owed** — Free Diego Website Settings round-trip shots (`b59*`); re-prove/link under Live-proof rule for ✅. | S2 step 6 | — | 2026-10-03 |

## Story 3 — Jor services and money setup (S3)

Wall **PASS** live on tip (`internal/stories-qa-oct3.md`): TAL-93900 Today/Services/Money/Inbox — no PROFILE CREATED wall. Pass C **#16 ✅**. **#44 ✅** — clone login Money shows **Stripe · verificada** (`media/cloud-stripe-s4-s7/t93900-03-money.png`; tip proved on `10698158d`, ancestor of live `c3214cac3`). S4 inquire PASS on custom site. Soft Gel money **PAID PASS** (`cs_test_`/`dd7c`). Preview Soft Gel inquiry Checkout **PAID** `/pay/98fy…` + dock Paid stamp (`qa-stripe-r2`, `cs_test_`). **Agenda pay-link LIVE PASS** prior tip `bc4ef146`. [#2525](https://github.com/orantene/impronta-app/pull/2525) **LIVE** tip `2982c647`/`dpl_9JkaxLvk…` — Soft Gel LIVE **Guardar smoke PASS** (identity confirmed · talent pool scoped) [`bc-732572d4`](bc-732572d4) · `internal/front-chat-tip-prove/softgel-2525-live-optional-smoke-PASS.md`. Prior Oran→TAL-JORGBEAUTY “Not set up” was wrong persona.

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 16 | Create, edit, reorder, hide, delete a service | ✅ | Pass C Cloud Chrome Jorg (`internal/done16-services-draft-pass-c.md`, `internal/done-walks-latest.md`): list 24→25; Agregar → Un servicio → Continuar → Nombre `QA Walk 09966` → Guardar borrador → **Borradores 1** row visible; SQL `talent_offerings` `418f0431-cf33-4203-9087-ef2826fe1c2c` `status=draft`. Evidence `media/done-walks/c16-*`, `c16-result.json` PASS. Prior Pass B 🟡 was name typed into Opciones y extras (not product). Live tip `c4f0a097a`. **Live proof:** TAL-93900/Jorg on live app — `media/done-walks/c16-*`. | Create/draft proven. Edit/reorder/hide/delete not separately walked this pass — create path unblocks the row. | S3 step 1 | — | 2026-10-03 |
| 17 | Edits show on the public site and in chat | ✅ | Cloud Chrome CDP 2026-10-03 ~20:58Z tip `7d30bb9d1` (`internal/done-bar-drain-2004.md`): saved edit Soft Gel → `Soft Gel QA17 2004` (title + title_i18n); public `/t/TAL-93900` shows marker (`d17c-20-selected.png`, `d17e-10-public.png`); guest chat dock **PREGUNTA POR UN SERVICIO** chip **Soft Gel QA17 2004 · 500 MXN** (`d17e-30-chat-chips.png`, `done-walk-17-softgel.json` PASS). **Live proof:** TAL-93900 public + chat — `media/done-walks/d17*`. | None for edit→public+chat. UI editor click flaky this pass; saved DB edit + live force-dynamic catalog proven. | S3 step 2 | — | 2026-10-03 |
| 18 | Quote services never open the booking sheet | 🟡 | Pass B Cloud Chrome Jorg (`internal/done-walks-pass-b-1915.md`): `jorg-beauty-qa.tulala.digital` → Novias → “Novia completa… A cotizar” → Continuar opens **chat inquire** (“Hola, soy Jorg”, PREGUNTA SOBRE…), not TU RESERVA day/slot strip. Evidence `media/done-walks/b18i-30-after-continuar.png`, `b18-final.json`, `b-result.json` (#18 PASS_NO_BOOKING_SHEET). Live tip `c4f0a097a`. | **Live proof owed** — quote→inquire proven on `jorg-beauty-qa.tulala.digital`; need TAL-93900 shot from `app.tulala.digital` / live public path linked for ✅. | S3 step 3 | — | 2026-10-03 |
| 19 | ES and EN names survive save | 🟡 | `OfferingTextFields` plus `i18nPair` tests on main. #2490 ancestor of live `c4f0a097a`. | Not saved and reloaded on TAL-93900 after wall promote. | S3 step 1 | — | 2026-10-03 |
| 20 | Where it happens, plus travel rules | 🟡 | Per-service where (studio / client / remote) and travel defaults in the editor. | Not set on a service and checked on the public site. | S3 step 1 | — | 2026-10-03 |
| 44 | Stripe US Express status in the dashboard | ✅ | Cloud Chrome 2026-10-03 22:53Z tip `10698158d` (ancestor of live `c3214cac3`): login `demo-jor-clone@impronta.test` → TAL-93900 Money **Cuenta de depósito: Stripe · verificada**; Payouts **You're set up to get paid** (`acct_1UMWx66rgXLXa1cy`). Evidence `media/cloud-stripe-s4-s7/t93900-03-money.png`, `t93900-04-payouts.png`, `internal/cloud-money-s4-s7-live-prove.md`. Prior Oran→TAL-JORGBEAUTY “Not set up” = **false positive** (wrong TAL). **Live proof:** TAL-93900 on `app.tulala.digital`. | None for status display. Paid book still blocked by guest hCaptcha (separate rows). | S3 step 4 | — | 2026-10-03 |

## Story 4 — Carla books and pays (S4)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 21 | Client books a slot and sees a true status | 🟡 | Custom-site inquire **PASS** (`internal/story-04-jor.md`): `jorg-beauty-qa.tulala.digital` → Manicure Gel QA → **Solicitud recibida** for `qa-story04-guest@impronta.test` (no “Directory is not configured.”). Live inbox still shows **QA Guest Story04** (`internal/stories-qa-oct3.md`, `internal/story-05-07-jor-live-retest.md`). Live tip `c4f0a097a`. | Guest book → Accept → paid status not completed (inquiry-mode / day slot / payouts). Not ✅. | S4 steps 1–2 | D19 | 2026-10-03 |
| 22 | Accept, decline, reschedule, cancel from Agenda | 🟡 | `AgendaBookingRecord` actions on main. `TALENT_AGENDA_V2` defaults off. #2490 ancestor of live `c4f0a097a`. | Not clicked. Accept was not run on live paid path. | S4 step 3 | — | 2026-10-03 |
| 23 | Double booking is impossible | 🟡 | #2468 is an ancestor of live production `0972d4f0a`. DB exclusion covers agenda, holds, and chat proposals. | Same slot was not booked twice from a second guest. No live check, so this is not ✅. | S4 step 7 | — | 2026-10-03 |
| 28 | Confirmation and reminder messages | 🟡 | Booking and reminder templates plus cron exist on main. | No live booking email or in-app reminder checked for language and branding. | S4 step 5 (client side) | — | 2026-10-03 |
| 33 | Thread stays in sync with Agenda and Money | 🟡 | Messages v5 record chips (`context-view.ts`, `payment-view.ts`). Flag `NEXT_PUBLIC_MESSAGES_V5` / Studio v2 defaults off. | No paid thread compared with Agenda and Money. v5 may be off in production. | S4 step 5 | — | 2026-10-03 |
| 45 | $100 seller-pays charges $101.50; talent nets the rest | ❌ | Soft Gel **Preview** inquiry Checkout **PAID** `cs_test_` `/pay/98fy…` + dock Paid [`bc-0b8a62bd`]. Identity+Solicitar Preview PASS `qa-3`. **Agenda pay-link LIVE PASS** prior tip `bc4ef146` (`internal/agenda-paylink-live-prove-bc4ef.md`) [`bc-8fd43dbf`]. Tip LIVE `2982c647`/`dpl_9JkaxLvk…` — Soft Gel LIVE **Guardar smoke PASS** (identity confirmed · `owner_talent_profile_id` scoped) [`bc-732572d4`](bc-732572d4) · `internal/front-chat-tip-prove/softgel-2525-live-optional-smoke-PASS.md` · `media/front-chat/softgel-live-2982-identity-confirmed.png`. Fee $101.50 unproven (D15). **Not #45 ✅**. | Seller-pays fee-line $101.50 LIVE charge prove. | S4 steps 4–5 | D15 | 2026-10-04 |
| 48 | Receipts and PDFs show fee lines and non-refundable | 🟡 | #2482 is an ancestor of live production `0972d4f0a` (`feat(api)/: receipt PDF fee lines + non-refundable note`). Confirmation copy already had fee lines. | Not ✅ until a live receipt PDF from a paid booking. | S4 step 5 | — | 2026-10-03 |
| 49 | Money totals: earned, owed, cash, pending | ❌ | TAL-93900 Money tip `10698158d`/live `c3214cac3`: Cobrado $0 / empty Pagos after captcha-blocked S4 (`media/cloud-stripe-s4-s7/t93900-03-money.png`, `t93900-s4-10-money-after.png`). KYC verified but no PAID booking. | Need PAID booking first. Not ✅. | S4 step 6 | — | 2026-10-03 |

## Story 5 — Carla asks for a refund (S5)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 26 | Cancel paid shows refund pending, then an action | 🟡 | KYC verified on TAL-93900 (`#44 ✅`). Cloud S5 22:53Z tip `10698158d`: no paid booking; Refund control not found on empty Money (`media/cloud-stripe-s4-s7/t93900-s5-*.png`, `internal/cloud-money-s4-s7-live-prove.md`). Guest pay still captcha-blocked. | Not ✅ until paid refund walk evidence. | S5 step 1 | — | 2026-10-03 |
| 47 | Refunds net of fees, partial, block if fee unknown | 🟡 | Refund engine on live tip. Cloud S5 FAIL — no online PAID (`bc-0d95ddb3`; captcha). | A5.3 not evidenced. Not ✅. | S5 steps 2–4; also S6 step 3 | — | 2026-10-03 |

## Story 6 — Diego pays the card fee (S6)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 46 | Client-pays fee charges about $104.84; talent gets $100 | ❌ | TAL-93900 tip `10698158d`: fee toggle → **Mi cliente la paga** walked + seller restored (`media/cloud-stripe-s4-s7/t93900-s6-01-client-pays.png`, `t93900-s6-02-restored.png`). Guest Continuar al pago **hCaptcha** again — no ~$104.84 (`internal/cloud-money-s4-s7-live-prove.md`). | Guest captcha blocks charge. Not ✅. | S6 steps 1–3 | — | 2026-10-03 |

## Story 7 — Offer, pay, and control in the thread (S7)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 27 | Accepting an offer never duplicates the booking | 🟡 | `ensureOfferBooking` on tip. Cloud S7 22:53Z TAL-93900 inbox loads (0 conversaciones) — no offer→pay (`media/cloud-stripe-s4-s7/t93900-s7-01-inbox.png`). KYC verified; pay path still unproven. | Not accepted twice / counted. Not ✅. | S7 step 3 | — | 2026-10-03 |
| 30 | Client chats; talent replies from /talent/inbox | 🟡 | Prior Story04 thread PASS. Cloud re-prove tip `10698158d`: inbox shell PASS, **0 conversaciones** this session (`media/cloud-stripe-s4-s7/t93900-s7-01-inbox.png`). | Need client message + reply + offer→pay. Not ✅. | S7 steps 1–2 | — | 2026-10-03 |
| 31 | Talent sends an offer; client accepts in chat | 🟡 | `OfferEditor` and `ClientOfferCard` accept/decline, behind the v5 flag. | Not sent and accepted in a live thread. | S7 steps 2–3 | — | 2026-10-03 |
| 32 | Accept, decline, reschedule, cancel, pay link inside the thread | 🟡 | Pay, cancel, confirm, and offer sheets are wired. In-thread reschedule is incomplete (`ThreadCards` appointment card only opens the record). | Full set not clicked in one thread. Reschedule still depends on Agenda. | S7 steps 4–5 | — | 2026-10-03 |
| 34 | Net split and fee lines on the chat pay card | 🟡 | Fee lines in `ClientCards.tsx` plus a render test. Talent net stays in the offer editor. | Not seen on a live payment card. v5 flag defaults off. | S7 step 6 | — | 2026-10-03 |
| 35 | Gear drawer: tips and payout preference | 🟡 | `MessagesSettingsDrawer`: fee-payer tip, payout method, booking mode. | Not opened in a production thread. | S7 step 6 | — | 2026-10-03 |
| 36 | Push or email opens the right thread | 🟡 | Email catalog links to `/talent/inbox/{id}`. Push is a no-op without VAPID. | No notification opened from a real new message. | S7 step 7 | — | 2026-10-03 |
| 37 | Talent language and client language | 🟡 | Shell and system lines are ES/EN. User-written bodies are not auto-translated. | Not compared in one ES talent thread and one EN client thread. | S7 steps 1–2 | D18 | 2026-10-03 |

## Story 8 — Book by chatting with the AI (S8)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 38 | Client books end to end with the AI assistant | ❌ | Guest “booking assistant” is a scripted dock. No LLM booker under `app/t/[profileCode]/_chat/`. | No assistant that picks a service, a time, and confirms. | S8 steps 2–3 | — | 2026-10-03 |
| 39 | AI sends a real pay link; PAID only after the webhook | ❌ | Human pay links and Stripe webhooks exist. Nothing AI-side mints a pay link. | No AI pay-link message and no webhook flip driven by that chat. | S8 steps 3–4 | — | 2026-10-03 |
| 40 | AI does not invent prices or slots; hands off when unsure | ❌ | No booking-AI policy layer. Scripted dock only. | No handoff when the guest asks for something outside the catalog. | S8 steps 2 and 5 | — | 2026-10-03 |
| 41 | Talent can see and override what the AI did | ❌ | No AI action trail in the thread. | Nothing to override. | S8 step 6 | — | 2026-10-03 |
| 42 | MCP / agent-to-agent booking live | ⏸ | Not started. Checklist and execution map: owner go required. | Oran has not released MCP booking. | S8 note: stays paused | — | 2026-10-03 |
| 43 | Per-talent on/off for the AI assistant | ❌ | `chatEnabled` is a chat switch, not an AI-assistant switch. | No AI assistant toggle on the talent. | S8 step 1 | — | 2026-10-03 |

## Story 9 — Mariana’s day on her phone (S9)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 24 | Bookings with no time show “Sin hora” | 🟡 | #2468 (Today-strip label) is an ancestor of live production `0972d4f0a`. | Not seen on a phone at 390px. | S9 step 2 | — | 2026-10-03 |
| 25 | Finish → Card creates the order and pay link | 🟡 | **Agenda Pedir depósito LIVE PASS** 2026-10-04 tip `bc4ef146`/`dpl_DyXANx6` TAL-93900: Soft Gel `#2E0BA062` → `already_paid` (resolve) + unpaid Bozo `#40EB1A75` mint `/pay/28v74…` (`internal/agenda-paylink-live-prove-bc4ef.md`, `media/agenda-paylink/`) [`bc-8fd43dbf`]. | **Not full-row ✅** — Finish→Card phone path not walked; mint/resolve proved on Agenda Pedir depósito. Stay 🟡. | S9 step 3 | — | 2026-10-04 |
| 29 | Today and week are clear on a phone | 🟡 | Agenda phone layouts exist. | No 390px pass on `qa-agenda-jor`. | S9 step 1 | — | 2026-10-03 |
| 50 | Cash or transfer shows in the ledger after reload | 🟡 | `MoneyRecordPaymentPanel` on main. Live tip `c4f0a097a`. | Not recorded, reloaded, and checked on TAL-93900 Money. | S9 steps 4–5 | — | 2026-10-03 |

## Story 10 — Jor makes the site hers (S10)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 56 | Paid plan can add, move, duplicate, remove sections | 🟡 | Web Office grants `personalSiteSections`. Navigator can duplicate, move, and remove. | Not done on a paid talent in the builder. | S10 step 1 | — | 2026-10-03 |
| 58 | Font, size, colour, and shape are editable | 🟡 | Style panel covers text, font, size, and colour. | Not every token and shape of every design is editable. Not published and rechecked. | S10 step 2 | — | 2026-10-03 |
| 60 | Custom domain with clear ES and EN errors | ⏸ | Oran **owner-parked** registrar buy — do not add Vercel registrar tokens to production. Diagnosis: `internal/domain-search-diagnosis.md`. Buscar Coming-soon UX [#2500](https://github.com/orantene/impronta-app/pull/2500) **LIVE** on tip `7d30bb9d1` (HTML sentry-release + Vercel `dpl_4PfJ2pUWbcq4UxKVjTWfKS9mk2PV`; code: `DomainSetupDrawer` Coming soon / Próximamente when token missing). Evidence: `internal/domain-buscar-coming-soon.md` + `internal/domain-buscar-coming-soon-live.md`. Connect + Get help remain the live paths. | Registrar buy stays owner-parked — **not ✅ for buy**. Coming-soon UX is live. | S10 step 4 | — | 2026-10-03 |
| 61 | SEO: title, description, canonical, sitemap, hreflang | 🟡 | Cloud Chrome Valeria (`media/done-walks/a61-10-valeria.json`): title `Valeria Uñas · Tulala`; canonical `…/es`; hreflang en/es/x-default; description present (platform-generic). Sitemap previously 200. Live tip `c4f0a097a`. | **Live proof owed** — Valeria SEO JSON/shot; need TAL-93900 (or named public) live shot linked for ✅. | S10 step 5 | — | 2026-10-03 |
| 63 | Legal footer links use the right language | 🟡 | Cloud Chrome (`internal/done-walks-latest.md`): Valeria footer hrefs include `tulala.digital/es/legal/{terms,privacy,cookies,refunds}` (`a61-10-valeria.json` legal[]; `a63-14-valeria-footer.png`). Direct ES Terms/Privacy title-correct (`a63-12-terms-es-direct.png`, `a63-13-privacy-es.png`). | **Live proof owed** — Valeria footer shots; need TAL-93900 (or named public) live shot linked for ✅. | S10 step 6 | — | 2026-10-03 |
| 71 | Switch theme without losing content | 🟡 | `applyDesign` keeps profile and services and replaces the custom page tree. | Theme switch not done on TAL-93900. Builder edits would be replaced. | S10 step 3 | — | 2026-10-03 |

## Story 11 — Ship a template, talents get it (S11)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 64 | Several talent templates at once in Builder Lab | 🟡 | Builder Lab talent-design drafts, separate from agency starters (`theme-template/new-design.server.ts`). **Factory author BLOCKED** 2026-10-04 — `QA_PLATFORM_ADMIN_PASSWORD` missing; `/platform/admin/builder-lab` as talent → 404 (`docs/theme-release-and-fresh-signup.md`, `media/theme-release-signup/07b-factory-as-talent.png`). | **Do not ✅** — Factory author/release blocked on admin password. | S11 step 1 | — | 2026-10-04 |
| 65 | Edit against the mockup and release (Theme Studio) | 🟡 | Lab edit and release exist. **Factory author BLOCKED** — admin password missing (`docs/theme-release-and-fresh-signup.md`). Consumer ThemeUpdateNotice path used already-open release. | **Do not ✅** — author → Publicar → Open to talents not walked. | S11 step 2 | — | 2026-10-04 |
| 66 | “Update available” and a one-click upgrade | 🟡 | **Theme consumer tip-prove PASS** LIVE `07200ab`: TAL-93900 Maison v2 **21→23** — notice → preview → apply (`media/theme-release-signup/02-presence-notice.png`…`05-after-apply.png`; `docs/theme-release-and-fresh-signup.md`). | Tip-prove PASS; Factory author still BLOCKED — not full S11 ✅. Stay 🟡. | S11 step 3 | — | 2026-10-04 |
| 67 | Upgrade keeps content, previews, and undoes | 🟡 | **Tip-prove PASS** LIVE `07200ab`: preview kept Jorg content; apply kept hero/services (`04b-draft-preview-content.png`, `05-after-apply.png`). Undo not separately walked. | Content/preview PASS; undo not proven. Stay 🟡. | S11 step 3 | — | 2026-10-04 |
| 68 | Demos pick up the new template version | 🟡 | **Tip-prove PASS** LIVE `07200ab`: Alba + TAL-93020/02/03 pinned maison-v2 **v23** (`06d-demo-alba-host.png`, `06e-demo-profile.png`). **Active non-board:** Builder Lab↔demos mapping [`bc-abdc6901`](bc-abdc6901-14d0-5ac6-93f8-4bfdf552e652) (apply/rebuild click-path) — **do not invent ✅**. | Tip-prove PASS on sample demos; mapping/rebuild walk still open. Stay 🟡. | S11 step 4 | — | 2026-10-04 |
| 69 | About 32 themes, distinct and mobile-clean | ❌ | Finished gallery slugs are 4: maison, maison-v2, folio, gridline (`FINISHED_GALLERY_SLUGS`). | Far short of ~32. Fixture and mobile issues are still in the gallery audit. | S11 step 5 | — | 2026-10-03 |
| 72 | Free and generated images are platform stock | 🟡 | Platform stock library and HQ stock admin exist. AI files land in Lifestyle. | Talent picker is talent-scoped media, not stock-first. | S11 step 5 | — | 2026-10-03 |
| 78 | 224 demos, each with a unique theme | ❌ | Workbook foundation targets 224. Curated live demos are about 11. Finished designs are 4, shared across demos. Sample `/t/TAL-91001` and `/t/lucia-navarro` were HTTP 200 on 2026-10-02. **Active non-board:** `{slug}-demo.tulala.digital` host suffix [`bc-345dbdcf`](bc-345dbdcf-d9e7-54a9-a775-663eee7f08c9) (bare slugs live; `-demo` never seeded) — **do not invent ✅**. | They are not 224 unique live themes; `-demo` hosts not LIVE. | S11 step 5 | — | 2026-10-04 |
| 79 | One command rebuilds demos only | 🟡 | `npm run demos:rebuild` refuses non-demo identities. | Not re-run this pass. | S11 step 4 | — | 2026-10-03 |
| 80 | Demo pages show name, city, languages, mode, apps | 🟡 | Live profile fields feed the public page. Gallery cards still omit city, languages, booking mode, and apps. | Five random demos were not opened for that set. | S11 step 5 | — | 2026-10-03 |

## Story 12 — Sofía adds Nail Designer (S12)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 73 | Apps tab: suggested for the trade, plus all apps | 🟡 | `AppsTab` and `appsForTrade`. Library has one app, Nail Designer. | Not opened as a nail talent. “All apps” is that one app. | S12 step 1 | — | 2026-10-03 |
| 74 | Turn on Nail Designer and see it on the site | 🟡 | **Maison tip-prove PASS** 2026-10-04 ~03:13Z LIVE HTML `3a74b3ab` ([#2511](https://github.com/orantene/impronta-app/pull/2511)): `#nail-designer` on `book-jorgelina` desktop+390 vs `camila-nails`; `/es` 302 + `locale=es`. Evidence `media/maison-v2-hydration/tip-prove/`; report `internal/maison-v2-tip-prove-pass-3a74.md`. **Edit tip-prove PASS** 03:43Z on LIVE `07200ab` (#2510 ancestor) — bare builder / Exit flush / no You-is (`docs/edit-site-tip-prove-pass.md`, `media/edit-site-prove/`). **Captcha tip-prove FAIL** 03:41Z on LIVE `07200` (`docs/guest-captcha-off-prove-fail-07200ab.md`). | **Not full gate ✅** — Apps-tab “turn on” not walked; captcha hotfix + money/A3 still open. Stay 🟡. | S12 step 2 | — | 2026-10-04 |
| 75 | Nail Designer matches the owner design | 🟡 | Tip-prove shots show Nail Studio ES UI on LIVE `3a74b3ab` (`media/maison-v2-hydration/tip-prove/jor-desktop/04-nail-designer.png`). Island parity tests remain. | Client send-with-booking not walked. **Not full gate ✅**. | S12 step 2 | — | 2026-10-04 |
| 76 | Apps and templates link both ways | 🟡 | One-way hints: `recommendedDesigns: ["maison-v2"]`. | Dead ends remain. Folio and Gridline barely show Apps. | S12 step 3 | — | 2026-10-03 |
| 77 | Premium apps marked and gated | ❌ | Pro pill renders when `premium: true`. Nail Designer is `premium: false`. Comment in `apps-registry.ts` says the plan gate comes later. | No premium app and no plan gate. | S12 step 3 | — | 2026-10-03 |

## Story 13 — A client needs help (S13)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 81 | demo.tulala.digital inboxes receive mail, including resets | 🟡 | Demo domain verified. Inbound to `c4test@demo.tulala.digital` stored and `forward_status=sent` at 2026-10-02T23:24:13Z (subject `C4-demo-fix 2026-10-02T23-24-09-028Z`). | Password reset still fails: Supabase `email rate limit exceeded` (project-wide). Reset mail did not arrive. | S13 step 5 | D16 | 2026-10-03 |
| 82 | hello@, help@, and support@ receive mail | 🟡 | C4 2026-10-02: `hello@` + `help@` stored+forwarded. Recheck 2026-10-03 21:00Z: MX `tulala.digital` → `inbound-smtp.us-east-1.amazonaws.com`; SQL `resend_inbound_emails` hello=3 help=1 **support=0**. | No `support@` inbound row yet. This VM lacks decrypted `RESEND_API_KEY` to send a fresh probe. Stay 🟡. | S13 step 4 | D17 | 2026-10-03 |
| 83 | Stripe support email is hello@ on both accounts | ❌ | Dashboard checklist is still unchecked for US and MX, live and test. No code path sets the Stripe support email. | Oran-only Dashboard clicks. Not started. | S13 (Oran clicks, not a story step) | — | 2026-10-03 |
| 84 | Transactional mail: right language and brand | 🟡 | EN/ES templates for booking, payment, reminder, and password reset are on main. | No booking or payment mail opened from a live talent flow. Reset send is rate-limited. | S13 step 6 | — | 2026-10-03 |
| 85 | Talent can choose which notifications | 🟡 | `TalentNotificationsDrawer` saves prefs. Keys are `new-offer`, `hold-expiring`, and similar, not the catalog category ids the dispatcher reads. | Toggles may not change what is sent. Not proven with one real event. | S13 (own: toggle one pref, trigger the event) | — | 2026-10-03 |
| 86 | Support from the dashboard or site: AI, then a human | 🟡 | Launchers and `/api/ai/support-chat` plus `requestHumanAction` are on main. `/support` was HTTP 200 on 2026-10-02. | Not walked as a talent or a guest through AI then human on production. | S13 steps 1–2 | — | 2026-10-03 |
| 87 | Owner works support in the Desk, including hello@ | 🟡 | [#2505](https://github.com/orantene/impronta-app/pull/2505) on Live tip HTML `56f0c147d`. `SUPPORT_DESK_ENABLED` **ON** (leave ON). Prior Oran soft Page not found on older tip (`media/oran-live-sweep/13-desk.png`). **Live proof owed** — fresh authed `support.tulala.digital/desk` PASS shot not yet attached. [#2477](https://github.com/orantene/impronta-app/pull/2477) do not merge. | Authed Desk portal / hello@ walk not re-proved on current Live tip. Not ✅. | S13 step 3 | — | 2026-10-04 |
| 88 | Tickets show plan, bookings, payments, errors | 🟡 | `TicketContextCard` has plan, recent bookings, payment status, and diagnostics. | No payments ledger panel. Talent-as-requester lookup is weak. Not opened on a live ticket. | S13 step 2 | — | 2026-10-03 |

## Story 14 — The platform is healthy (S14)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 92 | No customer data across tenants | 🟡 | `npm run test:tenant-isolation` is in CI. Evidence logs live under `docs/plans/program/evidence/`. | Not re-run tonight, and Valeria was not aimed at a TAL-93900 booking URL. | S14 step 4 | — | 2026-10-03 |
| 94 | Main green, and production equals that green main | ✅ | Rechecked 2026-10-04 12:30Z: **Live HTML** (`tulala.digital` / `improntamodels.com`) = **`origin/production`** = **`origin/main`** = `15e65e2d5091` / `dpl_3QPTZnu8…` (#2526+#2530). All hosts including `app.tulala.digital` on tip. Overnight closed. **Live proof N/A (ops)**. | Tip aligned. Oran READY ping (external). | S14 step 1 | — | 2026-10-04 |
| 95 | deploy:smoke passes after every deploy | 🟡 | Cloud VM 2026-10-03 20:12Z on tip `7d30bb9d1` (`internal/deploy-smoke-2004.log`): HTTP/CSP/optimizer/Places/alias/auth-matrix/notification routes all ✓; **exit 1** — migration drift + taxonomy fail (no usable decrypted `SUPABASE_SERVICE_ROLE_KEY` / `.env.local` here); Resend domain ⚠ skipped (no `RESEND_API_KEY`). | Full exit 0 needs Mac/env with service role. HTTP production signals green — not ✅ until exit 0. | S14 step 1 | — | 2026-10-03 |
| 96 | All migrations applied | 🟡 | Mac `db:check` PASS 2026-10-02 (“908 local migrations all applied”). Desk `db:push` reported remote up to date at `021528877`. | Not re-run from this VM against production `e6e00420b` (no Supabase creds here). | S14 step 1 | — | 2026-10-03 |
| 97 | No open PR older than 2 days without an owner | ✅ | Open 2026-10-04 12:30Z: tip LIVE READY · [#2477](https://github.com/orantene/impronta-app/pull/2477) do not merge. Overnight closed. **Live proof N/A (ops)**. | — | S14 step 5 | — | 2026-10-04 |
| 98 | Zero console errors on dashboard, site, builder, inbox, money | 🟡 | Live wall/inbox walks on prior tip; no logged console capture this wake on `7d30bb9d1`. | No console audit artifact. | S14 step 2 | — | 2026-10-03 |
| 99 | Sentry has no new top errors after the last deploy | ❓ | No Sentry token in this environment. Live/production/main HTML `c3214cac3`. | Cannot read the Sentry issue list. | S14 step 3 | D14 | 2026-10-03 |
| 100 | PM board current; Blocked-on-Oran items are real | 🟡 | STATUS 2026-10-04 16:40Z standing wake. Live HTML sentry-release+`data-dpl-id` = prod = main `15e65e2d5091` / `dpl_3QPTZnu8…` READY. **#94 ✅**. Oran READY ping (not from board). Refunds BLOCKED. S5/S7 waiting `QA_JOR_CLONE_PASSWORD`. **Parked:** Free `QA_FREE_PASSWORD` · #45. REPLIES stub. ✅7. No Oran ping from this agent. | Board working note. | S14 step 5 | — | 2026-10-04 |

## No story yet

These questions are not named by a QA story. They stay ❓ until a story says what yes looks like.

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 9 | Every rail item opens a working page | ❓ | Rail cases in `talent.tsx` mount real pages. Unknown keys hit `TalentRouterFallback`. | No story. TAL-93900 wall blocks a logged-in click-through. | No story | D1 | 2026-10-03 |
| 10 | Dashboard language is remembered | ❓ | `PreferredLanguageCard` plus locale cookie seed exist. | No story. Not switched and reloaded. | No story | D2 | 2026-10-03 |
| 12 | Profile, photos, bio, tagline, contact in one place | ❓ | `MyProfilePage` opens `talent-profile-shell`. | No story. Not edited and checked on the public URL. | No story | D3 | 2026-10-03 |
| 14 | Amounts in the talent currency, with ≈US$ where needed | ❓ | Money formats in the talent currency. `≈ US$` renders on the public site and the services editor, not under `components/talent/money`. | No story. | No story | D4 | 2026-10-03 |
| 51 | Mexico Stripe works end to end | ❓ | Listed as deferred by Oran. No MX talent checkout was run. | No story. | No story | D5 | 2026-10-03 |
| 52 | USDC payouts for Argentina and Mexico | ❓ | Listed as deferred. No USDC payout was sent. | No story. | No story | D6 | 2026-10-03 |
| 53 | Free, Web Office, and higher plans are purchasable | ❓ | Checkout session and plan catalog exist in code. Live Stripe price IDs were not re-checked. | No story. | No story | D7 | 2026-10-03 |
| 62 | Bilingual talent site, ES primary and EN secondary | ❓ | `LanguagesGroup` and `LIVE_SITE_LOCALES = ["es","en"]` exist. Coverage UI expects gaps. | No story. Full bilingual content is not proven. | No story | D8 | 2026-10-03 |
| 70 | Gallery matches the 2026 standard | ❓ | FULL PACK PASS on remount `dpl_AAThCmwCrSTp6hd6NjmMoLyNG3jQ` (`8b3143018`): Wave 4 Apps E2E 17/17 — `talent-dashboard-visual-status.md`. Pack ancestors on live tip `c4f0a097a`. No story defines full-gallery yes. **P1.2 gallery preview PASS** 2026-10-03 (`internal/p1-2-gallery-preview-pass.md`, `media/gallery-preview-hang/`) on domain tip `1d56220d1` — hang retracted; still no story → stays ❓. | No story. Row stays ❓. | No story | D9 | 2026-10-03 |
| 89 | Terms, Privacy, and refund policies in ES and EN | ❓ | Rechecked 2026-10-03 17:03Z: `tulala.digital/legal/refunds` 200, `tulala.digital/es/legal/refunds` 200 on live tip `c4f0a097a` (`dpl_BR3mdrA163SmKuHfVqZFeEPHTNxD`). | No story. Page live; still ❓. | No story | D10 | 2026-10-03 |
| 90 | Talent is merchant of record in checkout copy | ❓ | Terms and Money say merchant of record with `LEGAL_REVIEW_PENDING`. `CheckoutView.tsx` has no merchant-of-record line. Lawyer review is still pending. | No story. | No story | D11 | 2026-10-03 |
| 91 | Retention 3y / 30d / 90d runs and logs a dry-run | ❓ | Cron jobs exist. 3y inquiry retention and 30d media reaper dry-run unless flags are on. `logsDays: 90` is config-only; audit trim uses 180 days. | No story. No production dry-run log reviewed. | No story | D12 | 2026-10-03 |
| 93 | Mexico tax / CFDI decided | ❓ | `docs/mx-tax-withholding-decision.md`: no platform MX withholding for now. Accountant still to do. | No story. | No story | D13 | 2026-10-03 |

## Doubts

D1 (#9). No story says how to prove every rail item. Is yes “click each rail item on TAL-93900 after the wall is gone, in ES and EN, on a phone and on desktop”?
D2 (#10). No story covers remembering language. Is a dashboard cookie reload enough, or must the public site follow too?
D3 (#12). No story names the one profile screen. Which editor is the one place, and which public URL proves the edit?
D4 (#14). No story covers currency plus ≈US$. Is the ≈US$ line required on Money/Dinero, or only on the public site?
D5 (#51). No story. This is also on the Oran-deferred list (Mexico Stripe). Should the row become ⏸, or stay ❓ until a story exists?
D6 (#52). No story. Also deferred (USDC payouts). Confirm ⏸, or keep ❓?
D7 (#53). No story for buying Free, Web Office, or a higher plan. Which Stripe price IDs and which test card count as yes?
D8 (#62). No story for a bilingual talent site. Do language settings plus hreflang count, or must every section be filled in ES and EN?
D9 (#70). No story for the 2026 gallery. #2474 and #2475 are ancestors of live production `0972d4f0a`. FULL PACK PASS on remount includes Wave 4 for free + Jorg. Live tip now `0972d4f0a`. What completed live pass counts as yes for this no-story row?
D10 (#89). No story. Terms, Privacy, and refunds EN+ES now return 200 on live `0972d4f0a`. Does HTTP 200 on both languages count, or must footer links and copy be walked?
D11 (#90). No story. Lawyer merchant-of-record review is still pending, and checkout has no MoR line. Confirm ⏸?
D12 (#91). No story for the retention dry-run. Which cron log is the proof?
D13 (#93). No story. CFDI / MX tax is deferred. Confirm ⏸?
D14 (#99). Story 14 step 3 says to read Sentry. This environment has no Sentry token. How should the row be proven?
D15 (#45). A5.1 was labeled PASS because Checkout and the DB went PAID, but the charge was $100.00, not $101.50, and Money showed $0. Confirm the row stays ❌ until both numbers are proven.
D16 (#81). Demo inbound was stored and forwarded. Password reset is still rate-limited. Does the question stay open until a reset email arrives?
D17 (#82). hello@ and help@ were proven. support@ was not in that send. Does the same MX make support@ a yes?
D18 (#37). Chrome and system lines are localized. User-written message bodies are not auto-translated. Is that a yes for S7?
D19 (#21). Cloud VM Inquire on `/t/TAL-93900` showed “Directory is not configured” because the local env had no service role. Is production the same, or only that VM?

## Master plan (9 todos) — overnight mirror

| Todo | State |
|---|---|
| gate-jor-edit-captcha | **done** — Edit PASS · Maison PASS · Part A PASS · LIVE=prod=main `2982c647` READY `dpl_9JkaxLvk…`; captcha OFF-skip + ON widget **LIVE PASS** (HQ `guest_captcha_enforced=true`) [`bc-c81d48b1`](bc-c81d48b1-f116-55e4-872e-7823a8f82e8e) · `internal/captcha-owner-pulse.md` |
| part-b-inventory-matrix | **completed** |
| jor-handover-ready | **done** — **READY** — `docs/jorgelina-handover-ready.md` (`bc-21017de6`): captcha OFF+ON LIVE PASS · Soft Gel Preview `/pay/98fy` PAID + dock · Part A PASS · Agenda LIVE PASS · Soft Gel LIVE Guardar PASS (`bc-732572d4`). Tip LIVE `2982c647`/`dpl_9JkaxLvk`. Overnight tip leftovers closed. **#45 stays ❌** (fee-line) |
| part-a-human-qa | **completed** — **PASS** LIVE `8821a50` / `dpl_yS2Aig…` `/talent/payouts` ES (`bc-fef73fb5`) — Depósitos / Ya estás lista para cobrar · `docs/human-qa/A3-checklist-results.md` · `internal/part-a-overnight-pulse.md` · `media/human-qa/a3-tipprove-payouts-es-1440-01.png` |
| paid-qa-then-captcha-on | **done** — Soft Gel **Preview** inquiry Checkout **PAID** `cs_test_` `/pay/98fy` + dock Paid; captcha OFF+ON **LIVE PASS**; #2525 **LIVE** + Soft Gel LIVE Guardar smoke **PASS** (`bc-732572d4`); **#45 stays ❌** (fee-line D15) |
| built-vs-live | **completed** |
| part-b-decision-memo | **completed** |
| part-b-unify-prove | **done** — Preview Soft Gel Capture+Solicitar + `/pay/98fy` Checkout **PAID** + dock Paid; tip LIVE `2982c647`/`dpl_9JkaxLvk` — Soft Gel LIVE Guardar smoke **PASS** (identity + talent pool) [`bc-732572d4`](bc-732572d4) · `internal/front-chat-tip-prove/softgel-2525-live-optional-smoke-PASS.md` |
| theme-release-fresh-signup | **completed** — #2516 tip-prove PASS TAL-93937 (`media/theme-release-signup/`) |

## Changes since last update

STATUS 2026-10-04 16:40Z on `status/done-board` (standing 15m wake). REPLIES.md stub. **Never ✅ without Live proof.** Sole STATUS writer `bc-9c0ba4c9`. No Oran ping from this agent (password / Publish demos / smoke already asked).
**Tip SHAs:** Live HTML sentry-release = prod = main = `15e65e2d5091` / `dpl_3QPTZnu8…` READY. **#94 ✅**. Scoreboard ✅ 7 / 🟡 62.
- Overnight **closed**. **Parked:** Free `QA_FREE_PASSWORD` · #45 fee-line ❌. Stripe S5/S7 waiting `QA_JOR_CLONE_PASSWORD` (Oran-only — do not re-ask).
- **LIVE steady:** tip `15e65e2d5091` / `dpl_3QPTZnu8…` reconfirmed (HTML). **#94 ✅**. No tip chase. Do not re-nag Publish demos/smoke.
- **Open:** refunds **BLOCKED** · [#2477](https://github.com/orantene/impronta-app/pull/2477) draft — do not merge. Merge lane empty (no other open PRs). Do not flip `SUPPORT_DESK_ENABLED`. Desk reuse owned by `bc-11e25be7` — do not steal.
- **Portfolio:** wall `bc-73428b52` IDLE / #2490 MERGED — no resume. Visual `bc-3c434583` IDLE / #2491 MERGED — no resume (do not start second worker).
