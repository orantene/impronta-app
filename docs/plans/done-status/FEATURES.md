# Feature registry — built vs live

Updated: 2026-10-03 ~21:00Z · Auditor: `bc-65f24c00` · Live tip (production pointer): `7d30bb9d1` · `origin/main`: `1d56220d1` (#2501 merged, not yet on production pointer)  
Brief: [BUILT-VS-LIVE-AUDIT-2026-10-03.md](../BUILT-VS-LIVE-AUDIT-2026-10-03.md) · Inventory: [VISIBILITY.md](./VISIBILITY.md) · Launch: [LAUNCH-VIEW.md](./LAUNCH-VIEW.md) · Asks: [oran-batched-asks.md](../oran-batched-asks.md)  
Shots: [media/built-vs-live-audit/](../../../media/built-vs-live-audit/) (sibling `bc-bd75d44f`) · Prior: [media/visibility-audit/](../../../media/visibility-audit/) · [media/talent-studio-v2-live/](../../../media/talent-studio-v2-live/)

**Rule:** Merged ≠ live ≠ visible. Every row needs Gate(s) + Prod state + persona visibility. PRs that add a feature/flag must update this file and state rollout: `ON at merge` or `OFF until <condition>, owner <name>`.

Personas: **paid** = TAL-93900 (Jor clone) · **free** = Valeria TAL-93901 · **fresh** = new Free signup · **visitor** = public site · **admin** = platform admin.

---

## User-facing features

| Feature | PRs | Gate(s) | Prod state | Visible to: paid / free / fresh / visitor / admin | Last verified live | Owner | Notes |
|---|---|---|---|---|---|---|---|
| Presence tabs (My website / Where I appear / Discover networks) | #2494 #2497 + Studio | `TALENT_STUDIO_V2` | **ON** (`1`) | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 · `media/built-vs-live-audit/tal-93900-jor/10-presence.png` + sibling Studio shots | product | Dev-default killed in PR `cursor/kill-feature-flag-dev-defaults-c337` |
| Studio shell (identity bar, mobile bottom nav, trial chip) | Studio V2 | `TALENT_STUDIO_V2` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 · `media/talent-studio-v2-live/05-identity-bar.png` | product | |
| Agenda V2 (Today / Calendar) | prior | `TALENT_AGENDA_V2=all` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 · jor `02-today.png` | product | |
| Messages v5 (talent inbox / fee lines) | #2460 | `TALENT_STUDIO_V2` **or** `NEXT_PUBLIC_MESSAGES_V5` | **ON** (both `1`) | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 · jor `20-messages.png` | product | Accept/Decline + net split still need Story 7 click-through |
| Free website + Free Builder | #2495 #2471 | `TALENT_FREE_WEBSITE_ENABLED` | **ON** (`true`) | n/a / ✅ / ✅ / ✅ (public) / n/a | 2026-10-03 · prior `visibility-live-gates/22-public-valeria-site.png` | product | |
| Theme gallery (finished Maison/Folio/Gridline set) | #2475 #2474 #2494 #2496 | `TALENT_THEME_GALLERY_ENABLED` | **ON** (`1`) | partial / partial / partial / n/a / n/a | 2026-10-03 · sibling noted `13-gallery-entry-missing.png` on Presence — **nav/entry gap?** | product | Env ON; verify Designs entry path with sibling shots |
| Website settings | #2389+ | `TALENT_WEBSITE_SETTINGS_ENABLED=all` | **ON** | ✅ / ✅ / ✅ / n/a / n/a | 2026-10-03 · Ajustes on Presence Site tab | product | Story 2: each setting → live site still owed |
| Talent subdomains `*.tulala.digital` | prior | `TALENT_SITE_SUBDOMAINS_ENABLED` | **ON** (`true`) | ✅ / ✅ / ✅ / ✅ / n/a | 2026-10-03 · Valeria public site | product | |
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
| Support Desk host | #2473 #2483 **#2501** | `SUPPORT_DESK_ENABLED` | **OFF** (unset) | ❌ / ❌ / ❌ / ❌ / ❌ (404) | #2501 on `main` `1d56220d1`; **not** on production pointer yet | Oran | Enable only after pointer advances + Oran OK |
| Builder auto thumbnail | A8 | `BUILDER_AUTO_THUMBNAIL_ENABLED` | **ON** (`1`) | n/a (background) | env 2026-10-03 | eng | best-effort |
| Builder rollout cron | cron | `BUILDER_ROLLOUT_CRON_ENABLED` | **ON** (`1`) | n/a (background) | env; 0 rows ramping | eng | |
| Media private access | media | env `MEDIA_PRIVATE_ACCESS_ENABLED` + DB | **ON** | gated URLs | env+DB true | eng | |
| Reap support replays | cron | `REAP_SUPPORT_REPLAYS_ENABLED` | **ON** (`true`) — sibling flipped | n/a (cron) | env created this wave | Oran confirm | Retention — confirm OK in batched asks |
| Client welcome email | onboarding | `CLIENT_WELCOME_EMAIL_ENABLED` | **OFF** (unset) | — | — | Oran | Needs SPF/DKIM + suppressions |
| Talent site consent tooling | footer | `TALENT_SITE_CONSENT_TOOLING_ENABLED` | **OFF** (unset) | — | — | Oran / product | Tooling unfinished; cookie bar redesign separate |
| Admin workspace FAB | DB | `platform_settings.workspace_fab_enabled` | **ON** (`true`) | n/a / n/a / n/a / n/a / ✅ | SQL 2026-10-03 | product | Talent layout may still force FAB off |
| AI master + search/draft/support/translate/agent | DB `settings.ai_*` | almost all **true** | **ON** | varies | SQL 2026-10-03 | product | |
| WhatsApp channels | `TULALA_WHATSAPP_TENANTS` | pilot list only | **partial** | listed tenants only | env pilot | eng | Not global |
| Site shell render | `ENABLE_SITE_SHELL` | sensitive/encrypted | unknown/partial | tenant allow | leave | eng | Default-off by design for edit |
| Card redesign Phase 2 | prior | product OK | **built, waiting Oran** | — | — | Oran | Screenshots → yes/no |
| Front-door chat paid flip + `?order=` cold load | owed since 2026-09-17 | code | **owed / unproven** | visitor | — | eng | Fix + live test |
| AI booking assistant (S8) | — | n/a | **not built** | — | — | product | |
| ~32 themes / 224 demos | — | gallery | **partial** (4 finished) | — | — | product | Extra designs flag stays off |
| Premium app plan gate | — | n/a | **not built** | — | — | product | |
| Onboarding auto-publish + trade defaults | — | module flag ON; publish defaults missing | **not ready** | — | — | product | |

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
