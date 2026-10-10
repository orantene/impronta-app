# TUL-186: "production has never recorded a Stripe MX webhook event (0 of 211)"

Date: 2026-10-09. Author: Payments Developer chat. For: PM, then Oran.
Method: code read plus read-only production SQL and a names-only listing of Vercel production env vars. Nothing was changed in Stripe, Vercel, the database or the repo.

## Verdict

**Not a code bug, and not (yet) evidence of a broken endpoint.** Production has never *used* the Mexico lane, so no MX event has ever been due: 0 of 211 is the expected number today. The MX webhook route is wired correctly. What is missing is a **dashboard check Oran must do once before the first MX sale** (below), plus one optional env var that is not set. No fix PR is needed.

## Evidence

### 1. Production has no MX-lane activity at all (read-only SQL)

- `stripe_processed_events` (the webhook ledger): 211 rows, all `lane = 'platform'` (the US endpoint), none `platform_mx`, none with a `platform_mx:` key prefix. 177 test-mode and 34 live-mode events, 2026-05-06 to 2026-10-07. Types are the US set (`payment_intent.*`, `charge.*`, `checkout.session.*`, `payout.*`, `account.updated`, `capability.updated`).
- `booking_transactions`: 25 rows, **every one `stripe_platform = 'us'`** (7 paid MXN, 3 paid USD, plus drafts and failures; the MXN rows are older sales from before the lane router and the currency guard existed). Zero rows on `mx`.
- Connected accounts: all 343 `talent_profiles` and all 22 `agencies` have `stripe_account_platform = 'us'`. A talent only becomes `mx` when she connects a payout account with a Mexico payout country (`stripe-connect-talent.ts` writes `stripe_account_platform = 'mx'`, only when the router picks the MX platform). Nobody has.

So there has been no MX charge, no MX connected account and therefore no MX event to record.

### 2. The route and how it picks its secret (code)

- `POST /api/webhooks/stripe-mx` is a 3-line shim over `handleStripeWebhook(req, { account: "mx" })` (`src/app/api/webhooks/stripe-mx/route.ts`). The proxy lets `/api/webhooks/*` through without a host lookup (`src/proxy.ts`, `PROXY_SHORT_CIRCUIT_PREFIXES`, pinned by `api-route-reachability.static.test.ts`), so it is reachable on every host.
- Secret selection (`src/lib/stripe/webhook-http.ts`): for `account: "mx"` it tries `STRIPE_MX_WEBHOOK_SECRET` then `STRIPE_MX_WEBHOOK_SECRET_CONNECT`, using the **MX** Stripe client; the US route uses the US pair. It never mixes the lanes.
- What happens to an MX event that arrives:
  - secret(s) unset: **503** (never 200), so Stripe shows the failure and retries;
  - no `stripe-signature`: 400; signature matches neither secret: 400 (and `reportLaneMismatch` logs when the body verifies against the *other* lane's secret, which would mean the endpoint is pointed at the wrong URL);
  - `livemode` disagrees with the MX key's mode: **200 and ignored, nothing recorded** (`livemode_mismatch`, logged as an error). This is the only path that returns 200 without writing a row.
  - otherwise it is claimed in `stripe_processed_events` under lane `platform_mx` (key `platform_mx:<event id>`) and processed.
  So an MX event is either recorded, rejected loudly (400/503), or ignored for a livemode mismatch. It is never silently dropped on the way in.

### 3. Is MX a Connect account whose events arrive on the platform endpoint with `account` set?

No. **Mexico is a separate Stripe platform** (its own API keys, its own dashboard, its own webhook endpoints). Events for charges on the MX platform are delivered only to endpoints registered *in the MX Stripe account*; they never arrive on the US endpoint. Connected accounts of the MX platform (talents with a Mexico payout country) are Connect accounts of *that* platform: their `account.updated` / `capability.updated` / `account.external_account.*` events arrive on a **Connect-type endpoint of the MX platform** (with `account` set), which has its own signing secret, hence `STRIPE_MX_WEBHOOK_SECRET_CONNECT`. The US platform's `acct_` connected accounts are a different set and a different endpoint.

### 4. Production env (names only, values not read)

Present: `STRIPE_MX_SECRET_KEY`, `STRIPE_MX_PUBLISHABLE_KEY`, `STRIPE_MX_WEBHOOK_SECRET`.
**Not set: `STRIPE_MX_WEBHOOK_SECRET_CONNECT`.** Optional in code, needed only once an MX connected account exists (its onboarding events would otherwise fail verification with 400).

## What I could not verify (needs Oran)

Whether the MX Stripe account (live mode) actually has the endpoint registered, and whether the secret stored in Vercel is that endpoint's secret. That lives in the Stripe dashboard and in encrypted env; I did not read or change either.

## Steps for Oran (dashboard config; do this before the first Mexican seller connects or any MX charge)

In the **Mexico Stripe account**, **Live mode**:

1. Developers > Webhooks > check whether an endpoint to `https://app.tulala.digital/api/webhooks/stripe-mx` exists. If not, **Add endpoint**:
   - Endpoint URL: `https://app.tulala.digital/api/webhooks/stripe-mx`
   - Listen to: **Events on your account**
   - Events the handler acts on (`webhook-routing.ts`): `payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.completed` / `.expired` / `.async_payment_succeeded` / `.async_payment_failed`, `charge.refunded`, `charge.dispute.created` / `.updated` / `.closed` / `.funds_withdrawn` / `.funds_reinstated`, `refund.updated`, `refund.failed`, `payout.created` / `.paid` / `.failed` / `.canceled`, `transfer.updated`, `transfer.reversed`. (Other types are recorded and ignored, so selecting all events also works.)
2. Open that endpoint, reveal its **Signing secret** (`whsec_…`). In Vercel > Production env, make `STRIPE_MX_WEBHOOK_SECRET` equal to it (redeploy to pick it up).
3. Add a second endpoint, same URL, **Listen to: Events on Connected accounts**, events `account.updated`, `capability.updated`, `account.external_account.*` (and `payout.*` for the connected accounts' own payouts). Put its signing secret in a NEW Vercel Production var `STRIPE_MX_WEBHOOK_SECRET_CONNECT` (redeploy).
4. Check the mode: the MX endpoint and `STRIPE_MX_SECRET_KEY` must both be Live (a test key with a live endpoint, or the reverse, makes every event return 200 "ignored: livemode_mismatch" and record nothing).
5. Verify: on the endpoint page press **Send test webhook** (`payment_intent.succeeded`). Expect HTTP 200 in Stripe. Then a read-only query on production should show the row:
   `select lane, event_type, processed_at from stripe_processed_events where lane = 'platform_mx' order by processed_at desc limit 5;`
   (a Stripe test event on a live endpoint is refused as a livemode mismatch, so for the dry check use Stripe's "Resend" on a real live MX event once one exists, or temporarily test with the MX test-mode endpoint against a preview.)

## What I recommend we do in the repo (optional, small)

- A health line on the Money/Admin health page: "MX lane: no events yet / last event at …", so an MX sale that produces no event is visible the same day, not discovered later. Not built; say if wanted.
- Nothing to fix in `webhook-http.ts`: the verification order, lane keys and 503/400/200 semantics are correct and tested (`webhook-lanes.test.ts`, `webhook-routing*.test.ts`).
