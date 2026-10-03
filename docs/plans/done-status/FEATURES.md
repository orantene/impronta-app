# Feature registry — built vs live

Updated: 2026-10-03 ~21:12Z · Auditor: `bc-65f24c00` · Live prove: sibling `bc-bd75d44f` · Live tip (production pointer): `7d30bb9d1` · `origin/main`: `1d56220d1` (#2501 merged, not yet on production pointer)  
Brief: [BUILT-VS-LIVE-AUDIT-2026-10-03.md](../BUILT-VS-LIVE-AUDIT-2026-10-03.md) · Sweep: [persona-visibility-sweep.md](../../../internal/persona-visibility-sweep.md) · Inventory: [VISIBILITY.md](./VISIBILITY.md) · Launch: [LAUNCH-VIEW.md](./LAUNCH-VIEW.md) · Asks: [oran-batched-asks.md](../oran-batched-asks.md)  
Shots: [media/built-vs-live-audit/](../../../media/built-vs-live-audit/) (`tal-93900-jor/`, `valeria-free/`, `fresh-talent/`, `visitor/`, `platform-admin/`) · Prior: [media/visibility-audit/](../../../media/visibility-audit/) · [media/talent-studio-v2-live/](../../../media/talent-studio-v2-live/)

**Rule:** Merged ≠ live ≠ visible. Every row needs Gate(s) + Prod state + persona visibility. PRs that add a feature/flag must update this file and state rollout: `ON at merge` or `OFF until <condition>, owner <name>`.

Personas: **paid** = TAL-93900 (Jor clone) · **free** = Valeria TAL-93901 · **fresh** = new Free signup · **visitor** = public site · **admin** = platform admin.

---

## User-facing features

| Feature | PRs | Gate(s) | Prod state | Visible to: paid / free / fresh / visitor / admin | Last verified live | Owner | Notes |
|---|---|---|---|---|---|---|---|
| Presence tabs (My website / Where I appear / Discover networks) | #2494 #2497 + Studio | `TALENT_STUDIO_V2` | **ON** (`1`) | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 21:12Z · `tal-93900-jor/10-presence.png` + `valeria-free/` + `fresh-talent/` | product | Live prove ✅ paid+Free+fresh; Dev-default killed in [#2504](https://github.com/orantene/impronta-app/pull/2504) |
| Studio shell (identity bar, mobile bottom nav, trial chip) | Studio V2 | `TALENT_STUDIO_V2` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 21:12Z · `*/30-plan-signals.png` (+ prior `talent-studio-v2-live/05-identity-bar.png`) | product | Identity / manage-site bar ✅ on paid+Free+fresh |
| Agenda V2 (Today / Calendar) | prior | `TALENT_AGENDA_V2=all` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 21:12Z · `*/02-today.png` | product | |
| Messages v5 (talent inbox / fee lines) | #2460 | `TALENT_STUDIO_V2` **or** `NEXT_PUBLIC_MESSAGES_V5` | **ON** (both `1`) | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 21:12Z · `tal-93900-jor/20-messages.png` + free/fresh | product | Inbox ✅; Accept/Decline + net split still need Story 7 click-through |
| Free website + Free Builder | #2495 #2471 | `TALENT_FREE_WEBSITE_ENABLED` | **ON** (`true`) | n/a / ✅ / ✅ / ✅ (public) / n/a | 2026-10-03 21:12Z · `visitor/51-valeria-public-booking.png` + Valeria Presence | product | Public site + booking CTA ✅ |
| Theme gallery (finished Maison/Folio/Gridline set) | #2475 #2474 #2494 #2496 | `TALENT_THEME_GALLERY_ENABLED` | **ON** (`1`) | ⚠ / ⚠ / ⚠ / n/a / n/a | 2026-10-03 21:12Z · `*/13-gallery-entry.png` | product | Entry ✅ (Elige un diseño opens); previews hang on **Cargando vista previa** ⚠ |
| Website settings | #2389+ | `TALENT_WEBSITE_SETTINGS_ENABLED=all` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 21:12Z · `*/12-website-settings.png` | product | Ajustes del sitio ✅; Story 2: each setting → live site still owed |
| Talent subdomains `*.tulala.digital` | prior | `TALENT_SITE_SUBDOMAINS_ENABLED` | **ON** (`true`) | ✅ / ✅ / ✅ / ✅ / n/a | 2026-10-03 21:12Z · `visitor/50-*-public-cookie*.png` + booking | product | Jor + Valeria public hosts live |
| Preview eye → live site | #2493 | subdomains help | **ON** (code) | ✅ / ✅ / ✅ / n/a / n/a | prior Studio / dash QA | product | |
| Dashboard teal / Alba tokens | #2491 #2497 #2498 | none | **ON** | ✅ / ✅ / ✅ / n/a / n/a | tip `7d30bb9d1` | product | |
| Avatar menu → Builder/Money/Messages/Settings | #2492 | none | **ON** | ✅ / ✅ / ✅ / n/a / n/a | prior | product | |
| Unrostered wall skip | #2490 | none | **ON** | ✅ / ✅ / ✅ / n/a / n/a | prior | product | |
| Languages / AI talent translate | #2432–#2434 | `settings.ai_talent_translate_enabled` | **ON** (DB `true`) | ✅ / ✅ / ✅ / ✅ / n/a | DB verified 2026-10-03 | product | Prove ES+EN talent live still owed |
| Maison theme apply | #2429 #2499 | `TALENT_MAISON_THEME_ENABLED=talents` + allow-list | **partial** (cohort) | ✅ (TAL-93900) / ❌ apply / ❌ / n/a / n/a | allow-list: QAFIXFREE + TAL-93900 | Oran | Widen to `all` = batched ask |
| Custom domain Connect + help | #2453 | none (Connect path) | **ON** | ✅ / ✅ / ✅ / n/a / n/a | tip | product | |
| Domain Buscar / buy | #2500 | registrar tokens unset | **parked** (Coming soon) | Coming soon / same / same / n/a / n/a | tip `7d30bb9d1` | Oran | Stay parked |
| Client-pays / pass_through fees | #2487 #2460 | env `COMMISSION_PROCESSING_PASS_THROUGH=1` + DB `pass_through` 150bps | **ON** | UI ✅; paid path ops / limited / limited / visitor checkout / admin | env+DB 2026-10-03 | product | Stories 4–6 still running |
| Legal refunds EN/ES | #2480 | none | **ON** | n/a / n/a / n/a / ✅ / n/a | prior `20-public-legal-refunds.png` | product | |
| Support Desk host | #2473 #2483 **#2501** | `SUPPORT_DESK_ENABLED` | **waiting tip** (#2501 on main, not prod) | ❌ / ❌ / ❌ / ❌ / ❌ (404) | 2026-10-03 21:12Z · `platform-admin/65-admin-support-desk.png` **404** | Oran | Waiting production pointer → `1d56220d1` (+ flag); HQ Support ✅ `64-admin-support-hq.png` |
| Builder auto thumbnail | A8 | `BUILDER_AUTO_THUMBNAIL_ENABLED` | **ON** (`1`) | n/a (background) | env 2026-10-03 | eng | best-effort |
| Builder rollout cron | cron | `BUILDER_ROLLOUT_CRON_ENABLED` | **ON** (`1`) | n/a (background) | env; 0 rows ramping | eng | |
| Media private access | media | env `MEDIA_PRIVATE_ACCESS_ENABLED` + DB | **ON** | gated URLs | env+DB true | eng | |
| Reap support replays | cron | `REAP_SUPPORT_REPLAYS_ENABLED` | **ON** (`true`) — sibling flipped | n/a (cron) | env created this wave | Oran confirm | Retention — confirm OK in batched asks |
| Client welcome email | onboarding | `CLIENT_WELCOME_EMAIL_ENABLED` | **OFF** (unset) | — | — | Oran | Needs SPF/DKIM + suppressions |
| Talent site consent tooling | footer | `TALENT_SITE_CONSENT_TOOLING_ENABLED` | **OFF** (unset) | n/a / n/a / n/a / ❌ / n/a | 2026-10-03 21:12Z · `visitor/50-*-public-cookie*.png` — Accept/Decline **absent** | Oran / product | Cookie bar ❌ on talent hosts; app login still shows black bar; redesign separate (#2502) |
| Admin workspace FAB | DB | `platform_settings.workspace_fab_enabled` | **ON** (`true`) | n/a / n/a / n/a / n/a / ✅ | SQL 2026-10-03 | product | Talent layout may still force FAB off |
| AI master + search/draft/support/translate/agent | DB `settings.ai_*` | almost all **true** | **ON** | varies | SQL 2026-10-03 | product | |
| WhatsApp channels | `TULALA_WHATSAPP_TENANTS` | pilot list only | **partial** | listed tenants only | env pilot | eng | Not global |
| Site shell render | `ENABLE_SITE_SHELL` | sensitive/encrypted | unknown/partial | tenant allow | leave | eng | Default-off by design for edit |
| Card redesign Phase 2 | prior | product OK | **built, waiting Oran** | — | — | Oran | Screenshots → yes/no |
| Front-door chat paid flip + `?order=` cold load | owed since 2026-09-17 | code | **owed / unproven** | visitor | — | eng | Fix + live test |
| AI booking assistant (S8) | — | n/a | **not built** | — | — | product | |
| ~32 themes / 224 demos | — | gallery | **partial** (4 finished) | — | — | product | Extra designs flag stays off |
| Premium app plan gate | — | n/a | **not built** | — | — | product | |
| Onboarding auto-publish + trade defaults | — | module flag ON; publish defaults missing | **not ready** | — | 2026-10-03 21:12Z · register UI ✅ `fresh-talent/40-register-talent.png`; brand-new signup→published ❌ not walked | product | Fresh Free surfaces reuse Valeria; STATUS #2 known gap |
| Fresh talent register UI (`/es/register?as=talent`) | prior | none | **ON** | n/a / n/a / ✅ / n/a / n/a | 2026-10-03 21:12Z · `fresh-talent/40-register-talent.png` | product | UI only; no new inbox created this pass |

---

## Env flag matrix (production, verified)

| Flag | Default when unset | Dev-default? | Prod value | What it gates |
|---|---|---|---|---|
| `TALENT_STUDIO_V2` | OFF (after kill-PR; was NODE_ENV) | **was yes → PR fixes** | `1` | Presence / Studio shell |
| `TALENT_AGENDA_V2` | OFF unless `all`/list | no | `all` | Today/Calendar v2 |
| `TALENT_FREE_WEBSITE_ENABLED` | OFF | no | `true` | Free site + Builder |
| `TALENT_THEME_GALLERY_ENABLED` | OFF | no | `1` | Designs / Looks |
| `TALENT_WEBSITE_SETTINGS_ENABLED` | OFF | no | `all` | Website settings |
| `TALENT_SITE_SUBDOMAINS_ENABLED` | OFF | no | `true` | `*.tulala.digital` |
| `NEXT_PUBLIC_MESSAGES_V5` | OFF | no | `1` | Messages v5 bake |
| `TALENT_MAISON_THEME_ENABLED` | OFF | no | `talents` | Maison cohort mode |
| `TALENT_MAISON_THEME_TALENTS` | empty | no | 2 UUIDs | Allow-list |
| `BUILDER_AUTO_THUMBNAIL_ENABLED` | OFF | no | `1` | Publish thumbs |
| `BUILDER_ROLLOUT_CRON_ENABLED` | OFF | no | `1` | Ramp cron |
| `MEDIA_PRIVATE_ACCESS_ENABLED` | OFF | no | `1` | Gated media |
| `REAP_SUPPORT_REPLAYS_ENABLED` | OFF | no | `true` | Replay reap cron |
| `COMMISSION_PROCESSING_PASS_THROUGH` | OFF | no | `1` | Client-pays arming |
| `CLIENT_WELCOME_EMAIL_ENABLED` | OFF | no | unset | Welcome mail |
| `TALENT_SITE_CONSENT_TOOLING_ENABLED` | OFF | no | unset | Footer privacy choices |
| `SUPPORT_DESK_ENABLED` | OFF (after kill-PR; was NODE_ENV) | **was yes → PR fixes** | unset | Desk host |

---

## Process (permanent)

1. New feature/flag PR → update a row here + PR checkbox "Feature registry updated" + rollout line.
2. Flag OFF >7 days without reason → daily summary callout.
3. Weekly live sweep (Monday + after big merges): re-verify rows; disappeared → ❌ top priority.
4. Daily summary line: `Features: X live / Y hidden-on-purpose / Z hidden-by-mistake (fixed today: …)`.
5. Smoke extension (follow-up): `deploy:smoke` should fail if critical flags missing expected prod values.
6. **Done board Live proof:** a STATUS.md ✅ requires a production screenshot from `app.tulala.digital` as TAL-93900 (linked in Evidence). Localhost / code-only / tip SHA without shot → 🟡 or **Live proof owed**. See [STATUS.md](./STATUS.md) Process.
