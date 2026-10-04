# Built vs Live audit — 2026-10-04

Owner: Built-vs-Live lane (Oran offline ~10h)  
Live tip: **`a717b208a`** (production pointer + custom-domain HTML + Vercel READY `dpl_6C1BRo2w…`) · `origin/main` **`1e533011f`** (front-chat tip chase)  
Evidence: [media/built-vs-live/](../media/built-vs-live/) · [RESULT.md](../media/built-vs-live/RESULT.md) · Dashboard: [talent-dashboard-live-audit.md](./talent-dashboard-live-audit.md)  
Registry: [FEATURES.md](./plans/done-status/FEATURES.md) · Oran page: [LAUNCH-VIEW.md](./plans/done-status/LAUNCH-VIEW.md)  
Prior brief: [BUILT-VS-LIVE-AUDIT-2026-10-03.md](./plans/BUILT-VS-LIVE-AUDIT-2026-10-03.md)

---

## Verdict

**Finished + safe product gates are ON. LIVE HTML serves `a717b208a`.** Alias lag cleared 2026-10-04 ~02:17Z (`tulala.digital` + `app.tulala.digital` → `dpl_6C1BRo2w…`). Maison env=`all`. Smoke matrix [#2512](https://github.com/orantene/impronta-app/pull/2512) **LIVE** (`TALENT_MAISON_THEME_ENABLED` expectation=`all`).

**Did not flip `SUPPORT_DESK_ENABLED`.**

**Scoreboard:** ~22 live / 6 hidden-on-purpose / **0 hidden-by-mistake**.

**Sibling fold:** [talent-dashboard-live-audit.md](./talent-dashboard-live-audit.md) — 0 finished-but-hidden FAILs. Front-chat sibling owns tip-prove PAID/`?order=` on `1e533011f` after Structural → promote.

**Smoke (2026-10-04 ~02:18Z, after alias):** reachability/CSP/optimizer/Places/edge/alias-parity/cron-auth/auth-matrix **PASS**. Failures only: migration drift + taxonomy (no `.env.local`) + **flags probe blocked** (`CRON_SECRET` missing in agent env — re-requested). Not a product-gate fail.

---

## How we proved

| Source | Result |
|---|---|
| Vercel env (`tulala` / Production, decrypted plain) | Studio/Agenda/Free site/Gallery/Website settings/Subdomains/Messages v5/Maison=`all`/builder crons/media/reap/pass_through/Desk=`1` |
| Supabase (`pluhdapdnuiulvxmyspd`) | `ai_*` almost all true; `workspace_fab_enabled` true; `media_private_access_enabled` true; commission `pass_through` @ 150bps; `guest_captcha_enforced` **false** (testing) |
| LIVE UI TAL-93900 + visitor | Presence tabs, gallery Maison/Folio/Gridline, website settings sheet, Messages inbox, public Maison site — [media/built-vs-live/](../media/built-vs-live/) |
| `GET /api/health/flags` | Route on tip; **auth blocked here** — Production `CRON_SECRET` is Vercel `sensitive` (MCP cannot decrypt). Smoke needs that secret in shell. |

---

## ON in production (finished)

| Gate | Prod | LIVE proof |
|---|---|---|
| `TALENT_STUDIO_V2=1` | ON | Presence tabs `03-presence-tabs.png` |
| `TALENT_AGENDA_V2=all` | ON | Today `01/02-*.png` |
| `TALENT_FREE_WEBSITE_ENABLED=true` | ON | Gallery “Tu sitio web gratis” + Free path prior |
| `TALENT_THEME_GALLERY_ENABLED=1` | ON | `04-theme-gallery.png` (Maison/Folio/Gridline in DOM) |
| `TALENT_WEBSITE_SETTINGS_ENABLED=all` | ON | `05-website-settings.png` sheet |
| `TALENT_SITE_SUBDOMAINS_ENABLED=true` | ON | `jorg-beauty-qa` / `book-jorgelina` hosts |
| `NEXT_PUBLIC_MESSAGES_V5=1` | ON | `06-messages.png` → `/talent/inbox` |
| `TALENT_MAISON_THEME_ENABLED=all` | ON | Gallery + public Maison `10/11-*.png` |
| Builder thumbnail + rollout cron | ON | env |
| Media private access (env+DB) | ON | env `1` + DB true |
| `REAP_SUPPORT_REPLAYS_ENABLED=true` | ON | env (retention confirm still in asks) |
| `COMMISSION_PROCESSING_PASS_THROUGH` | ON | env `1` + DB `pass_through` 150bps |
| AI master / translate / search / … | ON | DB |
| Admin workspace FAB | ON | DB |
| Cookie Accept/Decline (app + marketing) | ON (UI) | `12-cookie-or-consent.png` — tooling flag still OFF |

---

## Still hidden (on purpose)

| Item | Why | Action |
|---|---|---|
| `CLIENT_WELCOME_EMAIL_ENABLED` | unset — real mail | Keep OFF until SPF/DKIM |
| `TALENT_SITE_CONSENT_TOOLING_ENABLED` | unset — unfinished tooling | Keep OFF |
| Domain registrar buy | Coming soon | Parked |
| WhatsApp | pilot tenant list only | Stay pilot |
| Site shell edit (`ENABLE_SITE_SHELL`) | default off | Stay off |
| Gallery extras / ~32 themes | unfinished | Stay off |
| Support Desk for talents | flag ON but admin-only product | **Do not flip further without Oran**; #2505 tipped; admin portal only |

---

## Drift fixed this wave

1. **Smoke matrix lag:** `prod-flag-expectations.mjs` expected Maison `talents`; live Vercel + FEATURES already `all`.  
   PR: [#2512](https://github.com/orantene/impronta-app/pull/2512) `cursor/sync-maison-all-flag-expectations-80a5`
2. **Docs:** FEATURES / LAUNCH-VIEW / batched asks updated for tip `56f0` + Maison=`all` already live.
3. **No env create/flip needed** for finished safe flags — already ON.

---

## NODE_ENV defaults

Static guard `#2504` + `no-flag-node-env-default.static.test.ts` on tip. Flag helpers scanned — no `NODE_ENV === "development"` ON defaults.

---

## Owed (not flag-hidden)

- Front-door chat paid flip + `?order=` cold load  
- Fresh Free signup → published URL (P2.1)  
- Jorgelina public content / Maison hydration (sibling tracks)  
- Captcha: DB OFF for QA; re-enable before Jorgelina handover  
- `deploy:smoke` flag check needs Production `CRON_SECRET` in agent shell  

---

## PRs

| PR | Purpose | State |
|---|---|---|
| [#2512](https://github.com/orantene/impronta-app/pull/2512) | Sync Maison smoke expectation → `all` | **Merged** `a717b208a` · **LIVE production** |
| [#2507](https://github.com/orantene/impronta-app/pull/2507) | `/api/health/flags` + smoke | Merged · on production tip |
| [#2504](https://github.com/orantene/impronta-app/pull/2504) | Kill NODE_ENV flag defaults | Merged · on tip |

---

## Daily line for Oran

`Features: ~22 live / 6 hidden-on-purpose / 0 hidden-by-mistake (#2512 LIVE HTML a717; Maison expectation=all; alias lag cleared; Desk untouched). Flags smoke needs CRON_SECRET. Tip 1e533 = front-chat chase.`
