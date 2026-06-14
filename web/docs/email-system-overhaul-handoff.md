# Email System Overhaul — New-Chat Handoff Prompt

Paste the block below into a fresh chat to kick off the email-system overhaul +
Platform-Admin email-management console. It is self-contained and grounded in a
real audit of the codebase (transport, notification engine, event catalog,
registration/commerce triggers, admin manageability) done 2026-06-14.

> **Env note (verified):** `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` **are**
> set in Vercel production (`vercel env ls production` + the live webhook returns
> 400 to an unsigned POST, not 503). Only `EMAIL_FROM` is missing. The local
> `.vercel/.env.production.local` file is stale — do not trust it; use
> `vercel env ls production`.

---

```
You are working on the Tulala/Impronta multi-tenant SaaS (Next.js [forked — read web/AGENTS.md + node_modules/next/dist/docs/ before writing code] + Supabase + Vercel). Repo: /Users/oranpersonal/Desktop/impronta-app, app under web/. `main` is canonical and auto-deploys to production on push; read web/CLAUDE.md for the FULL deploy + migration + branch protocol and follow it exactly (branch off main, one migration per agent, `npm run db:push` BEFORE merge if you add a migration, tsc+lint gate before every commit, `npm run deploy:smoke` after deploy).

MISSION
Make the ENTIRE email system work perfectly, end to end, and then make it polished — and build a Platform-Admin email-management console so a super_admin can observe, control, and (where feasible) edit the whole email flow without a code deploy. Plan this thoroughly FIRST (produce a working/not-working audit matrix + a phased plan), confirm the plan, then execute with real QA — including live test-sends — and prove each piece works before declaring done. Be blunt and honest in the audit; don't soften gaps.

CURRENT ARCHITECTURE (already mapped — verify, don't blindly trust)
- Provider: Resend, used via its Node SDK + Domains API + inbound webhook. The PLATFORM owns ONE Resend account/key; tenants never supply their own key. So yes — it's "the Resend API," and a management system on top of it is feasible because the building blocks already exist (see below).
- Send path: web/src/lib/email/index.ts (sendEmailResult/sendEmail) + web/src/lib/email/resend-client.ts (client singleton + "from" resolution). "From" resolves: tenant white-label verified domain → platform DB default (tenant_integrations row, key=email_domain, under DEFAULT_AI_TENANT_ID) → env EMAIL_FROM → hardcoded fallback.
- Notification engine: web/src/lib/notifications/dispatcher.ts + channels/email.ts + catalog*.ts (catalog.ts, catalog-slice-*.ts) + recipients.ts. ~35 event kinds. Every send is logged to the `notification_dispatch_log` table (status queued|sent|failed|skipped|suppressed, error_message, provider_reference=Resend id, event_kind, channel, delivered_at/opened_at/clicked_at/bounced_at/complaint_at). Templates are 100% React Email components in web/emails/*/ (code, not DB).
- Webhook: POST /api/webhooks/resend (web/src/app/api/webhooks/resend/route.ts + lib/notifications/resend-webhook.ts) — Svix-signed, records delivered/opened/clicked/bounced/complained, writes the `email_suppressions` table on hard bounce/complaint.
- Crons: /api/cron/retry-failed-emails, /api/cron/send-digest-emails (digest batching is BUILT but no catalog entry opts in yet).
- Tables: notification_dispatch_log, email_suppressions, tenant_integrations (email_domain config + verification), agency_entitlements (white_label_email flag), user_prefs (per-category notification toggles + unsubscribe_token).
- Auth emails (signup-confirm, password-reset) go through SUPABASE's native mail, NOT Resend — templates live in the Supabase dashboard, and they get NO notification_dispatch_log row. Guest-claim magic-links use admin.generateLink + a plain-HTML Resend send.

ENV TRUTH (verify with `vercel env ls production --scope oran-tenes-projects`, NOT the local .env files which are stale):
- RESEND_API_KEY: SET in prod. RESEND_WEBHOOK_SECRET: SET in prod (live webhook returns 400 to unsigned, not 503). UPSTASH_* : SET (anti-spam floor active).
- EMAIL_FROM: NOT set in prod. No platform DB email_domain default row exists either.

CRITICAL BUG TO FIX FIRST (root-caused, real, silent)
Some notification emails are silently FAILING in production. resolvePlatformEmailFrom() falls back to env EMAIL_FROM, which is unset, so it uses the hardcoded fallback in resend-client.ts:15 = "Impronta Agency <noreply@impronta.agency>" — but impronta.agency is NOT a verified domain on the Resend account (the verified domain is tulala.digital). Resend rejects: "This API key is not authorized to send emails from impronta.agency." Note the inconsistency: index.ts:20 falls back to the VERIFIED noreply@tulala.digital, but the engine path (resend-client.ts:15) falls back to the UNVERIFIED impronta.agency. Confirmed failing events in notification_dispatch_log include inquiry.submitted.talent, inquiry.submitted.coordinator, and workspace.over_seat_limit. These failures are INVISIBLE to Sentry because dispatcher.ts catches the throw and records status='failed' to the DB ledger via console logging only (never captureException) — so ALWAYS audit email health via the notification_dispatch_log table, not Sentry.
DECISION NEEDED FROM THE USER: should platform mail send from tulala.digital (verified now — quickest), or keep the Impronta brand and verify impronta.agency on Resend first? Then: unify the two fallbacks, set the platform default properly (EMAIL_FROM env and/or the platform email_domain DB row), and optionally retry the already-failed rows.

FULL SCOPE — every email must be verified working + polished. Build a per-event audit matrix (event kind → trigger site → send path [Resend engine | Supabase auth | ad-hoc HTML] → wired? → tested? → template quality → gaps), covering at least:
- Registration/auth/onboarding: signup confirmation, password reset, magic-link/guest-claim, workspace welcome (workspace.signup_completed), workspace signup-failure, talent onboarding (account.talent_onboarded), talent profile approved, roster invite/claim, roster join requested/approved/rejected, team-member invite, platform-admin signup/quota/failure alerts.
- Commerce/money/plan: payment.received (client receipt + workspace alert), payment.failed (dunning), payout settled, payout reversal (refund/dispute), booking confirmed/cancelled/day-of-reminder, offer sent/accepted/declined. KNOWN MISSING — build these: trial-start email, trial-end email (trial_will_end only logs today), invoice email (Invoice.tsx exists, unwired), booking-deposit confirmation. UPGRADE/DOWNGRADE: workspace.plan_upgraded / plan_downgraded / subscription_cancelled exist and are wired — verify they actually send and read correctly. KNOWN FRAGILE/UNTESTED — harden + test: workspace.over_seat_limit (known failing), payment-failed dunning dedupe, partial-refund + dispute flows.
- Inconsistencies to fix: ad-hoc plain-HTML sends that bypass the dispatcher (e.g. payout-reversal-notify.ts, guest-claim, workspace signup-failure) — migrate to the catalog/dispatcher path so they get unsubscribe footers, prefs, suppression checks, and dispatch_log rows. Guests with no user_id currently get no unsubscribe link.

PLATFORM-ADMIN EMAIL-MANAGEMENT CONSOLE (the user wants to manage the whole flow from /platform/admin). Today there's almost nothing: only /platform/admin/integrations lets a super_admin set the platform from-address. Scope and build (propose phasing — some pieces are small, some are big):
- Send-log viewer: query notification_dispatch_log with filters (status, event_kind, tenant, recipient, date) + delivery/open/click/bounce/complaint state + error_message for failures. (Building block exists: the table.)
- Failure observability + manual RETRY of failed/suppressed sends (today retry is cron-only); alert platform admins when a batch fails.
- Suppression management: view/manage email_suppressions (hard bounces, complaints), manually suppress/unsuppress.
- Sending-domain health: per-tenant + platform verification status (tenant_integrations) + the platform default config; surface DNS records.
- Test-send / preview UI: there's already a platform.notification_selftest catalog entry but no UI to trigger it; add "send me a test of event X."
- Delivery metrics: sent/bounce/open/click rates by category/tenant.
- BIGGER LIFTS — scope feasibility and recommend (don't assume): runtime EVENT TOGGLES (enable/disable which events email, per-platform/tenant) and DB-STORED EDITABLE TEMPLATES (subject/body editable from admin without a deploy — today templates are React code in web/emails, so this means a template-override store + a safe render path; reuse the page-builder/overlay and tenant-integration "credential-vault" patterns already in this codebase for inspiration). Present the trade-offs (full DB template engine vs. editable overrides on top of code defaults) and recommend an approach before building.
Reuse existing patterns: the tenant_integrations vault, the builder_catalog_overlay "DB overlay on top of code defaults" pattern (web/src/lib/site-admin/add-gallery), and the existing platform-admin shell.

OPEN QUESTIONS TO RESOLVE WITH THE USER (raise early):
1. Sending brand/domain: tulala.digital vs impronta.agency (drives the bug fix).
2. How far to take the console now: observability+retry+suppression+domain-health (clearly worth it) vs. also runtime event-toggles + editable templates (bigger). Recommend a phase split.
3. Whether to keep Supabase-native auth emails or route them through Resend too (for unified tracking/branding).

CONSTRAINTS / QA
- Follow web/CLAUDE.md deploy + migration discipline exactly. New tables/columns → migration + db:push before merge. tsc (big heap: NODE_OPTIONS=--max-old-space-size=8192) + lint clean before every commit. deploy:smoke green after deploy.
- QA on a SEEDED host, not raw *.vercel.app (middleware 404s unregistered hosts). Local authed admin QA: use http://app.lvh.me:3000 (parent-domain cookies; localhost discards the session) and the dev sign-in fixture GET /api/dev/signin?email=qa-admin@impronta.test&next=/platform/admin/... (passwordless, dev/preview-only). After branch switches/edits, `npm run dev:fresh` to clear .next.
- PROVE emails actually send: do live test-sends (use a test recipient + the Resend dashboard / notification_dispatch_log + the /api/webhooks/resend events) — don't declare an email "working" on a tsc-clean compile alone. The user judges progress by demonstrated, QA-proven results.
- Do NOT enter credentials or change account/security settings yourself; if a Vercel env var or Resend dashboard change is needed, state exactly what and ask the user to do it (or confirm before you do anything that requires their account).

DELIVERABLES
1. A blunt audit matrix of every email (working / broken / missing / fragile / untested) + the from-domain bug confirmed.
2. A phased plan (fix the critical bug → make every email work → polish templates → build the admin console in scoped phases) — get it approved before large builds.
3. Shipped, QA-proven fixes (PRs to main, deploy:smoke green), with live test-send evidence.
4. The Platform-Admin email console (at least the observability/retry/suppression/domain-health/test-send tier; template-editing + event-toggles per the approved scope).

Start by reading web/CLAUDE.md, then audit the email system and produce the matrix + plan. Ask me the open questions above before building anything large.
```
