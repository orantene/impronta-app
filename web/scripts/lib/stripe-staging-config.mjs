/**
 * Pure planning and guards for scripts/stripe/provision-staging-test.mjs, the
 * LOCAL script that provisions the staging Stripe TEST config (lanes us,
 * connect, mx, portal, client-pro-price, all). No I/O here; every decision is
 * unit-tested in stripe-staging-config.test.mjs.
 *
 * Staging runs STRIPE_FORCE_TEST_MODE=1, so the app reads the `_TEST` sibling
 * of every mode-bound Stripe name (lib/stripe/env-keys.ts). TEST_SIBLING_COVERAGE
 * names the staging source of each one (test-pinned to env-keys.ts).
 */
import { MANAGED_BY } from "./stripe-staging-webhook.mjs";
import { SEED_TAG } from "./stripe-portal-config.mjs";

// ─── Key source: ONLY these two names are ever read from the env file ───────

/** The local env file also holds production DB vars: these are the ONLY names read from it. */
export const KEY_NAMES = { us: "STRIPE_SECRET_KEY", mx: "STRIPE_MX_SECRET_KEY" };

/** Preview publishable keys (type encrypted, readable) that pin each account. */
export const PUBLISHABLE_NAMES = { us: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST", mx: "STRIPE_MX_PUBLISHABLE_KEY_TEST" };

export const DEFAULT_ENV_FILE = "/Users/oranpersonal/Desktop/impronta-app/web/.env.local";

/**
 * Own line parser. Returns ONLY the requested names; every other line is
 * skipped without being kept. Handles `export `, quotes and trailing comments
 * on unquoted values. Last assignment wins (dotenv behaviour).
 */
export function readNamedVars(text, names) {
  const want = new Set(names);
  const out = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || !want.has(m[1])) continue;
    let v = m[2].trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) v = v.slice(1, v.lastIndexOf(q));
    else v = v.replace(/\s+#.*$/, "").trim();
    out[m[1]] = v;
  }
  return out;
}

/**
 * The account fingerprint Stripe embeds in a TEST key: the characters after
 * `_test_51` that come from the account id. Secret, restricted and publishable
 * keys of one account share it. FINGERPRINT_LEN is the account-id part length:
 * 15 = an account id `acct_1XXXXXXXXXXXXXXX` minus `acct_1` (verified against
 * /v1/account for both sandboxes on 2026-10-19).
 */
export const FINGERPRINT_LEN = 15;
export function keyFingerprint(key) {
  const m = String(key ?? "").match(/^(?:sk|rk|pk)_test_51([A-Za-z0-9]+)/);
  if (!m || m[1].length < FINGERPRINT_LEN) return null;
  return m[1].slice(0, FINGERPRINT_LEN);
}

/** Short display form: last 6 characters ("...TmH6Mb"). Never the key. */
export function fingerprintLabel(fp) {
  return fp ? `...${fp.slice(-6)}` : "(none)";
}

/**
 * The secret key, the Preview publishable key and /v1/account must all name the
 * SAME account: same fingerprint in both keys, account id ends with it.
 */
export function checkAccountMatch({ label, secretKey, publishableKey, accountId }) {
  const sk = keyFingerprint(secretKey);
  if (!sk) return { ok: false, reason: `${label}: secret key carries no test account fingerprint` };
  const pk = keyFingerprint(publishableKey);
  if (!pk) return { ok: false, reason: `${label}: Preview publishable key is missing or not pk_test_` };
  if (sk !== pk) {
    return {
      ok: false,
      reason: `${label}: secret key account ${fingerprintLabel(sk)} != Preview publishable key account ${fingerprintLabel(pk)}`,
    };
  }
  if (!accountId || !String(accountId).endsWith(sk)) {
    return { ok: false, reason: `${label}: /v1/account id does not end with the key fingerprint ${fingerprintLabel(sk)}` };
  }
  return { ok: true, fingerprint: sk };
}

/** The US and MX keys must be different Stripe accounts. */
export function checkDistinctAccounts(usAccountId, mxAccountId) {
  if (!usAccountId || !mxAccountId) {
    return { ok: false, reason: "could not read both Stripe account ids; cannot prove the MX key is a separate account" };
  }
  if (usAccountId === mxAccountId) {
    return { ok: false, reason: "the MX key is the SAME Stripe account as the US key; one account must not deliver to both webhook URLs" };
  }
  return { ok: true };
}

// ─── Vercel write shape ──────────────────────────────────────────────────────

export const PREVIEW_TARGET = Object.freeze(["preview"]);

/** Every write: sensitive, Preview only (never production or development), all branches. */
export function vercelWriteBody(value) {
  return { value, type: "sensitive", target: [...PREVIEW_TARGET] };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

export const CLI_LANES = ["us", "connect", "mx", "portal", "client-pro-price", "all"];

export function parseArgs(argv) {
  const o = {
    lane: null,
    apply: false,
    recreate: false,
    replaceUnmarkedMxPlatform: false,
    clientProAmountCents: "",
    envFile: DEFAULT_ENV_FILE,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    try {
      if (a === "--lane") o.lane = next();
      else if (a === "--apply") o.apply = true;
      else if (a === "--recreate") o.recreate = true;
      else if (a === "--replace-unmarked-mx-platform") o.replaceUnmarkedMxPlatform = true;
      else if (a === "--client-pro-amount-cents") o.clientProAmountCents = next();
      // Deliberately NOT --env-file: Node 20 consumes that flag even after the
      // script name and loads the whole file into process.env.
      else if (a === "--keys-file") o.envFile = next();
      else return { ok: false, reason: `unknown argument ${a}` };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }
  if (!o.lane) return { ok: false, reason: `--lane is required (${CLI_LANES.join(" | ")})` };
  if (!CLI_LANES.includes(o.lane)) return { ok: false, reason: `unknown lane "${o.lane}"; use ${CLI_LANES.join(", ")}` };
  return { ok: true, ...o };
}

const MX_STEPS = new Set(["webhook:mx", "webhook:mx-connect", "portal:mx"]);

const LANE_STEPS = {
  us: ["webhook:us"],
  connect: ["webhook:us-connect"],
  mx: ["webhook:mx", "webhook:mx-connect"],
  portal: ["portal:us", "portal:mx"],
  "client-pro-price": ["client-pro-price"],
  // client-pro-price is deliberately NOT in `all` (consultant, 2026-10-19):
  // explicit --lane client-pro-price only.
  all: ["webhook:us", "webhook:us-connect", "webhook:mx", "webhook:mx-connect", "portal:us", "portal:mx"],
};

/**
 * --replace-unmarked-mx-platform applies to the MX PLATFORM endpoint only: an
 * existing unmarked endpoint there is replaced (create marked, write secret,
 * then disable the old one). Every other lane keeps the plain refusal.
 */
export function replaceUnmarkedFor(stepId, flag) {
  return stepId === "webhook:mx" && flag === true;
}

/**
 * The steps a lane runs. Without the MX key in the env file, MX steps are
 * SKIPPED (one "skipped:" line each, non-fatal) and the rest still run; only an
 * explicit --lane mx refuses.
 */
export function selectSteps(lane, { hasMxKey }) {
  const all = LANE_STEPS[lane];
  if (!all) return { ok: false, reason: `unknown lane "${lane}"; use ${CLI_LANES.join(", ")}` };
  if (lane === "mx" && !hasMxKey) return { ok: false, reason: `${KEY_NAMES.mx} is not in the env file` };
  const steps = [];
  const skipped = [];
  for (const id of all) {
    if (MX_STEPS.has(id) && !hasMxKey) skipped.push({ id, reason: `skipped: ${KEY_NAMES.mx} not in the env file` });
    else steps.push(id);
  }
  return { ok: true, steps, skipped };
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

/** One-line feature summary of a portal configuration body (for the plan output). */
export function portalFeatureSummary(cfg) {
  const f = cfg.features;
  const on = (x) => (x?.enabled ? "on" : "off");
  const sw = f.subscription_update;
  return [
    `invoice history ${on(f.invoice_history)}`,
    `payment method update ${on(f.payment_method_update)}`,
    `cancel ${on(f.subscription_cancel)}${f.subscription_cancel?.enabled ? ` (${f.subscription_cancel.mode})` : ""}`,
    `plan switching ${on(sw)}${sw?.enabled ? ` (${sw.proration_behavior}, ${sw.products?.length ?? 0} products)` : ""}`,
    `pause ${on(f.subscription_pause)}`,
    `customer update ${on(f.customer_update)}`,
  ].join(", ");
}

// ─── Client Pro price ────────────────────────────────────────────────────────

/**
 * lib/stripe/client-billing.ts reads STRIPE_CLIENT_PRO_PRICE_ID via stripeEnv.
 * The amount is NOT authoritative in code (the /client/subscription page shows
 * a "$49 / mo" placeholder and CLIENT_PRO_PRICING_LIVE is false), so creating
 * the price needs --client-pro-amount-cents.
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
  if (!/^[0-9]+$/.test(s)) return { ok: false, reason: "--client-pro-amount-cents must be a whole number of cents (e.g. 4900)" };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 100_000_000) {
    return { ok: false, reason: "--client-pro-amount-cents must be between 1 and 100000000" };
  }
  return { ok: true, cents: n };
}

/**
 * reuse  : an active price with the lookup_key, monthly USD (and equal to the
 *          amount given, when one is given)
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
      return { action: "refuse", reason: `existing ${CLIENT_PRO.lookupKey} has a different amount than --client-pro-amount-cents; will not re-price` };
    }
    return { action: "reuse", priceId: p.id, amountCents: p.unit_amount };
  }
  if (amountCents == null) {
    const reason = "needs --client-pro-amount-cents (no amount in code)";
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
 * script      : provision-staging-test.mjs writes it (lane in `how`)
 * fallback    : not needed; the app falls back to another name that is present
 * present     : already in Vercel Preview (names checked 2026-10-19)
 * not-covered : out of this script's scope (see note)
 */
export const TEST_SIBLING_COVERAGE = {
  STRIPE_SECRET_KEY_TEST: { source: "present", how: "Preview has it (sensitive)" },
  STRIPE_MX_SECRET_KEY_TEST: { source: "present", how: "Preview has it (sensitive)" },
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST: { source: "present", how: "Preview has it (encrypted); pins the US account" },
  STRIPE_MX_PUBLISHABLE_KEY_TEST: { source: "present", how: "Preview has it (encrypted); pins the MX account" },
  NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY_TEST: {
    source: "fallback",
    how: "getStripeMxPublishableKey() (lib/stripe/client.ts) falls back to STRIPE_MX_PUBLISHABLE_KEY_TEST, which Preview has",
  },
  STRIPE_WEBHOOK_SECRET_TEST: { source: "script", how: "lane us" },
  STRIPE_WEBHOOK_SECRET_CONNECT_TEST: { source: "script", how: "lane connect" },
  STRIPE_MX_WEBHOOK_SECRET_TEST: { source: "script", how: "lane mx" },
  STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST: { source: "script", how: "lane mx" },
  STRIPE_PORTAL_CONFIGURATION_ID_TEST: { source: "script", how: "lane portal" },
  STRIPE_MX_PORTAL_CONFIGURATION_ID_TEST: { source: "script", how: "lane portal" },
  STRIPE_CLIENT_PRO_PRICE_ID_TEST: { source: "script", how: "lane client-pro-price" },
  STRIPE_CLIENT_SUBSCRIPTION_WEBHOOK_SECRET_TEST: {
    source: "not-covered",
    how: "/api/discover/subscriptions/webhook needs its own endpoint; Client Pro is not sold yet (CLIENT_PRO_PRICING_LIVE=false)",
  },
  STRIPE_V2_SECRET_KEY_TEST: { source: "not-covered", how: "Stripe v2 lane, separate package" },
  STRIPE_V2_WEBHOOK_SECRET_TEST: { source: "not-covered", how: "Stripe v2 lane, separate package" },
  STRIPE_TERMINAL_READER_ID_TEST: { source: "not-covered", how: "Terminal simulated reader, separate package" },
};
