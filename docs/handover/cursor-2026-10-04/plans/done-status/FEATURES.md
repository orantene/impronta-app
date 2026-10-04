# Feature registry — built vs live

Updated: 2026-10-04 ~02:18Z · Live tip: `a717b208a` (#2512 Maison smoke=`all` **LIVE HTML**) · `origin/main` `1e533011f` (front-chat Structural chase) · Dashboard LIVE fold: [talent-dashboard-live-audit.md](../../talent-dashboard-live-audit.md) · Audit: [built-vs-live-audit.md](../../built-vs-live-audit.md) · Execution: [LAUNCH-EXECUTION.md](./LAUNCH-EXECUTION.md) · Jor Maison: [jorg-beauty-live-maison.md](../../jorg-beauty-live-maison.md) · Theme chain: [theme-release-chain-audit.md](../../theme-release-chain-audit.md)  
Brief: [BUILT-VS-LIVE-AUDIT-2026-10-03.md](../BUILT-VS-LIVE-AUDIT-2026-10-03.md) · Sweep: [persona-visibility-sweep.md](../../../internal/persona-visibility-sweep.md) · Inventory: [VISIBILITY.md](./VISIBILITY.md) · Launch: [LAUNCH-VIEW.md](./LAUNCH-VIEW.md) · Asks: [oran-batched-asks.md](../oran-batched-asks.md) · Gaps: [TALENT-SITE-GAPS.md](./TALENT-SITE-GAPS.md)  
Shots: [media/built-vs-live/](../../../media/built-vs-live/) · [media/talent-dashboard-audit/](../../../media/talent-dashboard-audit/) · [media/built-vs-live-audit/](../../../media/built-vs-live-audit/) · [media/talent-site-gaps/](../../../media/talent-site-gaps/) · [media/theme-release-chain/](../../../media/theme-release-chain/) · Prior: [media/visibility-audit/](../../../media/visibility-audit/) · [media/talent-studio-v2-live/](../../../media/talent-studio-v2-live/)

**Rule:** Merged ≠ live ≠ visible. Every row needs Gate(s) + Prod state + persona visibility. PRs that add a feature/flag must update this file and state rollout: `ON at merge` or `OFF until <condition>, owner <name>`.

Personas: **paid** = TAL-93900 (Jor clone) · **free** = Valeria TAL-93901 · **fresh** = new Free signup · **visitor** = public site · **admin** = platform admin.

---

## User-facing features

| Feature | PRs | Gate(s) | Prod state | Visible to: paid / free / fresh / visitor / admin | Last verified live | Owner | Notes |
|---|---|---|---|---|---|---|---|
| Presence tabs (My website / Where I appear / Discover networks) | #2494 #2497 + Studio | `TALENT_STUDIO_V2` | **ON** (`1`) | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-04 01:07Z · tip `56f0` · [built-vs-live/03-presence-tabs.png](../../../media/built-vs-live/03-presence-tabs.png) | product | LIVE re-prove paid; NODE_ENV defaults killed [#2504](https://github.com/orantene/impronta-app/pull/2504) |
| Studio shell (identity bar, mobile bottom nav, trial chip) | Studio V2 | `TALENT_STUDIO_V2` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-04 01:07Z · `01-login-ok.png` | product | Identity / manage-site bar ✅ |
| Agenda V2 (Today / Calendar) | prior | `TALENT_AGENDA_V2=all` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-04 01:07Z · `01/02-*.png` | product | |
| Messages v5 (talent inbox / fee lines) | #2460 | `TALENT_STUDIO_V2` **or** `NEXT_PUBLIC_MESSAGES_V5` | **ON** (both `1`) | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-04 01:07Z · `06-messages.png` → `/talent/inbox` | product | Inbox ✅ |
| Free website + Free Builder | #2495 #2471 | `TALENT_FREE_WEBSITE_ENABLED` | **ON** (`true`) | n/a / ✅ / ✅ / ✅ (public) / n/a | 2026-10-03 21:12Z · `visitor/51-valeria-public-booking.png` + Valeria Presence | product | Public site + booking CTA ✅ |
| Theme gallery (finished Maison/Folio/Gridline set) | #2475 #2474 #2494 #2496 | `TALENT_THEME_GALLERY_ENABLED` + `TALENT_MAISON_THEME_ENABLED=all` | **ON** (`1` + `all`) | ✅ / ✅ / ✅ entry / n/a / n/a | 2026-10-04 01:07Z · tip `56f0` · [built-vs-live/04-theme-gallery.png](../../../media/built-vs-live/04-theme-gallery.png) (DOM: Maison/Folio/Gridline) | product | Smoke expectation [#2512](https://github.com/orantene/impronta-app/pull/2512) **LIVE** `a717` (`all`) |
| Theme release chain (Factory → Open to talents → ThemeUpdateNotice → preview → apply) | theme-releases Phase 3–4 | platform-admin Factory + open optin/default releases | **partial LIVE** | notice/apply ✅ paid / n/a / n/a / n/a / Factory ❌ blocked | 2026-10-03 23:35Z · tip `c3214cac3` · [theme-release-chain/](../../../media/theme-release-chain/) (`t93900-22/30/31/32-*.png`) | product | TAL-93900 Maison v2 **21→23** notice + draft preview + Apply toast **PASS**. New Factory publish **BLOCKED** (stale `QA_PLATFORM_ADMIN_PASSWORD`). Catalog maison-v2 still v14 until Make default; Folio catalog already v23 default |
| Website settings | #2389+ | `TALENT_WEBSITE_SETTINGS_ENABLED=all` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-04 01:07Z · [built-vs-live/05-website-settings.png](../../../media/built-vs-live/05-website-settings.png) | product | Ajustes del sitio sheet ✅; Story 2 each-setting→live still owed |
| Talent subdomains `*.tulala.digital` | prior | `TALENT_SITE_SUBDOMAINS_ENABLED` | **ON** (`true`) | ✅ / ✅ / ✅ / ✅ / n/a | 2026-10-03 21:12Z · `visitor/50-*-public-cookie*.png` + booking | product | Jor + Valeria public hosts live |
| Preview eye → live site | #2493 | subdomains help | **ON** (code) | ✅ / ✅ / ✅ / n/a / n/a | prior Studio / dash QA | product | |
| Dashboard teal / Alba tokens | #2491 #2497 #2498 | none | **ON** | ✅ / ✅ / ✅ / n/a / n/a | tip `7d30bb9d1` | product | |
| Avatar menu → Builder/Money/Messages/Settings | #2492 #2506 | none | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-04 tip `339dec9b8` · [talent-dashboard-audit/2506-avatar-tal-code.png](../../../media/talent-dashboard-audit/2506-avatar-tal-code.png) | product | Subtitle shows TAL code (#2506) |
| Unrostered wall skip | #2490 | none | **ON** | ✅ / ✅ / ✅ / n/a / n/a | prior | product | |
| Languages / AI talent translate | #2432–#2434 | `settings.ai_talent_translate_enabled` | **ON** (DB `true`) | ✅ / ✅ / ✅ / ✅ / n/a | DB verified 2026-10-03 | product | Prove ES+EN talent live still owed |
| Maison theme apply (Change design / Colors) | #2429 #2499 + env | `TALENT_MAISON_THEME_ENABLED=all` | **ON** (`all`) | dashboard ✅ / public ✅ (TAL-JOR / book-jorgelina) / fresh unproven / n/a / n/a | 2026-10-04 01:07Z · tip `56f0` · gallery + [built-vs-live/10-jor-public.png](../../../media/built-vs-live/10-jor-public.png) | product | Env=`all` (not cohort). Smoke matrix sync [#2512](https://github.com/orantene/impronta-app/pull/2512). Content/hydration completeness = sibling lane |
| Custom domain Connect + help | #2453 | none (Connect path) | **ON** | ✅ / ✅ / ✅ / n/a / n/a | tip | product | |
| Domain Buscar / buy | #2500 | registrar tokens unset | **parked** (Coming soon) | Coming soon / same / same / n/a / n/a | tip `7d30bb9d1` | Oran | Stay parked |
| Client-pays / pass_through fees | #2487 #2460 | env `COMMISSION_PROCESSING_PASS_THROUGH=1` + DB `pass_through` 150bps | **ON** | UI ✅; paid path ops / limited / limited / visitor checkout / admin | env+DB 2026-10-03 | product | Stories 4–6 still running |
| Legal refunds EN/ES | #2480 | none | **ON** | n/a / n/a / n/a / ✅ / n/a | prior `20-public-legal-refunds.png` | product | |
| Support Desk host | #2473 #2483 #2501 **#2505** | `SUPPORT_DESK_ENABLED` | **ON** (`1`) — **do not flip without Oran** | ❌ talent / ❌ / ❌ / ❌ / ✅ admin portal | tip includes #2505; admin Desk prior P2.5 | eng | Flag already ON. Built-vs-Live **did not touch**. Talent-facing Desk stays admin-gated |
| Builder auto thumbnail | A8 | `BUILDER_AUTO_THUMBNAIL_ENABLED` | **ON** (`1`) | n/a (background) | env 2026-10-03 | eng | best-effort |
| Builder rollout cron | cron | `BUILDER_ROLLOUT_CRON_ENABLED` | **ON** (`1`) | n/a (background) | env; 0 rows ramping | eng | |
| Media private access | media | env `MEDIA_PRIVATE_ACCESS_ENABLED` + DB | **ON** | gated URLs | env+DB true | eng | |
| Reap support replays | cron | `REAP_SUPPORT_REPLAYS_ENABLED` | **ON** (`true`) — sibling flipped | n/a (cron) | env created this wave | Oran confirm | Retention — confirm OK in batched asks |
| Client welcome email | onboarding | `CLIENT_WELCOME_EMAIL_ENABLED` | **OFF** (unset) | — | — | Oran | Needs SPF/DKIM + suppressions |
| Talent site consent tooling | footer | `TALENT_SITE_CONSENT_TOOLING_ENABLED` | **OFF** (unset) — on purpose | n/a / n/a / n/a / cookie UI ✅ / n/a | 2026-10-04 01:07Z · [built-vs-live/12-cookie-or-consent.png](../../../media/built-vs-live/12-cookie-or-consent.png) | Oran / product | Accept/Decline live on app login (#2502). Tooling flag stays OFF until finished |
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
| Guest production hCaptcha | prior | tenant/platform captcha + `platform_settings.guest_captcha_enforced` | **DB OFF** since 00:19:41Z (QA testing) · default ON for real guests | n/a / n/a / n/a / skip while OFF / n/a | SQL OFF recheck 2026-10-04 01:40Z | product | Re-enable before Jorgelina handover |
| Platform-admin guest captcha off switch | [#2509](https://github.com/orantene/impronta-app/pull/2509) `339dec9b8` · [bc-32186601](https://cursor.com/agents/bc-32186601-e1fc-5870-9896-941eff869d1c) | HQ Settings → `guest_captcha_enforced` | **tip LIVE** `339dec9b8` · DB **OFF** · prove owed | n/a / n/a / n/a / n/a / ✅ HQ | tip+HTML 2026-10-04 01:40Z · `jorg-beauty-qa`=`dpl_6W99knV63…` | eng | Prove skip: [Flip captcha off LIVE](https://cursor.com/agents/bc-c81d48b1-f116-55e4-872e-7823a8f82e8e). Re-enable before Jorgelina. [guest-captcha-admin-switch.md](../../guest-captcha-admin-switch.md) · [OFF log](../../../internal/guest-captcha-tip-chase-off-log.md) |

---

## Env flag matrix (production, verified)

| Flag | Default when unset | Dev-default? | Prod value | What it gates |
|---|---|---|---|---|
| `TALENT_STUDIO_V2` | OFF (explicit only) | **no** — killed [#2504](https://github.com/orantene/impronta-app/pull/2504) `74a25e5a0` | `1` | Presence / Studio shell |
| `TALENT_AGENDA_V2` | OFF unless `all`/list | no | `all` | Today/Calendar v2 |
| `TALENT_FREE_WEBSITE_ENABLED` | OFF | no | `true` | Free site + Builder |
| `TALENT_THEME_GALLERY_ENABLED` | OFF | no | `1` | Designs / Looks |
| `TALENT_WEBSITE_SETTINGS_ENABLED` | OFF | no | `all` | Website settings |
| `TALENT_SITE_SUBDOMAINS_ENABLED` | OFF | no | `true` | `*.tulala.digital` |
| `NEXT_PUBLIC_MESSAGES_V5` | OFF | no | `1` | Messages v5 bake |
| `TALENT_MAISON_THEME_ENABLED` | OFF | no | `all` | Maison for every talent — [#2512](https://github.com/orantene/impronta-app/pull/2512) **LIVE** `a717b208a` (smoke expectation=`all`) |
| `TALENT_MAISON_THEME_TALENTS` | empty | no | 2 UUIDs (unused while mode=`all`) | Allow-list (legacy; still present) |
| `BUILDER_AUTO_THUMBNAIL_ENABLED` | OFF | no | `1` | Publish thumbs |
| `BUILDER_ROLLOUT_CRON_ENABLED` | OFF | no | `1` | Ramp cron |
| `MEDIA_PRIVATE_ACCESS_ENABLED` | OFF | no | `1` | Gated media |
| `REAP_SUPPORT_REPLAYS_ENABLED` | OFF | no | `true` | Replay reap cron |
| `COMMISSION_PROCESSING_PASS_THROUGH` | OFF | no | `1` | Client-pays arming |
| `CLIENT_WELCOME_EMAIL_ENABLED` | OFF | no | unset | Welcome mail |
| `TALENT_SITE_CONSENT_TOOLING_ENABLED` | OFF | no | unset | Footer privacy choices |
| `SUPPORT_DESK_ENABLED` | OFF (explicit only) | **no** — killed [#2504](https://github.com/orantene/impronta-app/pull/2504) `74a25e5a0` | `1` (untouched) | Desk host — admin portal; leave alone |

---

## Process (permanent)

1. New feature/flag PR → update a row here + PR checkbox "Feature registry updated" + rollout line.
2. Flag OFF >7 days without reason → daily summary callout.
3. Weekly live sweep (Monday + after big merges): re-verify rows; disappeared → ❌ top priority.
4. Daily summary line: `Features: X live / Y hidden-on-purpose / Z hidden-by-mistake (fixed today: …)`.
5. Smoke verifies flags: `deploy:smoke` probes `GET /api/health/flags` (platform-admin / CRON_SECRET) and fails if any key in `web/scripts/prod-flag-expectations.mjs` is missing or wrong. Keep that matrix in sync with the env table above. (#2507 on tip; Maison expectation=`all` via [#2512](https://github.com/orantene/impronta-app/pull/2512) `a717b208a`. Agent smoke 2026-10-04: flags check blocked — `CRON_SECRET` missing in shell.)
6. **Done board Live proof:** a STATUS.md ✅ requires a production screenshot from `app.tulala.digital` as TAL-93900 (linked in Evidence). Localhost / code-only / tip SHA without shot → 🟡 or **Live proof owed**. See [STATUS.md](./STATUS.md) Process.
