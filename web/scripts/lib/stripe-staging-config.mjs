/**
 * Pure planning for the staging Stripe TEST config workflow beyond the US
 * webhook (lanes connect, mx, portal, client-pro-price, all). No I/O here; the
 * runner is scripts/stripe-staging-webhook.mjs and every decision below is
 * unit-tested in stripe-staging-config.test.mjs.
 *
 * Staging runs STRIPE_FORCE_TEST_MODE=1, so the app reads the `_TEST` sibling
 * of every mode-bound Stripe name (lib/stripe/env-keys.ts). This module names
 * which of those siblings the workflow writes, which are manual, and which are
 * out of scope (TEST_SIBLING_COVERAGE, test-pinned to env-keys.ts).
 */
import { MANAGED_BY } from "./stripe-staging-webhook.mjs";
import { SEED_TAG } from "./stripe-portal-config.mjs";

/** GitHub secret holding the MX TEST secret key (not configured as of 2026-10-19). */
export const MX_KEY_SECRET = "STRIPE_MX_TEST_SECRET_KEY";

export const WORKFLOW_LANES = ["us", "connect", "mx", "portal", "client-pro-price", "all"];

const MX_STEPS = new Set(["webhook:mx", "webhook:mx-connect", "portal:mx"]);

const LANE_STEPS = {
  us: ["webhook:us"],
  connect: ["webhook:us-connect"],
  mx: ["webhook:mx", "webhook:mx-connect"],
  portal: ["portal:us", "portal:mx"],
  "client-pro-price": ["client-pro-price"],
  all: [
    "webhook:us",
    "webhook:us-connect",
    "webhook:mx",
    "webhook:mx-connect",
    "portal:us",
    "portal:mx",
    "client-pro-price",
  ],
};

/**
 * The steps a workflow lane runs. Without the MX key, MX steps are SKIPPED
 * (non-fatal, one "skipped:" line each) and the rest still run; only an
 * explicit lane=mx refuses, because then there is nothing else to do.
 */
export function selectSteps(lane, { hasMxKey }) {
  const all = LANE_STEPS[lane];
  if (!all) return { ok: false, reason: `unknown lane "${lane}"; use ${WORKFLOW_LANES.join(", ")}` };
  if (lane === "mx" && !hasMxKey) {
    return { ok: false, reason: `${MX_KEY_SECRET} is not set; add it as a GitHub Actions secret (MX TEST key, sk_test_)` };
  }
  const steps = [];
  const skipped = [];
  for (const id of all) {
    if (MX_STEPS.has(id) && !hasMxKey) skipped.push({ id, reason: `skipped: ${MX_KEY_SECRET} not set` });
    else steps.push(id);
  }
  return { ok: true, steps, skipped };
}

/** The MX key must belong to a different Stripe account than the US key. */
export function checkDistinctAccounts(usAccountId, mxAccountId) {
  if (!usAccountId || !mxAccountId) {
    return { ok: false, reason: "could not read both Stripe account ids; cannot prove the MX key is a separate account" };
  }
  if (usAccountId === mxAccountId) {
    return {
      ok: false,
      reason: `${MX_KEY_SECRET} is the SAME Stripe account as the US key; one account must not deliver to both webhook URLs`,
    };
  }
  return { ok: true };
}

// ─── Billing portal ──────────────────────────────────────────────────────────

/** _TEST siblings of lib/stripe/portal-params.ts PORTAL_CONFIGURATION_ENV. */
export const PORTAL_VARS = {
  us: "STRIPE_PORTAL_CONFIGURATION_ID_TEST",
  mx: "STRIPE_MX_PORTAL_CONFIGURATION_ID_TEST",
};

/**
 * reuse  : one active configuration tagged metadata.tulala_seed = SEED_TAG
 * create : none tagged, plan prices exist to offer plan switching
 * refuse : two tagged (fix by hand), or no plan prices when the lane was asked for
 * skip   : no plan prices under lane=all
 */
export function planPortal({ configs, products, explicit }) {
  const tagged = (configs ?? []).filter((c) => c.active !== false && c.metadata?.tulala_seed === SEED_TAG);
  if (tagged.length > 1) return { action: "refuse", reason: `${tagged.length} portal configurations tagged ${SEED_TAG}; fix by hand` };
  if (tagged.length === 1) return { action: "reuse", configId: tagged[0].id };
  if (!products || products.length === 0) {
    const reason = "no active plan prices found by lookup_key (tulala_<plan>_<interval>_usd); seed the TEST prices first";
    return explicit ? { action: "refuse", reason } : { action: "skip", reason: `skipped: ${reason}` };
  }
  return { action: "create" };
}

// ─── Client Pro price ────────────────────────────────────────────────────────

/**
 * lib/stripe/client-billing.ts reads STRIPE_CLIENT_PRO_PRICE_ID via stripeEnv.
 * The amount is NOT authoritative in code (the /client/subscription page shows
 * a "$49 / mo" placeholder and CLIENT_PRO_PRICING_LIVE is false), so creating
 * the price needs the `client_pro_amount_cents` workflow input.
 */
export const CLIENT_PRO = {
  lookupKey: "tulala_client_pro_month_usd",
  currency: "usd",
  interval: "month",
  varName: "STRIPE_CLIENT_PRO_PRICE_ID_TEST",
};

/** Blank = not given. Otherwise a positive whole number of cents, at most 1,000,000.00. */
export function parseAmountCents(input) {
  const s = (input ?? "").toString().trim();
  if (s === "") return { ok: true, cents: null };
  if (!/^[0-9]+$/.test(s)) return { ok: false, reason: "client_pro_amount_cents must be a whole number of cents (e.g. 4900)" };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 100_000_000) {
    return { ok: false, reason: "client_pro_amount_cents must be between 1 and 100000000" };
  }
  return { ok: true, cents: n };
}

/**
 * reuse  : an active price with the lookup_key, monthly USD (and equal to the
 *          amount input when one is given)
 * create : none, and an amount was given
 * refuse : wrong shape / amount mismatch, or no amount when the lane was asked for
 * skip   : no price and no amount under lane=all
 */
export function planClientProPrice({ prices, amountCents, explicit }) {
  const found = (prices ?? []).filter((p) => p.active !== false && p.lookup_key === CLIENT_PRO.lookupKey);
  if (found.length > 1) return { action: "refuse", reason: `${found.length} active prices use ${CLIENT_PRO.lookupKey}; fix by hand` };
  if (found.length === 1) {
    const p = found[0];
    if (p.currency !== CLIENT_PRO.currency || p.recurring?.interval !== CLIENT_PRO.interval || (p.recurring?.interval_count ?? 1) !== 1) {
      return { action: "refuse", reason: `price ${CLIENT_PRO.lookupKey} is not monthly ${CLIENT_PRO.currency}; fix by hand` };
    }
    if (amountCents != null && p.unit_amount !== amountCents) {
      return {
        action: "refuse",
        reason: `existing ${CLIENT_PRO.lookupKey} has a different amount than client_pro_amount_cents; will not re-price`,
      };
    }
    return { action: "reuse", priceId: p.id };
  }
  if (amountCents == null) {
    const reason = "client_pro_amount_cents is required to create the Client Pro TEST price (no amount in code)";
    return explicit ? { action: "refuse", reason } : { action: "skip", reason: `skipped: ${reason}` };
  }
  return { action: "create", amountCents };
}

export function clientProPriceParams(amountCents) {
  return {
    currency: CLIENT_PRO.currency,
    unit_amount: amountCents,
    recurring: { interval: CLIENT_PRO.interval },
    lookup_key: CLIENT_PRO.lookupKey,
    nickname: "Client Pro monthly (staging TEST)",
    product_data: { name: "Tulala Client Pro", metadata: { managed_by: MANAGED_BY } },
    metadata: { managed_by: MANAGED_BY },
  };
}

// ─── Encoding ────────────────────────────────────────────────────────────────

/** Stripe form encoding: nested objects as a[b][c], arrays as a[0]. undefined is dropped. */
export function toForm(obj, form = new URLSearchParams(), prefix = "") {
  const add = (key, v) => {
    if (v === undefined) return;
    if (v !== null && typeof v === "object") toForm(v, form, key);
    else form.append(key, v === null ? "" : String(v));
  };
  if (Array.isArray(obj)) obj.forEach((v, i) => add(`${prefix}[${i}]`, v));
  else for (const [k, v] of Object.entries(obj)) add(prefix ? `${prefix}[${k}]` : k, v);
  return form;
}

// ─── Coverage of every mode-bound name ───────────────────────────────────────

/**
 * Where each `_TEST` sibling (env-keys.ts MODE_BOUND) comes from on staging.
 * workflow    : this workflow writes it (lane in `how`)
 * manual      : PM/Oran copies it from the Stripe dashboard
 * present     : already in Vercel Preview (names checked 2026-10-19)
 * not-covered : out of this workflow's scope (see note)
 */
export const TEST_SIBLING_COVERAGE = {
  STRIPE_SECRET_KEY_TEST: { source: "present", how: "Preview has it" },
  STRIPE_MX_SECRET_KEY_TEST: { source: "present", how: "Preview has it" },
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST: { source: "manual", how: "US pk_test_ from the dashboard; not readable via API" },
  STRIPE_MX_PUBLISHABLE_KEY_TEST: { source: "manual", how: "MX pk_test_ from the dashboard; not readable via API" },
  NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY_TEST: { source: "manual", how: "MX pk_test_ from the dashboard; not readable via API" },
  STRIPE_WEBHOOK_SECRET_TEST: { source: "workflow", how: "lane us" },
  STRIPE_WEBHOOK_SECRET_CONNECT_TEST: { source: "workflow", how: "lane connect" },
  STRIPE_MX_WEBHOOK_SECRET_TEST: { source: "workflow", how: "lane mx" },
  STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST: { source: "workflow", how: "lane mx (Preview already has a value; reused when its endpoint is found)" },
  STRIPE_PORTAL_CONFIGURATION_ID_TEST: { source: "workflow", how: "lane portal" },
  STRIPE_MX_PORTAL_CONFIGURATION_ID_TEST: { source: "workflow", how: "lane portal" },
  STRIPE_CLIENT_PRO_PRICE_ID_TEST: { source: "workflow", how: "lane client-pro-price" },
  STRIPE_CLIENT_SUBSCRIPTION_WEBHOOK_SECRET_TEST: {
    source: "not-covered",
    how: "/api/discover/subscriptions/webhook needs its own endpoint; Client Pro is not sold yet (CLIENT_PRO_PRICING_LIVE=false)",
  },
  STRIPE_V2_SECRET_KEY_TEST: { source: "not-covered", how: "Stripe v2 lane, separate package" },
  STRIPE_V2_WEBHOOK_SECRET_TEST: { source: "not-covered", how: "Stripe v2 lane, separate package" },
  STRIPE_TERMINAL_READER_ID_TEST: { source: "not-covered", how: "Terminal simulated reader, separate package" },
};
