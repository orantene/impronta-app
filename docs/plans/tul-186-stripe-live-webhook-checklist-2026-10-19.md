# TUL-186: Stripe webhooks on production, live-switch checklist (one page)

For Oran's live switch (~Oct 20). Nothing here was done by an agent: no live Stripe, no Production env edit.

## Why no Mexico event has ever been recorded (2026-10-19, names/scopes only, plus unsigned probes)
1. **Production runs `STRIPE_FORCE_TEST_MODE=1`.** `lib/stripe/env-keys.ts` then reads only the `_TEST` sibling of every Stripe name. Production verifies webhooks with `STRIPE_MX_WEBHOOK_SECRET_TEST` / `STRIPE_WEBHOOK_SECRET_TEST` and charges on the sandbox. A LIVE-mode endpoint's events cannot verify (400 Invalid signature) and a live event that did verify would be dropped as `livemode_mismatch`. Expected until the flip.
2. **No MX seller exists** (all talents and agencies are on the US platform, memo #3153), so the MX account has had no charge to report.
3. **Connect events need their own endpoint.** Stripe sends `account.updated` / `capability.updated` only to an endpoint set to "Connected accounts", signed with a different secret (`*_WEBHOOK_SECRET_CONNECT`). Both MX names now exist on Production (the 10-07 note said CONNECT was missing; it is present now, plus `_TEST`).
4. **Wrong-lane URL**: the 12 US verify failures on 10-05 fit an MX endpoint pointed at `/api/webhooks/stripe`. The deployed build (a744cd7) logs `lane-mismatch` when that happens.
5. **The health panel named the wrong variable** in forced test mode ("STRIPE_MX_WEBHOOK_SECRET: set" while the app read `_TEST`). Fixed in this PR: rows now name the variable actually read.

Probes today (unsigned POST, nothing written): `app.tulala.digital/api/webhooks/stripe` 400, `/stripe-mx` 400 (both lanes have a secret on the deployed build).

## Plan billing lives on the US account
Talent and workspace subscriptions use `getStripe()` (US). Subscription and invoice events go to the **US** endpoint only. Do not add them to the MX endpoint.

## Checklist (LIVE mode in each dashboard; endpoints are per mode)
**Stripe US account, Developers > Webhooks**
- [ ] Account endpoint: `https://app.tulala.digital/api/webhooks/stripe`, "Your account". Events: `checkout.session.completed`, `.expired`, `.async_payment_succeeded`, `.async_payment_failed`; `customer.subscription.created`, `.updated`, `.deleted`, `.trial_will_end`; `invoice.finalized`, `.paid`, `.payment_succeeded`, `.payment_failed`, `.marked_uncollectible`, `.voided`; `payment_intent.succeeded`, `.payment_failed`; `charge.refunded`; `charge.dispute.created`, `.updated`, `.closed`, `.funds_withdrawn`, `.funds_reinstated`; `payout.created`, `.paid`, `.failed`, `.canceled`; `transfer.updated`, `.reversed`.
- [ ] Connect endpoint: same URL, "Connected accounts". Events: `account.updated`, `capability.updated`, `account.external_account.created`, `.updated`, `.deleted`.
- [ ] Register ONE US URL only (`/api/stripe/webhook` is the same handler; two URLs means double deliveries).

**Stripe Mexico account, Developers > Webhooks**
- [ ] No MX endpoint points at `/api/webhooks/stripe` (US path). Fix any that does.
- [ ] Account endpoint: `https://app.tulala.digital/api/webhooks/stripe-mx`, "Your account". Same list as US minus the `customer.subscription.*` and `invoice.*` events.
- [ ] Connect endpoint: same URL, "Connected accounts", same 5 Connect events.

**Vercel, Production scope only (paste secrets in the dashboard, never in chat)**
- [ ] `STRIPE_WEBHOOK_SECRET` = US account endpoint secret; `STRIPE_WEBHOOK_SECRET_CONNECT` = US Connect endpoint secret.
- [ ] `STRIPE_MX_WEBHOOK_SECRET` = MX account endpoint; `STRIPE_MX_WEBHOOK_SECRET_CONNECT` = MX Connect endpoint.
- [ ] Live keys present: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_MX_SECRET_KEY`, `STRIPE_MX_PUBLISHABLE_KEY` (all `*_live_*`), live `STRIPE_PRICE_*`.
- [ ] Remove `STRIPE_FORCE_TEST_MODE` from Production (leave the `_TEST` names; they are ignored without the flag). Keep it on Preview.
- [ ] Cut a release (`promote-production.yml`): env changes load only on a new deployment.

**Verify (same day)**
- [ ] Platform admin > Commerce > Health: secret rows show the bare names (no `_TEST`), all set; key modes all `live`, no mix.
- [ ] "Send test webhook" from each of the 4 endpoints: 200 `{"received":true}`.
- [ ] Read-only: `select event_id, lane, livemode from stripe_processed_events order by processed_at desc limit 5` shows `platform_mx:evt_...` with `lane = platform_mx`.
- [ ] No `stripe-webhook.verify` or `lane-mismatch` errors in runtime logs for 1 hour.

**Rollback**: set `STRIPE_FORCE_TEST_MODE=1` on Production again and redeploy.
