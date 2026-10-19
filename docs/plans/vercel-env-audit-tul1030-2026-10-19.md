# Vercel env audit (TUL-1030), 2026-10-19

Findings 7-11 were folded in from the dev session's parallel audit (2026-10-19, names only) and re-checked against origin/main.

Project `tulala` (prj_oM9OZ4CLewpMPxpKfkacWs9nRcA2). **Names and scopes only; no value was read** (except the non-secret flag `STRIPE_FORCE_TEST_MODE`, which is `1` on Preview and Production). Pulled with `vercel api /v10/projects/<id>/env`, values dropped before anything was written.

**167 entries, 107 names.** 49 names are Production-only, 9 Preview-only, 41 have at least one branch-scoped entry, 20 have a Development entry, 16 exist in all three.

## Findings, worst first
1. **Production runs the Stripe sandbox.** `STRIPE_FORCE_TEST_MODE=1` on Production, and every Stripe name has a `_TEST` sibling there. Until the live switch the bare live names are ignored (see TUL-186 checklist). After the switch, delete the Production `_TEST` siblings within a week so nobody edits the wrong one.
2. **Preview is missing `_TEST` siblings while forcing test mode.** Missing on Preview: `STRIPE_WEBHOOK_SECRET_TEST` (staging webhooks 503 on the next build; #4051 writes it), `STRIPE_MX_WEBHOOK_SECRET_TEST`, `STRIPE_WEBHOOK_SECRET_CONNECT_TEST`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST`, `STRIPE_MX_PUBLISHABLE_KEY_TEST`. Plan checkout is hosted (no publishable key needed), but booking `PayNowSheet` uses `loadStripe`: guest card payment on staging will not load until the publishable `_TEST` key is set.
3. **Three entries are ONE value shared by Production and Preview**: `GOOGLE_DRIVE_API_KEY`, `SUPPORT_DESK_ENABLED`, `TALENT_STUDIO_V2`. Editing one for staging changes production. Split each into two entries.
4. **Stale branch scopes.** `qa/stripe-test-r2` (branch still exists) carries `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `COMMISSION_PROCESSING_PASS_THROUGH`, `SKIP_MIGRATION_DRIFT_CHECK`. `cursor/qa-isolated-target-guard-11b1` (branch GONE) still scopes `NEXT_PUBLIC_MESSAGES_V5`. Delete both sets (the first holds a service-role key for a dead QA run).
5. **Staging is split between `preview@main` and preview-wide.** Example: `STRIPE_SECRET_KEY` is `@main`, its `_TEST` sibling is preview-wide; `NEXT_PUBLIC_SITE_URL` exists both preview-wide and `@main`. Only `main` builds staging, so one rule is enough.
6. **`SKIP_MIGRATION_DRIFT_CHECK` is set on Production.** It turns off the guard that catches code shipped ahead of its migration. Confirm it is intended; otherwise remove.
7. **Development carries PRODUCTION values.** 20 names have a Development entry, and these are ONE entry shared with Production (`production+development` in the list below), i.e. the same value: `GOOGLE_PLACES_API_KEY`, `GUEST_COOKIE_SECRET`, `IMPERSONATION_COOKIE_SECRET`, `IMPERSONATION_QA_TALENT_USER_ID`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `_ANON_KEY` (the prod project), `OPENAI_API_KEY`, `PREVIEW_JWT_SECRET`, `SUPABASE_ACCESS_TOKEN`. Others (`AI_CREDENTIALS_ENCRYPTION_KEY`, Upstash) sit in Development too. `vercel env pull` for development hands out prod cookie/JWT secrets and the prod Supabase project. Local work uses `web/.env.local` and the lh isolated env, so remove these from Development.
8. **Duplicate Preview scopes.** `NEXT_PUBLIC_SITE_URL` and `IMPERSONATION_QA_CLIENT_USER_ID` each have a preview-wide AND a `preview@main` entry; the branch one wins on `main`, so the other is dead or surprising. Keep one.
9. **Security names read by code but set in NO environment** (checked on origin/main 2026-10-19; confirm each is "off by design"):

| Name | What happens while it is unset | Where to set it |
|---|---|---|
| `INVITE_TOKEN_HMAC_SECRET` | `/invite/[token]` redirects every invite to the config-error page (`app/invite/[token]/route.ts:42`): invite links cannot work | Production + Preview if invites are in use |
| `LEGAL_IP_HASH_SALT` | `hashIp` falls back to the public constant `tulala-legal` (`lib/legal/acceptances.core.ts:47`): legal-acceptance IP hashes are effectively unsalted | Production (random) |
| `SIGNUP_IP_SALT` | Falls back to the public constant `rostra-signup-v1` (`get-started/actions.ts:312`): same problem for signup IP hashes | Production (random) |
| `LINK_SCAN_SALT` | Scan-session hashing returns null (`lib/links/link-store.ts:339`): link scan analytics degrade, nothing breaks | Production |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push channel is off (`notifications/channels/push.ts:16`) | Production when push launches |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WEBHOOK_SECRET` | SMS (`messaging/channels/sms.ts:4`) and Twilio WhatsApp (`notifications/whatsapp/twilio.ts:26`) are off | Production when launched |

10. **Names new in open PRs** (set them before or with the PR, never copied across environments):

| Name | PR | Scope | While unset |
|---|---|---|---|
| `ACTOR_HEADER_SECRET` | #4038 (signed actor headers) | Production AND Preview, a DIFFERENT random value in each | Fast path off: slower, never wrong. A value shared by prod and staging would make a staging-signed header valid on prod |
| `DEV_SIGNIN_TOKEN` | #4038 | Non-production refs only (the PR refuses it on Vercel production) | Dev sign-in refused |
| `LOCAL_QA` | #4038 | Local only, never on Vercel (refused when `VERCEL=1`) | Off |
| `SERVICE_PRESENTATION_RESOLVER_ENABLED` | #4031 | Preview(main) when the PR is ready for staging QA | Flag off |

11. **Correction to docs/plans/staging-env-vars-needed-2026-10-18.md:** `TALENT_SITE_ROOT_DOMAIN` IS read by code. `resolveTalentSiteRootDomain` (`lib/talent-site/site-public-url.ts:55`) uses it off production to add the staging talent-site root (e.g. `staging.tulala.digital`). Production ignores it and always uses `tulala.digital`. It exists only as `preview@main`, which is correct for staging. Keep it.
12. **Type drift.** 26 names mix `encrypted`/`sensitive`/`plain` across scopes (e.g. `NEXT_PUBLIC_SUPABASE_URL`, `TALENT_*` flags). Secrets should be `sensitive`; public flags and URLs `plain`.

## Proposed layout
| Scope | Holds | Rule |
|---|---|---|
| **Production** | Live keys and secrets, prod Supabase (pluhda), prod hosts, feature flags. Until the live switch: `STRIPE_FORCE_TEST_MODE=1` + complete `_TEST` set. | One entry per name, never shared with Preview. Secrets `sensitive`. |
| **Preview = staging** | Stripe TEST only (`STRIPE_FORCE_TEST_MODE=1` + complete `_TEST` set, no bare live names), fxlank Supabase, staging hosts, staging gate. | **Preview-wide only** (no `@branch`), since only `main` builds staging (`ignoreCommand`). A branch scope is allowed only for a dated QA run and is deleted the same week. |
| **Development** | Nothing secret. Optional public defaults (`NEXT_PUBLIC_APP_URL` etc.). | Local dev reads `web/.env.local`; never put secrets here. |

## Moves (each is a dashboard edit for PM; no agent edited env except the staging webhook secret via #4051)
1. Set the missing Preview `_TEST` siblings (finding 2). Webhook one: run #4051's workflow. Publishable keys: PM pastes `pk_test_...` (not secret, but Stripe dashboard only).
2. Split the 3 shared entries (finding 3).
3. Delete the `qa/stripe-test-r2` and `cursor/qa-isolated-target-guard-11b1` entries (finding 4).
4. Collapse `preview@main` entries into preview-wide ones, one name at a time, deleting the duplicate (finding 5).
5. Remove Development-scope secrets, starting with the ones shared with Production (finding 7). Drop the duplicate Preview rows (finding 8).
5b. Set `LEGAL_IP_HASH_SALT`, `SIGNUP_IP_SALT` (random, Production) and decide `INVITE_TOKEN_HMAC_SECRET` (finding 9). Add `ACTOR_HEADER_SECRET` to Production and Preview with different values before #4038 deploys (finding 10).
6. After the live switch: delete Production `_TEST` siblings and the flag (finding 1).

## Full list (name | scopes | types)
`@branch` = git-branch-scoped Preview entry.

| Name | Scopes | Type |
|---|---|---|
| AI_CREDENTIALS_ENCRYPTION_KEY | development, production | encrypted/sensitive |
| ANTHROPIC_API_KEY | preview@main | sensitive |
| BUILDER_AUTO_THUMBNAIL_ENABLED | production | plain |
| BUILDER_ROLLOUT_CRON_ENABLED | production | plain |
| CHANNEL_WORKER_TOKEN | production | encrypted |
| CHANNEL_WORKER_URL | production | encrypted |
| CLIENT_ACCOUNT_HOSTS | preview@main, production | encrypted |
| COMMISSION_PROCESSING_PASS_THROUGH | preview@qa/stripe-test-r2, production | plain |
| CONNECTION_OAUTH_STATE_SECRET | production | sensitive |
| CRON_SECRET | preview@main, production | encrypted/sensitive |
| DATABASE_URL | preview@main, production | encrypted |
| ENABLE_SITE_SHELL | development, production | sensitive/encrypted |
| ENABLE_SITE_SHELL_EDIT | production | encrypted |
| GOOGLE_DRIVE_API_KEY | preview+production | sensitive |
| GOOGLE_PLACES_API_KEY | preview@main, production+development | sensitive/encrypted |
| GUEST_CHAT_CAPTCHA_WIDGET_READY | preview@main | sensitive |
| GUEST_COOKIE_SECRET | preview@main, production+development | encrypted |
| IMPERSONATION_COOKIE_SECRET | preview@main, production+development | sensitive/encrypted |
| IMPERSONATION_QA_CLIENT_USER_ID | preview, preview@main, production | sensitive/encrypted |
| IMPERSONATION_QA_TALENT_USER_ID | preview@main, production+development | sensitive/encrypted |
| INSTAGRAM_OAUTH_CLIENT_ID | production | encrypted |
| INSTAGRAM_OAUTH_CLIENT_SECRET | production | sensitive |
| MEDIA_PER_HUB_FACES_ENABLED | production | sensitive |
| MEDIA_PRIVATE_ACCESS_ENABLED | production | plain |
| MEDIA_REAPER_ENABLED | production | sensitive |
| MEDIA_REAPER_MAX_DELETIONS | production | sensitive |
| MEDIA_TWO_KEY_GRANTS_ENABLED | production | sensitive |
| MEDIA_URL_SIGNING_SECRET | production | sensitive |
| NEXT_PUBLIC_APP_URL | development, preview@main, production | encrypted/plain |
| NEXT_PUBLIC_BUILDER_CLIENT_CANVAS | production | plain |
| NEXT_PUBLIC_BUILDER_PRESENCE | production | encrypted |
| NEXT_PUBLIC_GA_MEASUREMENT_ID | production | sensitive |
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | preview@main, production+development | sensitive/plain |
| NEXT_PUBLIC_MESSAGES_V5 | preview@cursor/qa-isolated-target-guard-11b1, preview@main, production | plain/sensitive |
| NEXT_PUBLIC_SENTRY_DSN | preview, production | sensitive |
| NEXT_PUBLIC_SITE_URL | development, preview, preview@main, production | encrypted/plain |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | preview@main, preview@qa/stripe-test-r2, production | sensitive/encrypted |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST | production | encrypted |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | preview@main, preview@qa/stripe-test-r2, production+development | encrypted/plain |
| NEXT_PUBLIC_SUPABASE_URL | preview@main, preview@qa/stripe-test-r2, production+development | encrypted/plain |
| NEXT_PUBLIC_TURNSTILE_SITE_KEY | preview@main, production | sensitive |
| OPENAI_API_KEY | preview@main, production+development | sensitive/encrypted |
| PREVIEW_JWT_SECRET | preview@main, production+development | sensitive/encrypted |
| PREVIEW_QA_SIGNING_SECRET | preview@main | encrypted |
| REAP_SUPPORT_REPLAYS_ENABLED | production | plain |
| RESEND_API_KEY | preview@main, production | sensitive |
| RESEND_INBOUND_FORWARD_TO | production | sensitive |
| RESEND_WEBHOOK_SECRET | development, preview, production | sensitive |
| SEND_EMAIL_HOOK_SECRET | preview@main, production | sensitive |
| SITE_SHELL_EDIT_TENANT_IDS | production | encrypted |
| SITE_SHELL_TENANT_IDS | development, production | encrypted |
| SKIP_MIGRATION_DRIFT_CHECK | preview@main, preview@qa/stripe-test-r2, production | encrypted/plain/sensitive |
| STAGING_GATE_CI_TOKEN | preview | sensitive |
| STAGING_GATE_ENABLED | preview@main | sensitive |
| STAGING_GATE_PASSWORD | preview | sensitive |
| STRIPE_ALLOW_LIVE_PAYOUTS | production | sensitive |
| STRIPE_FORCE_TEST_MODE | preview, production | encrypted |
| STRIPE_MX_PUBLISHABLE_KEY | production | encrypted |
| STRIPE_MX_PUBLISHABLE_KEY_TEST | production | encrypted |
| STRIPE_MX_SECRET_KEY | production | sensitive |
| STRIPE_MX_SECRET_KEY_TEST | preview, production | sensitive |
| STRIPE_MX_WEBHOOK_SECRET | preview@main, production | sensitive |
| STRIPE_MX_WEBHOOK_SECRET_CONNECT | production | sensitive |
| STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST | preview, production | sensitive |
| STRIPE_MX_WEBHOOK_SECRET_TEST | production | sensitive |
| STRIPE_PRICE_AGENCY_ANNUAL | production | sensitive |
| STRIPE_PRICE_AGENCY_MONTHLY | production | sensitive |
| STRIPE_PRICE_NETWORK_ANNUAL | production | sensitive |
| STRIPE_PRICE_NETWORK_MONTHLY | production | sensitive |
| STRIPE_PRICE_STUDIO_ANNUAL | production | sensitive |
| STRIPE_PRICE_STUDIO_MONTHLY | production | sensitive |
| STRIPE_PRICE_TALENT_PORTFOLIO_ANNUAL | production | sensitive |
| STRIPE_PRICE_TALENT_PORTFOLIO_MONTHLY | production | sensitive |
| STRIPE_PRICE_TALENT_PRO_ANNUAL | production | sensitive |
| STRIPE_PRICE_TALENT_PRO_MONTHLY | production | sensitive |
| STRIPE_SECRET_KEY | preview@main, preview@qa/stripe-test-r2, production | sensitive |
| STRIPE_SECRET_KEY_TEST | preview, production | sensitive |
| STRIPE_V2_SECRET_KEY | production | sensitive |
| STRIPE_WEBHOOK_SECRET | preview@main, production | sensitive |
| STRIPE_WEBHOOK_SECRET_CONNECT | development, preview, production | sensitive/encrypted |
| STRIPE_WEBHOOK_SECRET_CONNECT_TEST | production | sensitive |
| STRIPE_WEBHOOK_SECRET_TEST | production | sensitive |
| SUPABASE_ACCESS_TOKEN | preview@main, production+development | sensitive/encrypted |
| SUPABASE_SERVICE_ROLE_KEY | preview@main, preview@qa/stripe-test-r2, production | sensitive/encrypted |
| SUPPORT_DESK_ENABLED | production+preview | plain |
| SUPPORT_INBOUND_DOMAIN | production | sensitive |
| TALENT_AGENDA_V2 | preview@main, production | sensitive/plain |
| TALENT_AGENDA_V2_TALENTS | production | sensitive |
| TALENT_FREE_WEBSITE_ENABLED | preview@main, production | sensitive/plain |
| TALENT_MAISON_THEME_ENABLED | preview, production | plain |
| TALENT_MAISON_THEME_TALENTS | production | plain |
| TALENT_SITE_ROOT_DOMAIN | preview@main | sensitive |
| TALENT_SITE_SUBDOMAINS_ENABLED | preview@main, production | sensitive/plain |
| TALENT_STUDIO_V2 | production+preview | plain |
| TALENT_THEME_GALLERY_ENABLED | preview@main, production | sensitive/plain |
| TALENT_WEBSITE_SETTINGS_ENABLED | production | plain |
| TIKTOK_OAUTH_CLIENT_KEY | production | encrypted |
| TIKTOK_OAUTH_CLIENT_SECRET | production | sensitive |
| TULALA_ALLOW_DEV_SURFACES | preview@main | encrypted |
| TULALA_MARKETING_ORIGIN | preview@main | sensitive |
| TULALA_WHATSAPP_TENANTS | production | plain |
| TURNSTILE_SECRET | preview@main, production | sensitive |
| UPSTASH_REDIS_REST_TOKEN | development, preview@main, production | encrypted/sensitive |
| UPSTASH_REDIS_REST_URL | development, preview@main, production | encrypted/sensitive |
| USAGE_AUDIT_EMAIL_TO | production | sensitive |
| VERCEL_FORCE_NO_BUILD_CACHE | development | sensitive |
| WHATSAPP_WEBHOOK_SECRET | production | encrypted |