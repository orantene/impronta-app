Updated: 2026-10-03 08:59Z · Scoreboard: ✅ 1 / 🟡 67 / ❌ 17 / ⏸ 1 / ❓ 14
Live SHA: 0972d4f0a · Main SHA: 248f46426
Top 3 blockers right now
1. TOP — live/production still `0972d4f0a` (#2498 LIVE; HTML + Vercel `dpl_C2AD8Fb7MGFcBAjynDbvxkUXF2F4` reconfirmed 08:59Z). Main tip `248f46426` — [#2499](https://github.com/orantene/impronta-app/pull/2499) docs Maison cohort MERGED 08:49Z (not live; Structural IN_PROGRESS run 37111002069). **FULL PACK PASS** unchanged on remount `dpl_AAThCmw…`/`8b3143018` (free + Jorg Wave 4 17/17). #13 stays 🟡. #55/#57 stay ❌. #94 → 🟡 (main ahead of production).
2. Money **UNPAUSED** — [#2486](https://github.com/orantene/impronta-app/pull/2486) tip `42dc1e386`: Structural **PASS**; Local Supabase still in progress (notes: 18/21 talent-website journeys) — mergeState UNSTABLE until that finishes. [#2487](https://github.com/orantene/impronta-app/pull/2487) (`5c906f3c4`) UNPAUSED. Free Builder #2495 / wall #2490 after money. Vanity charge still $100. #26/#47 still need a live refund walk — not ✅. #18/#48 remain unwalked on live. #2492 (`4861ae17c`) fully green draft.
3. Support Desk flag OFF, parked: `support.tulala.digital` 404 (rechecked 08:59Z); #2477 draft CONFLICTING. Stories expand paused. Payouts sandbox blocked on Oran Stripe test secrets (`sk_test_`/`pk_test_` + QA password; see store `payouts-sandbox-audit.md`). Live `/legal/refunds` EN+ES still 200 on `0972d4f0a` — page live, not a product walk.

Rows are grouped by the 14 QA stories. Questions with no story stay ❓. ✅ only with a live check.

## Story 1 — Sofía opens her business (S1)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 1 | Register, verify, land in onboarding | 🟡 | Register pages HTTP 200 on 2026-10-02 (`/register`, `/es/register?as=talent`). Onboarding module is in code. | No fresh `@impronta.test` signup walked through verify and into onboarding on tulala.digital. | S1 steps 1–2 | — | 2026-10-03 |
| 2 | Onboarding ends on a published own URL | ❌ | Code audit 2026-10-02: talent path ends at `finish_my_page` / photos and does not auto-publish an own URL. | No published talent URL is created at the end of onboarding. | S1 step 5 | — | 2026-10-03 |
| 3 | AI pick or gallery applied in onboarding | ❌ | Code audit 2026-10-02: style tiles are business-only. Talent onboarding skips the design step. | Talent signup has no AI pick and no gallery choose-and-apply. | S1 step 4 | — | 2026-10-03 |
| 4 | Every trade gets sensible defaults | ❌ | Code audit 2026-10-02: stated-service drafts only. No per-trade packs for beauty, wellness, chef, creative, technical. | Default services, copy, and imagery are not seeded per trade. | S1 step 3 | — | 2026-10-03 |
| 5 | 18+ rule enforced and explained | 🟡 | Live HTML 2026-10-02: EN “I am 18 or older…” and ES “Tengo 18 años o más…”. Server gate exists in code. | Under-18 reject was not submitted on the live form. | S1 step 2 | — | 2026-10-03 |
| 6 | Free plan live with no approval wait | 🟡 | Free / `talent_basic` path is in code on main. | No fresh Free signup finished on tulala.digital this pass. | S1 step 5 | — | 2026-10-03 |
| 7 | Stop halfway and resume tomorrow | 🟡 | Resume machine plus e2e exist on main. | Not walked: close mid-services, log back in, land on that step. | S1 step 6 | — | 2026-10-03 |
| 8 | Whole ES flow, no English leaks | 🟡 | Onboarding key parity is in code. | No full ES walk of signup through the live site. | S1 check (ES, phone and desktop) | — | 2026-10-03 |
| 11 | “What to do next” on a new home | 🟡 | `FirstSessionChecklist` on Today (`TodayPage.tsx`). | Not seen on a brand-new talent home, ES or EN. | S1 check | — | 2026-10-03 |
| 15 | No placeholder data on a real dashboard | 🟡 | Mocks are gated off when a bridge profile exists. #2490 branch proof: no PROFILE CREATED wall for Jorg at desktop and 390 (`media/story-04-wall-desktop.png`, `media/story-04-wall-390.png`). | Not on main or production. Live TAL-93900 is still behind the wall. Not ✅. | S1 check | — | 2026-10-03 |
| 54 | Free site is one page and publishes | 🟡 | Free plan is home-only in `talent-membership.ts` plus publish core. Needs `TALENT_FREE_WEBSITE_ENABLED`. | Not published from a fresh Free account or from Valeria TAL-93901. | S1 step 5 | — | 2026-10-03 |

## Story 2 — Valeria on the Free plan (S2)

Localhost proof 2026-10-03 (`internal/story-02-valeria.md`). Account `qa-talent-free@impronta.test` showed Diego Pestañas / TAL-QAFIXFREE, not Valeria TAL-93901. Avatar branch proof 02:36Z (`internal/story-02-avatar-proof.md`): #13 is 🟡 on `cursor/story2-avatar-links-58f5`, not ✅. #55 and #57 stay ❌. #59 stays not run.

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 13 | Avatar links Site, Builder, Money, Messages, Settings | 🟡 | Branch proof 2026-10-03 on `cursor/story2-avatar-links-58f5` (draft #2492). Head is still `4861ae17c`; structural + Local Supabase both SUCCESS (reconfirmed 05:43Z). The walk showed Builder, Money, Messages, and Settings, and each row lands. Builder lands on the Web Office upsell, not a 404. Shot: `media/story-02-avatar-menu.png`. | Not on main or production. Not ✅. Held behind visuals pack (Oran mandate). | S2 step 1 | — | 2026-10-03 |
| 55 | Free Add and Move blocked in UI and server | ❌ | FAIL. The builder is still the Web Office upsell. Avatar proof on `cursor/story2-avatar-links-58f5` landed Builder on “The Page Builder is a Web Office feature”, not a locked editor (`media/story-02-avatar-builder.png`). | Add and Move locks were never shown, and the server reject was not exercised. | S2 steps 3–5 | — | 2026-10-03 |
| 57 | Builder back arrow to dashboard, no new pages | ❌ | FAIL. The editor never opened. The avatar Builder row on `cursor/story2-avatar-links-58f5` landed on the Web Office upsell, not the editor. Back arrow and “no new page” were not observable. | Need a Free editor that actually opens. | S2 step 2 | — | 2026-10-03 |
| 59 | Website Settings change the live site | 🟡 | Not run. `/talent/site` killed the dev server (OOM) before settings opened. No booking-mode or pause-banner change. Public `/t/TAL-QAFIXFREE` did load (`media/story-02-08-public.png`, Diego as lash artist). | Settings were never toggled, so the live site was not rechecked. Not ✅. | S2 step 6 | — | 2026-10-03 |

## Story 3 — Jor services and money setup (S3)

Wall proof 03:16Z (`internal/story-04-jor.md`): on #2490 (`cursor/unrostered-talent-wall-89c0`; tip `a5bb9a739` rebased on `9102437b9`) Jorg TAL-93900 had no PROFILE CREATED wall at desktop or 390. Stories 3–4 branch-proved. Not merged. “Manicure Gel QA” did not save. Structural + Local Supabase both SUCCESS (reconfirmed 05:43Z); HELD until visuals live (Oran mandate).

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 16 | Create, edit, reorder, hide, delete a service | 🟡 | `ServicesHome` / offerings editor on main: price, duration, variants, add-ons. On #2490 the wall was gone and Services opened. | “Manicure Gel QA” did not save and was absent on public `/t/TAL-93900` (`internal/story-04-jor.md`). Branch only. | S3 step 1 | — | 2026-10-03 |
| 17 | Edits show on the public site and in chat | 🟡 | Public `/t/[code]` is `force-dynamic`. Catalog reads offerings live. | No saved edit to compare on the site and in chat. The wall is gone only on unmerged #2490. | S3 step 2 | — | 2026-10-03 |
| 18 | Quote services never open the booking sheet | 🟡 | The failure was on `27a47c66b` (`not ok 37`, run 37080540629). #2489 is an ancestor of live production `0972d4f0a` (alias `dpl_C2AD8Fb7MGFcBAjynDbvxkUXF2F4`). | No live quote walk, so this is not ✅. | S3 step 3 | — | 2026-10-03 |
| 19 | ES and EN names survive save | 🟡 | `OfferingTextFields` plus `i18nPair` tests on main. | Not saved and reloaded on TAL-93900. The wall is gone only on unmerged #2490. | S3 step 1 | — | 2026-10-03 |
| 20 | Where it happens, plus travel rules | 🟡 | Per-service where (studio / client / remote) and travel defaults in the editor. | Not set on a service and checked on the public site. | S3 step 1 | — | 2026-10-03 |
| 44 | Stripe US Express status in the dashboard | 🟡 | Linh TAL-93103 localhost 2026-10-02: Money showed “Stripe · verified” after KYC (`media/a3-linh-money-verified-check.png`). Account charges and payouts enabled. | That pass was localhost, not tulala.digital, and not Jor. Live TAL-93900 still has the wall. #2490 did not recheck Stripe. | S3 step 4 | — | 2026-10-03 |

## Story 4 — Carla books and pays (S4)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 21 | Client books a slot and sees a true status | 🟡 | Catalog booking sheet exists. Public `/t/TAL-93900` HTTP 200 at 2026-10-03 00:29Z. On #2490, Inquire showed the exact text “Directory is not configured.” (`media/story-04-inquire.png`). | Story 4 stopped there. No “Manicure Gel QA”. Book path was not run. Branch wall proof does not make this ✅. | S4 steps 1–2 | D19 | 2026-10-03 |
| 22 | Accept, decline, reschedule, cancel from Agenda | 🟡 | `AgendaBookingRecord` actions on main. `TALENT_AGENDA_V2` defaults off. | Not clicked. Live TAL-93900 wall still blocks Agenda. #2490 removed the wall only on the branch, and Accept was not run. | S4 step 3 | — | 2026-10-03 |
| 23 | Double booking is impossible | 🟡 | #2468 is an ancestor of live production `0972d4f0a`. DB exclusion covers agenda, holds, and chat proposals. | Same slot was not booked twice from a second guest. No live check, so this is not ✅. | S4 step 7 | — | 2026-10-03 |
| 28 | Confirmation and reminder messages | 🟡 | Booking and reminder templates plus cron exist on main. | No live booking email or in-app reminder checked for language and branding. | S4 step 5 (client side) | — | 2026-10-03 |
| 33 | Thread stays in sync with Agenda and Money | 🟡 | Messages v5 record chips (`context-view.ts`, `payment-view.ts`). Flag `NEXT_PUBLIC_MESSAGES_V5` / Studio v2 defaults off. | No paid thread compared with Agenda and Money. v5 may be off in production. | S4 step 5 | — | 2026-10-03 |
| 45 | $100 seller-pays charges $101.50; talent nets the rest | ❌ | A5.1 Checkout+DB went PAID (booking `746f8850-ffbb-4400-802b-5cd949761beb`, session `cs_test_a1PznC0K…`) but `amount_total` was $100.00, not $101.50. Money Collected stayed $0. | Pass-through collect is not on main. Draft #2487 head `5c906f3c4` fully green; #2486 head `5e7545bd0` undrafted fully green (05:43Z). Both HELD until visuals live (Oran mandate). Neither is merged. | S4 steps 4–5 | D15 | 2026-10-03 |
| 48 | Receipts and PDFs show fee lines and non-refundable | 🟡 | #2482 is an ancestor of live production `0972d4f0a` (`feat(api)/: receipt PDF fee lines + non-refundable note`). Confirmation copy already had fee lines. | Not ✅ until a live receipt PDF from a paid booking. | S4 step 5 | — | 2026-10-03 |
| 49 | Money totals: earned, owed, cash, pending | ❌ | #2468 totals code is on production. Live vanity order `f87627b1-2210-44b6-a659-3ade89756030` was PAID and Money still showed $0 Collected (missing `booking_talent` and commission snapshot). | #2486 head `5e7545bd0` — fully green (05:43Z). HELD until visuals live. Not merged. Cancelled-booking exclusion not walked. Sandbox paid-booking walk blocked on Oran Stripe test secrets. | S4 step 6 | — | 2026-10-03 |

## Story 5 — Carla asks for a refund (S5)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 26 | Cancel paid shows refund pending, then an action | 🟡 | #2481 is an ancestor of live production `0972d4f0a` (earlier live on `fc3896083` / `dpl_AiG9V9VhiAtxwjW4TSkZAhJzH2WL`; current live `dpl_C2AD8Fb7MGFcBAjynDbvxkUXF2F4`). Money refund CTA code is therefore on live. | Not ✅ until a live refund walk on a paid booking. Code on prod ≠ walk. | S5 step 1 | — | 2026-10-03 |
| 47 | Refunds net of fees, partial, block if fee unknown | 🟡 | Refund engine and #2469 tests are ancestors of live production `0972d4f0a`. #2481 Money refund CTA is also on that live SHA. That is not a fee-net refund walk. | A5.3 not run. Both live charges were flat $100 with empty payout rows, so the fee-correct amounts were never refunded. Not ✅ until a live refund walk. | S5 steps 2–4; also S6 step 3 | — | 2026-10-03 |

## Story 6 — Diego pays the card fee (S6)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 46 | Client-pays fee charges about $104.84; talent gets $100 | ❌ | Live A5.2 on Linh charged $100.00 (session `cs_test_a1fUxaxfw…`, order `812cf5f5-eacd-41bd-8ead-de56fbb7c5c3`) while `processing_fee_payer=client`. | Draft #2487 proves $104.84 on Stripe test session `cs_test_a1tBUzzC…` (2026-10-03). That is not a Jor booking. Head `5c906f3c4` fully green; HELD with #2486 until visuals live (Oran mandate). Talent net of exactly $100 was not paid out. Sandbox re-walk blocked on Oran Stripe test secrets. | S6 steps 1–3 | — | 2026-10-03 |

## Story 7 — Offer, pay, and control in the thread (S7)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 27 | Accepting an offer never duplicates the booking | 🟡 | `ensureOfferBooking` landed on production via #2468 (ancestor of live `0972d4f0a`). | Not accepted twice in a thread and counted in Agenda. Wall blocks TAL-93900 inbox work. | S7 step 3 | — | 2026-10-03 |
| 30 | Client chats; talent replies from /talent/inbox | 🟡 | Guest dock and `/talent/inbox` exist. v5 mounts only when Studio v2 or `NEXT_PUBLIC_MESSAGES_V5=1` (both default off). | Not sent from the public site to the inbox on production. | S7 steps 1–2 | — | 2026-10-03 |
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
| 25 | Finish → Card creates the order and pay link | 🟡 | Pay-link actions and tests on main. | Not finished from Agenda on a phone. | S9 step 3 | — | 2026-10-03 |
| 29 | Today and week are clear on a phone | 🟡 | Agenda phone layouts exist. | No 390px pass on `qa-agenda-jor`. | S9 step 1 | — | 2026-10-03 |
| 50 | Cash or transfer shows in the ledger after reload | 🟡 | `MoneyRecordPaymentPanel` on main. | Not recorded, reloaded, and checked. Wall blocks TAL-93900 Money. | S9 steps 4–5 | — | 2026-10-03 |

## Story 10 — Jor makes the site hers (S10)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 56 | Paid plan can add, move, duplicate, remove sections | 🟡 | Web Office grants `personalSiteSections`. Navigator can duplicate, move, and remove. | Not done on a paid talent in the builder. | S10 step 1 | — | 2026-10-03 |
| 58 | Font, size, colour, and shape are editable | 🟡 | Style panel covers text, font, size, and colour. | Not every token and shape of every design is editable. Not published and rechecked. | S10 step 2 | — | 2026-10-03 |
| 60 | Custom domain with clear ES and EN errors | 🟡 | `TalentSiteDomainPanel` plus ES/EN error copy and `legal-domain-qa.test.tsx`. Web Office gated. | A fake domain was not submitted on the live drawer. | S10 step 4 | — | 2026-10-03 |
| 61 | SEO: title, description, canonical, sitemap, hreflang | 🟡 | `https://tulala.digital/sitemap.xml` HTTP 200 at 2026-10-03 00:29Z. Talent SEO helpers are on main. | A talent host was not view-sourced for title, canonical, and hreflang. | S10 step 5 | — | 2026-10-03 |
| 63 | Legal footer links use the right language | 🟡 | `footer-socket.ts` `localizedLegalUrl` rewrites ES to `/es/legal/...`. | Not checked on a live ES talent footer. | S10 step 6 | — | 2026-10-03 |
| 71 | Switch theme without losing content | 🟡 | `applyDesign` keeps profile and services and replaces the custom page tree. | Theme switch not done on TAL-93900. Builder edits would be replaced. | S10 step 3 | — | 2026-10-03 |

## Story 11 — Ship a template, talents get it (S11)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 64 | Several talent templates at once in Builder Lab | 🟡 | Builder Lab talent-design drafts, separate from agency starters (`theme-template/new-design.server.ts`). | Owner has not started two drafts side by side on production. | S11 step 1 | — | 2026-10-03 |
| 65 | Edit against the mockup and release (Theme Studio) | 🟡 | Lab edit and release exist. Named “Talent Theme Studio” against a mockup is still a vision. | No mockup-diff release walked by the owner. | S11 step 2 | — | 2026-10-03 |
| 66 | “Update available” and a one-click upgrade | 🟡 | `ThemeUpdateNotice` copy is “Update available” / “Actualización disponible”, with apply on main. | A talent has not seen the pill and applied it. | S11 step 3 | — | 2026-10-03 |
| 67 | Upgrade keeps content, previews, and undoes | 🟡 | Merge, preview, and undo tests on main (`theme-releases/merge.test.ts`). | Not previewed and undone on TAL-93900. | S11 step 3 | — | 2026-10-03 |
| 68 | Demos pick up the new template version | 🟡 | Explicit “publish to demos” and `npm run demos:rebuild`. Not silent on every release. | Not run against one theme after a release. | S11 step 4 | — | 2026-10-03 |
| 69 | About 32 themes, distinct and mobile-clean | ❌ | Finished gallery slugs are 4: maison, maison-v2, folio, gridline (`FINISHED_GALLERY_SLUGS`). | Far short of ~32. Fixture and mobile issues are still in the gallery audit. | S11 step 5 | — | 2026-10-03 |
| 72 | Free and generated images are platform stock | 🟡 | Platform stock library and HQ stock admin exist. AI files land in Lifestyle. | Talent picker is talent-scoped media, not stock-first. | S11 step 5 | — | 2026-10-03 |
| 78 | 224 demos, each with a unique theme | ❌ | Workbook foundation targets 224. Curated live demos are about 11. Finished designs are 4, shared across demos. Sample `/t/TAL-91001` and `/t/lucia-navarro` were HTTP 200 on 2026-10-02. | They are not 224 unique live themes. | S11 step 5 | — | 2026-10-03 |
| 79 | One command rebuilds demos only | 🟡 | `npm run demos:rebuild` refuses non-demo identities. | Not re-run this pass. | S11 step 4 | — | 2026-10-03 |
| 80 | Demo pages show name, city, languages, mode, apps | 🟡 | Live profile fields feed the public page. Gallery cards still omit city, languages, booking mode, and apps. | Five random demos were not opened for that set. | S11 step 5 | — | 2026-10-03 |

## Story 12 — Sofía adds Nail Designer (S12)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 73 | Apps tab: suggested for the trade, plus all apps | 🟡 | `AppsTab` and `appsForTrade`. Library has one app, Nail Designer. | Not opened as a nail talent. “All apps” is that one app. | S12 step 1 | — | 2026-10-03 |
| 74 | Turn on Nail Designer and see it on the site | 🟡 | Builder node `app_nail_designer` can be inserted. Gallery Apps tab is a playground, not a turn-on switch. | Not turned on and viewed on a published site. | S12 step 2 | — | 2026-10-03 |
| 75 | Nail Designer matches the owner design | 🟡 | Island port plus HTML parity tests against `nail-designer.html`. | Gallery audit still lists a cramped desktop embed and EN copy on ES pages. Not used by a client. | S12 step 2 | — | 2026-10-03 |
| 76 | Apps and templates link both ways | 🟡 | One-way hints: `recommendedDesigns: ["maison-v2"]`. | Dead ends remain. Folio and Gridline barely show Apps. | S12 step 3 | — | 2026-10-03 |
| 77 | Premium apps marked and gated | ❌ | Pro pill renders when `premium: true`. Nail Designer is `premium: false`. Comment in `apps-registry.ts` says the plan gate comes later. | No premium app and no plan gate. | S12 step 3 | — | 2026-10-03 |

## Story 13 — A client needs help (S13)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 81 | demo.tulala.digital inboxes receive mail, including resets | 🟡 | Demo domain verified. Inbound to `c4test@demo.tulala.digital` stored and `forward_status=sent` at 2026-10-02T23:24:13Z (subject `C4-demo-fix 2026-10-02T23-24-09-028Z`). | Password reset still fails: Supabase `email rate limit exceeded` (project-wide). Reset mail did not arrive. | S13 step 5 | D16 | 2026-10-03 |
| 82 | hello@, help@, and support@ receive mail | 🟡 | C4 2026-10-02: `hello@tulala.digital` and `help@tulala.digital` stored and forwarded to Gmail. Webhook `email.received` enabled on `https://tulala.digital/api/webhooks/resend`. | `support@` was not in that proof. | S13 step 4 | D17 | 2026-10-03 |
| 83 | Stripe support email is hello@ on both accounts | ❌ | Dashboard checklist is still unchecked for US and MX, live and test. No code path sets the Stripe support email. | Oran-only Dashboard clicks. Not started. | S13 (Oran clicks, not a story step) | — | 2026-10-03 |
| 84 | Transactional mail: right language and brand | 🟡 | EN/ES templates for booking, payment, reminder, and password reset are on main. | No booking or payment mail opened from a live talent flow. Reset send is rate-limited. | S13 step 6 | — | 2026-10-03 |
| 85 | Talent can choose which notifications | 🟡 | `TalentNotificationsDrawer` saves prefs. Keys are `new-offer`, `hold-expiring`, and similar, not the catalog category ids the dispatcher reads. | Toggles may not change what is sent. Not proven with one real event. | S13 (own: toggle one pref, trigger the event) | — | 2026-10-03 |
| 86 | Support from the dashboard or site: AI, then a human | 🟡 | Launchers and `/api/ai/support-chat` plus `requestHumanAction` are on main. `/support` was HTTP 200 on 2026-10-02. | Not walked as a talent or a guest through AI then human on production. | S13 steps 1–2 | — | 2026-10-03 |
| 87 | Owner works support in the Desk, including hello@ | 🟡 | #2479 and #2483 are ancestors of live production `0972d4f0a`. Migrations applied. `SUPPORT_DESK_ENABLED` is off. | `https://support.tulala.digital` HTTP 404 rechecked 2026-10-03 08:59Z. Flag stays OFF; track parked. hello@ is not landing in the Desk. Draft #2477 design still open (mergeable CONFLICTING). | S13 step 3 | — | 2026-10-03 |
| 88 | Tickets show plan, bookings, payments, errors | 🟡 | `TicketContextCard` has plan, recent bookings, payment status, and diagnostics. | No payments ledger panel. Talent-as-requester lookup is weak. Not opened on a live ticket. | S13 step 2 | — | 2026-10-03 |

## Story 14 — The platform is healthy (S14)

| # | Question (short) | Status | Evidence | Blocker / what's missing | Story & how I test it | Doubt for Oran/Claude | Updated |
|---|---|---|---|---|---|---|---|
| 92 | No customer data across tenants | 🟡 | `npm run test:tenant-isolation` is in CI. Evidence logs live under `docs/plans/program/evidence/`. | Not re-run tonight, and Valeria was not aimed at a TAL-93900 booking URL. | S14 step 4 | — | 2026-10-03 |
| 94 | Main green, and production equals that green main | 🟡 | Re-checked 2026-10-03 08:59Z: `origin/main` = `248f46426` (#2499). `origin/production` + live still `0972d4f0a` (HTML + Vercel `dpl_C2AD8Fb7MGFcBAjynDbvxkUXF2F4`). Main Structural IN_PROGRESS on `248f46426` (run 37111002069). | Docs tip on main is not production until Structural greens and the pointer advances. Not ✅. | S14 step 1 | — | 2026-10-03 |
| 95 | deploy:smoke passes after every deploy | 🟡 | Mac `npm run deploy:smoke` exit 0 on 2026-10-02 after the Desk promote (2 warnings). | Not re-run after promote of `0972d4f0a` (#2498) to live (nor after remount/`8b3143018` pack prove). | S14 step 1 | — | 2026-10-03 |
| 96 | All migrations applied | 🟡 | Mac `db:check` PASS 2026-10-02 (“908 local migrations all applied”). Desk `db:push` reported remote up to date at `021528877`. | Not re-run from this VM against production `e6e00420b` (no Supabase creds here). | S14 step 1 | — | 2026-10-03 |
| 97 | No open PR older than 2 days without an owner | ✅ | Open at 2026-10-03 08:59Z: 6 (#2477, #2486, #2487, #2490, #2492, #2495). #2499 MERGED to main `248f46426` (not live). #2486 tip `42dc1e386` Structural PASS; Local Supabase 18/21 in progress. All open PRs created 2026-10-02 or 2026-10-03. Author `orantene` on each. | None older than 2 days. Money lane unpaused. | S14 step 5 | — | 2026-10-03 |
| 98 | Zero console errors on dashboard, site, builder, inbox, money | 🟡 | No logged-in console capture this pass. | Live TAL-93900 wall still blocks those pages. #2490 removed the wall only on the branch, and that pass was not a console audit. | S14 step 2 | — | 2026-10-03 |
| 99 | Sentry has no new top errors after the last deploy | ❓ | No Sentry token in this environment. Live production equals main at `187558dca`. | Cannot read the Sentry issue list. | S14 step 3 | D14 | 2026-10-03 |
| 100 | PM board current; Blocked-on-Oran items are real | 🟡 | Store `docs/plans/PM-BOARD.md` refreshed this wake (2026-10-03 08:59Z). Live/production `0972d4f0a`; main `248f46426` (#2499 MERGED). FULL PACK PASS. Money UNPAUSED (#2486 Structural PASS, Local Supabase 18/21). Desk parked; Stories paused; sandbox blocked on Oran Stripe test secrets. No new Claude replies. | Not a live product check. Board is a working note, not proven against every open PR owner. | S14 step 5 | — | 2026-10-03 |

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
| 70 | Gallery matches the 2026 standard | ❓ | FULL PACK PASS on remount `dpl_AAThCmwCrSTp6hd6NjmMoLyNG3jQ` (`8b3143018`): Wave 4 Apps E2E 17/17 on TAL-QAFIXFREE + Jorg/TAL-93900 — `talent-dashboard-visual-status.md` + `media/talent-visuals/wave4-*`. Live tip now `0972d4f0a` (+#2498). No story defines full-gallery yes. | No story. Pack prove done; row stays ❓ until story defines yes. | No story | D9 | 2026-10-03 |
| 89 | Terms, Privacy, and refund policies in ES and EN | ❓ | Rechecked 2026-10-03 08:59Z: `/legal/refunds` 200, `/es/legal/refunds` 200 on live `0972d4f0a` (`dpl_C2AD8Fb7MGFcBAjynDbvxkUXF2F4`; HTML embeds full SHA). | No story. Page is live; still ❓ until a story defines yes (ES+EN content / footer walk). | No story | D10 | 2026-10-03 |
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

## Changes since last update

Standing PM 15min wake 08:59Z on `status/done-board` (from `19950d1da`). REPLIES.md stub unchanged — no new Claude replies; not overwritten.
Live + production still `0972d4f0a` (#2498 LIVE; HTML SHA reconfirmed; Vercel prod `dpl_C2AD8Fb7MGFcBAjynDbvxkUXF2F4`). Main tip `248f46426` — #2499 Maison cohort docs MERGED 08:49Z (not live; Structural IN_PROGRESS run 37111002069). FULL PACK PASS unchanged. `/legal/refunds` EN+ES HTTP 200. `support.tulala.digital` still 404.
Money UNPAUSED: #2486 tip `42dc1e386` — Structural PASS; Local Supabase still in progress (18/21 talent-website journeys per notes); mergeState UNSTABLE. #2487 UNPAUSED. Free Builder #2495 / wall #2490 after money. Desk parked; Stories paused; sandbox blocked on Oran Stripe test secrets.
Open PRs (6): #2477 CONFLICTING; #2486/#2487/#2490/#2495 money lane; #2492 draft. #94 → 🟡 (main ≠ production). Scoreboard: ✅ 1 / 🟡 67 / ❌ 17 / ⏸ 1 / ❓ 14. No new product ✅.
