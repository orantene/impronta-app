/**
 * Pure guards and planning for scripts/stripe-staging-webhook.mjs (TUL-830).
 * No I/O here, so every refusal is unit-tested (stripe-staging-webhook.test.mjs).
 *
 * The runner registers Stripe TEST webhook endpoints for staging (one per lane)
 * and writes each signing secret into the Vercel Preview scope. Staging runs
 * with STRIPE_FORCE_TEST_MODE=1, so the app reads the `_TEST` sibling of the
 * webhook secret (lib/stripe/env-keys.ts), never the bare name.
 *
 * Lane: plan billing (talent + workspace checkout, plan change, dunning) runs on
 * `getStripe()`, the US lane, so the default endpoint is /api/webhooks/stripe
 * and the secret is STRIPE_WEBHOOK_SECRET_TEST. MX lanes run with the MX TEST
 * key (a separate account). One account never delivers to both URLs: every
 * event would settle twice under two idempotency lanes. Each account lane has
 * a `-connect` twin (Connect endpoint, same route, `_CONNECT` secret).
 */

export const MANAGED_BY = "tulala-staging-webhook-workflow";
export const DEFAULT_BASE_URL = "https://pay.staging.tulala.digital";

/**
 * The API version the app's Stripe client pins (lib/stripe/client.ts `apiVersion`).
 * The endpoint is created with the same version so event payloads match what the
 * handler parses. A test fails if client.ts moves without this.
 */
export const STRIPE_API_VERSION = "2026-04-22.dahlia";

/** Connect-only events (need a Connect endpoint); everything else the router handles goes on this one. */
export const CONNECT_ONLY_EVENTS = ["account.updated", "capability.updated"];

/**
 * Events the CONNECT endpoint subscribes to: the Connect-only events plus every
 * routed event whose handler reads `event.account` (a connected account's own
 * payouts, which never reach the account-level endpoint). A test parses
 * webhook-routing.ts and fails when this drifts.
 */
export const CONNECT_EVENTS = [
  "account.updated",
  "capability.updated",
  "payout.created",
  "payout.paid",
  "payout.failed",
  "payout.canceled",
];

/**
 * Endpoint lanes. An account-level endpoint and a Connect endpoint on the same
 * account share ONE route: handleStripeWebhook (lib/stripe/webhook-http.ts)
 * tries both secrets (STRIPE_WEBHOOK_SECRET + _CONNECT, or the MX pair).
 * `account` names which Stripe key the lane runs with (us = STRIPE_TEST_SECRET_KEY,
 * mx = STRIPE_MX_TEST_SECRET_KEY).
 */
export const LANES = {
  us: { path: "/api/webhooks/stripe", secretVar: "STRIPE_WEBHOOK_SECRET_TEST", kind: "account", account: "us" },
  "us-connect": {
    path: "/api/webhooks/stripe",
    secretVar: "STRIPE_WEBHOOK_SECRET_CONNECT_TEST",
    kind: "connect",
    account: "us",
  },
  mx: { path: "/api/webhooks/stripe-mx", secretVar: "STRIPE_MX_WEBHOOK_SECRET_TEST", kind: "account", account: "mx" },
  "mx-connect": {
    path: "/api/webhooks/stripe-mx",
    secretVar: "STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST",
    kind: "connect",
    account: "mx",
  },
};

/**
 * "connect" when Stripe ties the endpoint to a Connect application (Connect
 * endpoints carry the platform's `application` id) or when our own lane
 * metadata says so; otherwise "account".
 */
export function endpointKind(e) {
  if (e?.application) return "connect";
  if (typeof e?.metadata?.lane === "string" && e.metadata.lane.endsWith("-connect")) return "connect";
  return "account";
}

/**
 * Every account-level (non-Connect) event the platform handler routes
 * (lib/stripe/webhook-routing.ts `case "<type>":`). A test parses that file and
 * fails when a routed event is missing here. account.updated / capability.updated
 * are Connect events (CONNECT_ONLY_EVENTS) and need a separate Connect endpoint.
 */
export const ENABLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "subscription_schedule.created",
  "subscription_schedule.updated",
  "subscription_schedule.released",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
  "subscription_schedule.aborted",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.marked_uncollectible",
  "invoice.voided",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "payout.created",
  "payout.paid",
  "payout.failed",
  "payout.canceled",
  "transfer.updated",
  "transfer.reversed",
];

/** Refuses anything but a test secret/restricted key. Never echoes the key. */
export function checkTestKey(key) {
  if (!key || typeof key !== "string") return { ok: false, reason: "Stripe key is empty" };
  if (/^(sk|rk)_test_/.test(key)) return { ok: true };
  return { ok: false, reason: "Stripe key is not a test key; refusing" };
}

/** /v1/balance body must say livemode === false (a missing field is a refusal). */
export function checkBalanceLivemode(body) {
  if (body && body.livemode === false) return { ok: true };
  return { ok: false, reason: "Stripe /v1/balance is not livemode=false; refusing" };
}

/** Only https staging hosts; never the production apex or app host. */
export function checkTargetUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: "webhook URL is not a URL" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "webhook URL must be https" };
  const host = u.hostname.toLowerCase();
  if (!host.endsWith(".tulala.digital") || !/(^|\.)staging\.|^staging-|^qa-\d+\./.test(host)) {
    return { ok: false, reason: `webhook host ${host} is not a staging host; refusing` };
  }
  return { ok: true };
}

export function laneConfig(lane, baseUrl = DEFAULT_BASE_URL) {
  const cfg = LANES[lane];
  if (!cfg) return { ok: false, reason: `unknown lane ${lane}; use us, us-connect, mx or mx-connect` };
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}${cfg.path}`;
  const urlOk = checkTargetUrl(url);
  if (!urlOk.ok) return urlOk;
  return {
    ok: true,
    url,
    secretVar: cfg.secretVar,
    kind: cfg.kind,
    account: cfg.account,
    events: cfg.kind === "connect" ? CONNECT_EVENTS : ENABLED_EVENTS,
    otherUrl: `${base}${LANES[cfg.account === "us" ? "mx" : "us"].path}`,
  };
}

/**
 * The Vercel entry the secret may be written to: target exactly ["preview"],
 * no git branch, no custom environment. Any entry with that key that includes
 * production is a refusal (the write path must never be able to touch it).
 * Entries with the same key scoped to production ALONE are left alone.
 */
export function pickVercelEntry(envs, key) {
  const same = (envs ?? []).filter((e) => e.key === key);
  for (const e of same) {
    const t = e.target ?? [];
    if (t.includes("production") && t.includes("preview")) {
      return { ok: false, reason: `${key} has an entry shared by production and preview; refusing to write` };
    }
  }
  const preview = same.filter(
    (e) =>
      JSON.stringify([...(e.target ?? [])].sort()) === JSON.stringify(["preview"]) &&
      !e.gitBranch &&
      !(e.customEnvironmentIds ?? []).length,
  );
  if (preview.length > 1) return { ok: false, reason: `${key} has ${preview.length} preview-wide entries; fix by hand` };
  return { ok: true, entry: preview[0] ?? null };
}

/**
 * What to do, given the matching endpoints already on the account and whether
 * the Preview secret var already exists.
 *   create      : no endpoint -> create one, write the secret
 *   reuse       : endpoint + var -> only sync enabled_events
 *   recreate    : endpoint (ours) + no var + recreate=yes -> delete ours, create, write
 *   refuse      : anything ambiguous
 * Stripe returns an endpoint's secret only at creation, so an existing endpoint
 * with no stored secret cannot be "adopted".
 * `kind` ("account" default | "connect") limits every check to endpoints of that
 * kind: an account endpoint and a Connect endpoint legitimately share one URL.
 *   replace-unmarked : `replaceUnmarked` + no var + every live endpoint on the
 *                      URL is NOT ours -> create a marked endpoint, write the
 *                      secret, THEN disable (never delete) `disableIds`, so
 *                      delivery has no gap (duplicates in the overlap are
 *                      absorbed by the event-id idempotency claim).
 */
export function planEndpoint({ endpoints, url, otherUrl, varExists, recreate, kind = "account", replaceUnmarked = false }) {
  const all = (endpoints ?? []).filter((e) => endpointKind(e) === kind);
  const other = all.filter((e) => e.url === otherUrl && e.status !== "disabled");
  if (other.length) {
    return { action: "refuse", reason: `an endpoint already targets the other lane (${otherUrl}); one account must not deliver to both` };
  }
  // A disabled endpoint on the same URL never delivers: ignore it (it is not reused or deleted).
  const match = all.filter((e) => e.url === url && e.status !== "disabled");
  if (replaceUnmarked && !varExists && match.length > 0 && match.every((e) => e.metadata?.managed_by !== MANAGED_BY)) {
    return { action: "replace-unmarked", disableIds: match.map((e) => e.id) };
  }
  if (match.length > 1) return { action: "refuse", reason: `${match.length} endpoints already target ${url}; fix by hand` };
  if (match.length === 0) return { action: "create" };
  const ep = match[0];
  if (varExists) return { action: "reuse", endpointId: ep.id };
  if (!recreate) {
    return {
      action: "refuse",
      reason: "endpoint exists but the Preview secret var is missing; Stripe only shows a secret at creation. Re-run with recreate=yes",
    };
  }
  if (ep.metadata?.managed_by !== MANAGED_BY) {
    return { action: "refuse", reason: "endpoint exists and was not made by this workflow; will not delete it" };
  }
  return { action: "recreate", endpointId: ep.id };
}
