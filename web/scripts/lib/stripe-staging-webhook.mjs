/**
 * Pure guards and planning for scripts/stripe-staging-webhook.mjs (TUL-830).
 * No I/O here, so every refusal is unit-tested (stripe-staging-webhook.test.mjs).
 *
 * The runner registers ONE Stripe TEST webhook endpoint for staging and writes
 * its signing secret into the Vercel Preview scope. Staging runs with
 * STRIPE_FORCE_TEST_MODE=1, so the app reads the `_TEST` sibling of the
 * webhook secret (lib/stripe/env-keys.ts), never the bare name.
 *
 * Lane: plan billing (talent + workspace checkout, plan change, dunning) runs on
 * `getStripe()`, the US lane, so the default endpoint is /api/webhooks/stripe
 * and the secret is STRIPE_WEBHOOK_SECRET_TEST. The MX lane is selectable but
 * never both: one account delivering to both URLs would settle every event
 * twice under two idempotency lanes.
 */

export const MANAGED_BY = "tulala-staging-webhook-workflow";
export const DEFAULT_BASE_URL = "https://pay.staging.tulala.digital";

export const LANES = {
  us: { path: "/api/webhooks/stripe", secretVar: "STRIPE_WEBHOOK_SECRET_TEST" },
  mx: { path: "/api/webhooks/stripe-mx", secretVar: "STRIPE_MX_WEBHOOK_SECRET_TEST" },
};

/**
 * Account-level (non-Connect) events the platform handler routes
 * (lib/stripe/webhook-routing.ts). account.updated / capability.updated are
 * Connect events and need a separate Connect endpoint; billing does not use them.
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
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.marked_uncollectible",
  "invoice.voided",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
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
  if (!cfg) return { ok: false, reason: `unknown lane ${lane}; use us or mx` };
  const url = `${baseUrl.replace(/\/+$/, "")}${cfg.path}`;
  const urlOk = checkTargetUrl(url);
  if (!urlOk.ok) return urlOk;
  return { ok: true, url, secretVar: cfg.secretVar, otherUrl: `${baseUrl.replace(/\/+$/, "")}${LANES[lane === "us" ? "mx" : "us"].path}` };
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
 */
export function planEndpoint({ endpoints, url, otherUrl, varExists, recreate }) {
  const all = endpoints ?? [];
  const other = all.filter((e) => e.url === otherUrl && e.status !== "disabled");
  if (other.length) {
    return { action: "refuse", reason: `an endpoint already targets the other lane (${otherUrl}); one account must not deliver to both` };
  }
  const match = all.filter((e) => e.url === url);
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
