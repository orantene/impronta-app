# Built vs visible — production audit

Updated: 2026-10-03 ~21:00Z · Live tip `7d30bb9d1` · `origin/main` `1d56220d1` (#2501 merged, awaiting production pointer)  
Auditor (this pass): `bc-65f24c00` · Prior inventory: `bc-f9287003` · Studio V2: `bc-23b4c587` · Live persona shots: `bc-bd75d44f` → [media/built-vs-live-audit/](../../../media/built-vs-live-audit/)  
**Canonical registry:** [FEATURES.md](./FEATURES.md) · Launch one-pager: [LAUNCH-VIEW.md](./LAUNCH-VIEW.md) · Asks: [oran-batched-asks.md](../oran-batched-asks.md)  
Prior actions: [visibility-enable-actions.md](../visibility-enable-actions.md) · [put-all-live.md](../put-all-live.md)

## Verdict for Oran

Finished+safe product flags are **already ON** in Vercel production (verified this pass — no silent re-flips). Studio V2 Presence tabs are live. The remaining “built but dark” set is intentional or Oran-gated: Desk (wait for production tip + your OK), welcome email, consent tooling, Maison=`all`, registrar buy.

**This pass flipped:** nothing new on Vercel/DB (siblings already enabled). **This pass ships:** FEATURES registry, LAUNCH-VIEW, batched asks, and PR to kill NODE_ENV flag defaults.

## Env + DB (verified 2026-10-03)

| Flag | Prod now | Safe? |
|---|---|---|
| `TALENT_STUDIO_V2` | **`1`** (prod+preview) | Yes — live |
| `TALENT_FREE_WEBSITE_ENABLED` | **`true`** | Yes |
| `TALENT_THEME_GALLERY_ENABLED` | **`1`** | Yes |
| `TALENT_WEBSITE_SETTINGS_ENABLED` | **`all`** | Yes |
| `TALENT_SITE_SUBDOMAINS_ENABLED` | **`true`** | Yes |
| `NEXT_PUBLIC_MESSAGES_V5` | **`1`** | Yes |
| `TALENT_AGENDA_V2` | **`all`** | Yes |
| `TALENT_MAISON_THEME_*` | `talents` + 2 UUIDs | Keep cohort |
| `BUILDER_AUTO_THUMBNAIL_ENABLED` | **`1`** | Yes |
| `BUILDER_ROLLOUT_CRON_ENABLED` | **`1`** | Yes |
| `MEDIA_PRIVATE_ACCESS_ENABLED` | **`1`** (+ DB true) | Yes |
| `REAP_SUPPORT_REPLAYS_ENABLED` | **`true`** | Confirm retention |
| `COMMISSION_PROCESSING_PASS_THROUGH` | **`1`** (+ DB pass_through 150bps) | Yes |
| `CLIENT_WELCOME_EMAIL_ENABLED` | unset | Keep OFF |
| `TALENT_SITE_CONSENT_TOOLING_ENABLED` | unset | Keep OFF |
| `SUPPORT_DESK_ENABLED` | unset | Wait tip + Oran |

### DB

| Gate | State |
|---|---|
| `settings.ai_*` | Almost all **true** (incl. `ai_talent_translate_enabled`) |
| `platform_settings.media_private_access_enabled` | **true** |
| `platform_settings.workspace_support_enabled` | **true** (legacy HQ) |
| `platform_settings.workspace_fab_enabled` | **true** |
| `platform_commission_config.processing_mode` | `pass_through` / 150 bps |

## Dangerous pattern (fix in flight)

`TALENT_STUDIO_V2` and `SUPPORT_DESK_ENABLED` historically defaulted ON when `NODE_ENV=development`. [#2504](https://github.com/orantene/impronta-app/pull/2504) makes unset → OFF everywhere + static guard `no-flag-node-env-default.static.test.ts`.

## Evidence

- Sibling live shots: `media/built-vs-live-audit/` (in progress: tal-93900-jor, valeria-free, …)
- Prior Presence proof: `media/talent-studio-v2-live/`, `media/visibility-audit/`
