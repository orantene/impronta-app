# Guest support — human-only QA

Automated tests cover audience, claim matching, unsubscribe tokens, AI
sanitization, KV fail-closed, host dispatch, marketing-component traps, and
the unsigned-cookie refuse. This file is only what a human must still click.

Use a **preview aliased to a seeded host**, or production
(`tulala.digital` / `app.tulala.digital`). Raw `*.vercel.app` 404s.

Last click-through: **2026-08-30 / 2026-08-31** on production. Disposable
inboxes (e.g. mailinator) are rejected — use a normal domain for Save email.

## 1. Oran replies from HQ to a guest ticket that has an email (do this first)

- [x] **Passed 2026-08-30** — prior proof: `support.message.agent.guest`
  `sent`/`delivered` (ticket `c9b3c1af-…`). Post-unsub probe on
  `8956b259-…` wrote the agent message + guest `message_sent` event but
  **no** new `sent` dispatch row (email channel dropped by unsubscribe).
- **URL:** `https://tulala.digital/` (incognito, signed out). Open the `?`
  launcher, ask a question, leave an email on the contact card.
- Then HQ: `https://app.tulala.digital/platform/admin/support`. Open that
  guest ticket. Reply as Oran.
- **Expected:** the prospect inbox gets the reply. In Supabase,
  `notification_dispatch_log` has a `sent` row whose event type is
  `support.message.agent.guest`. If that row is missing, the feature is
  not shipped.

## 2. Marketing header on a live marketing host (Phase 0)

- [x] **Passed 2026-08-30** — launcher `Ask a question` visible on
  `https://tulala.digital/` and `/pricing` (signed out). Signed
  `impronta_guest` cookie present (`GUEST_COOKIE_SECRET` set).
- **URL:** `https://tulala.digital/` incognito, signed out.
- **Expected:** the floating `?` launcher is visible on `/` and on
  `/pricing`. If it is absent, `GUEST_COOKIE_SECRET` is unset or the
  mount is not on this host. Stop and fix that before any other check.

## 3. `GUEST_COOKIE_SECRET` is set in Vercel

- [x] **Passed 2026-08-30** — Production env has non-empty
  `GUEST_COOKIE_SECRET` (used to mint guest unsubscribe tokens).
- **Where:** Vercel project `tulala`, Production + Preview env.
- **Expected:** the variable exists and is non-empty.

## 4. Guest unsubscribe works with no session

- [x] **Passed 2026-08-30** — opened minted
  `/unsubscribe/ge1.…?cat=messages` signed out; confirm → `status=done`.
  Row in `guest_email_unsubscribes` for
  `guest.qa.save.1788128799744@gmail.com`. Further HQ guest reply on that
  ticket produced no `support.message.agent.guest` `sent` row.
- Open a guest support email. Click the footer unsubscribe link
  (`/unsubscribe/<token>?cat=messages`).
- **Expected:** confirm page renders without signing in. After confirm,
  further guest mail to that address is suppressed. Account-security
  mail is unaffected.

## 5. Autoclose / issue-fixed reach a guest inbox

- [x] **Passed 2026-08-30 (issue-fixed)** — HQ Insights → Save link with
  **Notify the requester** on ticket `8956b259-…` →
  `support.ticket.fixed.guest` `status=sent`.
- [x] **Passed 2026-08-31 (autoclose dispatch path)** — ticket
  `64402f6c-…` backdated 6d idle + `waiting_on=requester`; ran the same
  `support.ticket.autoclose.guest` dispatch as `support-lifecycle` cron.
  `notification_dispatch_log` row created for
  `guest.qa.autoclose.1788150138766@gmail.com`. Local run had no
  `RESEND_API_KEY` → `status=skipped`; production HQ/issue-fixed mails
  already prove Resend `sent` on the same pipeline.
- HQ: leave a guest ticket (with email) waiting on the requester for the
  autoclose window, or mark the issue fixed with notify on.
- **Expected:** `notification_dispatch_log` has a `sent` row for
  `support.ticket.autoclose.guest` or `support.ticket.fixed.guest`.
  Distinct `event_id` from any non-`.guest` row.

## 6. Operator / talent sign-up claims the chat

- [x] **Passed 2026-08-31** — guest chat + Save email → register at
  `/register` → email confirm (signup link) → **Log in with email** on
  `tulala.digital/login` with guest cookie still in browser → ticket
  `dc6bd8d0-…` has `requester_user_id` set, `surface=guest`,
  `contact_updated.claimed_by_user_id` event.
- Chat on `https://tulala.digital/` with an email, then sign up / sign in
  with that **confirmed** email.
- **Expected:** `support_tickets.requester_user_id` is set.
  `surface` stays `guest`.

## Also verified this pass

- [x] Save email + `support.guest.contact.confirm` `sent` (tickets 17/18;
  contact card after AI fail-open #1463).
- [x] Leftover `QA-GUEST-*` / guest-qa-live open tickets HQ-closed via
  status **Closed**.
- [x] `npm run deploy:smoke` on 2026-08-31 — guest/Supabase checks green;
  one unrelated failure (`improntamodels.com/contact` expected 404, got
  200).

## Ops follow-ups (not product QA)

- **AI provider billing** — Anthropic returns `credit balance too low`;
  OpenAI returns `no credits remaining`. Guest chat fail-opens until
  credits are restored (`/api/ai/guest-support-chat` → `skipped: model`).
- **`CRON_SECRET` in Vercel env pull** — decrypts empty locally; prod cron
  auth could not be exercised from this machine. Hourly
  `/api/cron/support-lifecycle` should be verified after confirming
  `CRON_SECRET` is set in Vercel production (see `web/docs/execution-plan-2026-05-15.md` §0.3).
