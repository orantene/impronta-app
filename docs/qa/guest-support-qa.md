# Guest support — human-only QA

Automated tests cover audience, claim matching, unsubscribe tokens, AI
sanitization, KV fail-closed, host dispatch, marketing-component traps, and
the unsigned-cookie refuse. This file is only what a human must still click.

Phase 0 stays unverified. Do not treat a green CI as proof the marketing
header is present.

Use a **preview aliased to a seeded host**. Raw `*.vercel.app` 404s.

## 1. Oran replies from HQ to a guest ticket that has an email (do this first)

- **URL:** `https://tulala.digital/` (incognito, signed out). Open the `?`
  launcher, ask a question, leave an email on the contact card.
- Then HQ: `https://app.tulala.digital/platform/admin/support` (or the
  current app-host equivalent). Open that guest ticket. Reply as Oran.
- **Expected:** the prospect inbox gets the reply. In Supabase,
  `notification_dispatch_log` has a `sent` row whose event type is
  `support.message.agent.guest`. If that row is missing, the feature is
  not shipped.

## 2. Marketing header on a live marketing host (Phase 0 — still unverified)

- **URL:** `https://tulala.digital/` incognito, signed out.
- **Expected:** the floating `?` launcher is visible on `/` and on
  `/pricing`. If it is absent, `GUEST_COOKIE_SECRET` is unset or the
  mount is not on this host. Stop and fix that before any other check.

## 3. `GUEST_COOKIE_SECRET` is set in Vercel

- **Where:** Vercel project `tulala`, Production + Preview env.
- **Expected:** the variable exists and is non-empty. This environment
  cannot list env vars. Confirm in the dashboard.

## 4. Guest unsubscribe works with no session

- Open a guest support email. Click the footer unsubscribe link
  (`/unsubscribe/<token>?cat=messages`).
- **Expected:** confirm page renders without signing in. After confirm,
  further guest mail to that address is suppressed. Account-security
  mail is unaffected.

## 5. Autoclose / issue-fixed reach a guest inbox

- HQ: leave a guest ticket (with email) waiting on the requester for the
  autoclose window, or mark the issue fixed with notify on.
- **Expected:** `notification_dispatch_log` has a `sent` row for
  `support.ticket.autoclose.guest` or `support.ticket.fixed.guest`.
  Distinct `event_id` from any non-`.guest` row.

## 6. Operator / talent sign-up claims the chat

- Chat on `https://tulala.digital/` with an email, then sign up as an
  operator or talent with that **confirmed** email.
- **Expected:** `support_tickets.requester_user_id` is set.
  `surface` stays `guest`.
