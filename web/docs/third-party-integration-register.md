# Third-party integration register

Status of each row is a fact about NAMES in Vercel (`vercel env ls`), checked from the linked `web/` directory (the command prints nothing from an unlinked worktree). A row marked NONE is a code path that runs with no credential behind it; each one is either owed by the owner or dead code to remove, never silently both.

Production grant facts for the integration tables and DEFINER RPCs live in migration `20260906031100_integration_grants_and_definer_rpc_hygiene.sql` and were verified by `has_table_privilege` / `has_function_privilege` after apply, never by the migration line.

Owner: IT Integration and Security Director. Kept current by that role. One row per credential. "Present" means the NAME exists in the Vercel environment listed (`vercel env ls --scope oran-tenes-projects`), verified on the date in the last column. Values are never recorded here.

| Integration | Credential name | Environments present | Owner (account) | Scope / purpose | Code path | Rotation | Verified |
|---|---|---|---|---|---|---|---|
| Supabase | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | prod, preview, dev | owner | anon client | web/src/lib/supabase/* | n/a (public) | 2026-09-05 |
| Supabase | SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN, DATABASE_URL | prod, preview | owner | server writes bypassing RLS; migrations | web/src/lib/supabase/admin.ts, scripts | never rotated (no record) | 2026-09-05 |
| Stripe | STRIPE_SECRET_KEY, STRIPE_V2_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_CONNECT, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_* (10), STRIPE_ALLOW_LIVE_PAYOUTS | prod | owner | payments, Connect, webhooks | web/src/lib/stripe/*, api/webhooks/stripe/* | never rotated (no record) | 2026-09-05 |
| Resend | RESEND_API_KEY, RESEND_WEBHOOK_SECRET, SEND_EMAIL_HOOK_SECRET | prod | owner | transactional email, bounce webhook, auth email hook | web/src/lib/notifications/*, resend-webhook.ts | never rotated (no record) | 2026-09-05 |
| Google Maps | NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | prod, preview | owner | browser maps | site sections location_map | public key, referrer restriction to verify | 2026-09-05 |
| Google Places | GOOGLE_PLACES_API_KEY | prod | owner | server place lookups | web/src/lib/places/* | never rotated | 2026-09-05 |
| Google Drive | GOOGLE_DRIVE_API_KEY | preview (+?) | owner | media import | web/src/lib/media/drive* | never rotated | 2026-09-05 |
| Google connection OAuth (YouTube) | GOOGLE_CONNECTION_OAUTH_CLIENT_ID, GOOGLE_CONNECTION_OAUTH_CLIENT_SECRET | NONE | not created | youtube.readonly connect | web/src/lib/connection-oauth/youtube.ts, callback/google | n/a | 2026-09-05 |
| Connection OAuth state | CONNECTION_OAUTH_STATE_SECRET | NONE | not minted | HMAC of OAuth state (all vendors) | web/src/lib/connection-oauth/state.ts | to define: rotate yearly, dual-key window 10 min | 2026-09-05 |
| Meta / Instagram | INSTAGRAM_OAUTH_CLIENT_ID, INSTAGRAM_OAUTH_CLIENT_SECRET | NONE | Meta app not created (owner's Chrome not signed in to Meta) | instagram_business_basic | connection-oauth/instagram.ts, callback/instagram | n/a | 2026-09-05 |
| TikTok | TIKTOK_OAUTH_CLIENT_KEY, TIKTOK_OAUTH_CLIENT_SECRET | NONE | TikTok app not created | user.info.basic, video.list | connection-oauth/tiktok.ts, callback/tiktok | n/a | 2026-09-05 |
| OpenAI | OPENAI_API_KEY | prod | owner | AI drafting, support chat | web/src/lib/ai/* | never rotated | 2026-09-05 |
| Upstash Redis | UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN | prod, preview | owner | rate limits, holds | web/src/lib/rate-limit/* | never rotated | 2026-09-05 |
| Sentry | NEXT_PUBLIC_SENTRY_DSN | prod, preview | owner | error reporting | sentry.*.config | public DSN | 2026-09-05 |
| GA4 | NEXT_PUBLIC_GA_MEASUREMENT_ID | prod | owner | analytics | app layout | public id | 2026-09-05 |
| Anthropic | ANTHROPIC_API_KEY | NONE | not set | AI bio translation, platform translations page | web/src/lib/translation/ai-translate-bio.ts, platform/admin/translations/page.tsx | n/a; the code path runs with no key | 2026-09-06 |
| Captcha (platform fallback) | HCAPTCHA_SECRET, TURNSTILE_SECRET | NONE | not set | server verification when a tenant supplies no captcha secret | web/src/lib/captcha/verify.ts, integrations/resolve.ts | n/a; tenant-supplied secrets in the vault are the live path | 2026-09-06 |
| Web push | VAPID_PRIVATE_KEY, VAPID_SUBJECT (public key pairs with it) | NONE | generated, not set (see pending_support_env_vars) | support push notifications | web/src/lib/notifications/channels/push.ts | n/a | 2026-09-06 |
| Twilio WhatsApp | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM | NONE | owner's Twilio account needed | support WhatsApp channel | web/src/lib/notifications/channels/whatsapp.ts | n/a | 2026-09-06 |
| Google Search Console reporting | GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON | NONE | service account not created | GSC reporting | web/src/lib/server/gsc-reporting.ts | n/a | 2026-09-06 |
| Google Analytics reporting | GOOGLE_ANALYTICS_CREDENTIALS_JSON | NONE | service account not created | GA4 reporting | web/src/lib/server/ga4-reporting.ts | n/a | 2026-09-06 |
| Stripe (additional webhook endpoints) | STRIPE_V2_WEBHOOK_SECRET, STRIPE_CLIENT_SUBSCRIPTION_WEBHOOK_SECRET | NONE | endpoints not registered in Stripe | /api/webhooks/stripe-v2, /api/discover/subscriptions/webhook | those two routes | n/a; both routes refuse or no-op without the secret, verify which | 2026-09-06 |
| Internal secrets | AI_CREDENTIALS_ENCRYPTION_KEY (vault, AES-256-GCM), CRON_SECRET, GUEST_COOKIE_SECRET, IMPERSONATION_COOKIE_SECRET, MEDIA_URL_SIGNING_SECRET, PREVIEW_JWT_SECRET | prod (+preview for some) | platform | see names | credential-vault.ts, api/cron/*, guest cookies, impersonation, media signing, preview | vault key CANNOT rotate without re-encrypting tenant_integration_secrets (no tool exists) | 2026-09-05 |

Tenant-supplied credentials (stored encrypted in tenant_integration_secrets, per tenant): Google Maps, GA4, Meta Pixel, TikTok Pixel, LinkedIn Insight, GTM, Search Console, Captcha, Email domain, AI provider keys. Owner: the tenant. Code: web/src/lib/integrations/repository.ts.
