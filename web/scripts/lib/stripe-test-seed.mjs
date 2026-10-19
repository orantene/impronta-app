/**
 * Pure guards and planning for scripts/seed-product-prices-from-stripe-test.mjs
 * (the existing scripts/seed-stripe-test-prices.mjs CREATES prices in Stripe and
 * prints their ids; this runner WRITES supplied ids into product_prices).
 * No I/O here, so every refusal is unit-tested (stripe-test-seed.test.mjs).
 *
 * The runner seeds Stripe TEST price ids into `product_prices` on the isolated
 * STAGING project (fxlank) only. Its refusals, in the order they run:
 *   1. the DB login is postgres.fxlankepwnvelxjrahwk, exactly
 *   2. no env value mentions the production project ref
 *   3. the Stripe key is `sk_test_...` (live and restricted keys are refused)
 *   4. Stripe itself says test mode (`/v1/account` and each price: livemode false)
 *   5. each price id has the right shape, interval and currency
 */

export const STAGING_PROJECT_REF = "fxlankepwnvelxjrahwk";
export const STAGING_DB_USER = `postgres.${STAGING_PROJECT_REF}`;
export const PROD_PROJECT_REF = "pluhdapdnuiulvxmyspd";
export const SEED_NOTE = "stripe-test-seed-runner";

/** plan row -> tier + interval. Order is the print order. */
export const PLAN_ROWS = [
  { key: "talent_pro_month", pkg: "talent", tier: "pro", interval: "month", plan: "talent_pro" },
  { key: "talent_pro_year", pkg: "talent", tier: "pro", interval: "year", plan: "talent_pro" },
  { key: "talent_max_month", pkg: "talent", tier: "max", interval: "month", plan: "talent_portfolio" },
  { key: "talent_max_year", pkg: "talent", tier: "max", interval: "year", plan: "talent_portfolio" },
  { key: "workspace_studio_month", pkg: "workspace", tier: "studio", interval: "month", plan: "studio" },
  { key: "workspace_studio_year", pkg: "workspace", tier: "studio", interval: "year", plan: "studio" },
  { key: "workspace_agency_month", pkg: "workspace", tier: "agency", interval: "month", plan: "agency" },
  { key: "workspace_agency_year", pkg: "workspace", tier: "agency", interval: "year", plan: "agency" },
  { key: "workspace_website_month", pkg: "workspace", tier: "website", interval: "month", plan: "website", optional: true },
  { key: "workspace_website_year", pkg: "workspace", tier: "website", interval: "year", plan: "website", optional: true },
];

/** `workspace_studio_month` -> `--workspace-studio-month` / `STRIPE_TEST_PRICE_WORKSPACE_STUDIO_MONTH`. */
export const flagName = (key) => `--${key.replace(/_/g, "-")}`;
export const envName = (key) => `STRIPE_TEST_PRICE_${key.toUpperCase()}`;

const PRICE_ID_RE = /^price_[A-Za-z0-9]{8,}$/;

/** @returns {{ ok: true, user: string } | { ok: false, reason: string }} */
export function checkDbLogin(databaseUrl) {
  if (!databaseUrl) return { ok: false, reason: "DATABASE_URL is not set" };
  let user;
  try {
    user = decodeURIComponent(new URL(databaseUrl).username);
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid URL" };
  }
  if (user !== STAGING_DB_USER) {
    return { ok: false, reason: `DB login is not ${STAGING_DB_USER} (refusing: staging fxlank only)` };
  }
  return { ok: true, user };
}

/** Names (never values) of env entries that mention the production project ref. */
export function envMentioningProd(env) {
  return Object.entries(env)
    .filter(([, v]) => typeof v === "string" && v.includes(PROD_PROJECT_REF))
    .map(([k]) => k)
    .sort();
}

/** @returns {{ ok: true } | { ok: false, reason: string }} Test-mode keys only; the value is never echoed. */
export function checkStripeKey(key) {
  const k = (key ?? "").trim();
  if (!k) return { ok: false, reason: "no Stripe key: set STRIPE_SECRET_KEY or pass --stripe-key-file (an sk_test_ key)" };
  if (/^(sk|rk)_live_/.test(k)) return { ok: false, reason: "a LIVE Stripe key was supplied: refused (test mode only)" };
  if (!/^sk_test_[A-Za-z0-9]{10,}$/.test(k)) return { ok: false, reason: "the Stripe key is not an sk_test_ key: refused" };
  return { ok: true };
}

/** @returns {{ ok: true } | { ok: false, reason: string }} */
export function checkAccountResponse(account) {
  if (!account || typeof account !== "object") return { ok: false, reason: "Stripe /v1/account returned nothing usable" };
  if (account.livemode !== false) return { ok: false, reason: "Stripe /v1/account does not say livemode=false: refused" };
  return { ok: true };
}

/** Parse flags and env into the supplied price ids. Unknown flags are errors (a typo must not silently skip a row). */
export function parseArgs(argv, env) {
  const out = { apply: false, cleanup: false, stripeKeyFile: null, backupFile: null, idsFile: null, prices: {}, errors: [] };
  const known = new Map(PLAN_ROWS.map((r) => [flagName(r.key), r.key]));
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const [name, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    if (name === "--apply") out.apply = true;
    else if (name === "--cleanup") out.cleanup = true;
    else if (name === "--stripe-key-file") out.stripeKeyFile = inline ?? argv[++i] ?? null;
    else if (name === "--ids-file") out.idsFile = inline ?? argv[++i] ?? null;
    else if (name === "--backup-file") out.backupFile = inline ?? argv[++i] ?? null;
    else if (known.has(name)) out.prices[known.get(name)] = (inline ?? argv[++i] ?? "").trim();
    else out.errors.push(`unknown argument ${name}`);
  }
  if (out.idsFile && Object.keys(out.prices).length) {
    out.errors.push("--ids-file cannot be combined with --<row> price flags");
    return out;
  }
  for (const r of PLAN_ROWS) {
    if (!out.idsFile && !out.prices[r.key] && env[envName(r.key)]) out.prices[r.key] = String(env[envName(r.key)]).trim();
  }
  return out;
}

/** Required rows present, optional (website) both-or-none, id shape valid. @returns {string[]} problems */
export function validatePriceIds(prices) {
  const problems = [];
  for (const r of PLAN_ROWS) {
    const v = prices[r.key];
    if (!v) {
      if (!r.optional) problems.push(`missing ${flagName(r.key)} (or ${envName(r.key)})`);
      continue;
    }
    if (!PRICE_ID_RE.test(v)) problems.push(`${r.key}: "${v.slice(0, 12)}" is not a price id (price_...)`);
  }
  const web = ["workspace_website_month", "workspace_website_year"].map((k) => Boolean(prices[k]));
  if (web[0] !== web[1]) problems.push("workspace_website needs both month and year, or neither");
  const ids = Object.values(prices).filter(Boolean);
  if (new Set(ids).size !== ids.length) problems.push("the same price id was given for two rows");
  return problems;
}

/** Check one Stripe price object against its plan row. @returns {string[]} problems */
export function checkStripePrice(row, price) {
  const p = [];
  if (!price || typeof price !== "object") return [`${row.key}: price not found in Stripe TEST`];
  if (price.livemode !== false) p.push(`${row.key}: price is not livemode=false: refused`);
  if (price.active !== true) p.push(`${row.key}: price is archived/inactive in Stripe`);
  if (String(price.currency).toLowerCase() !== "usd") p.push(`${row.key}: currency is ${price.currency}, expected usd`);
  if (price.type !== "recurring") p.push(`${row.key}: price is not recurring`);
  if (price.recurring?.interval !== row.interval) p.push(`${row.key}: interval is ${price.recurring?.interval ?? "none"}, expected ${row.interval}`);
  if (price.recurring && price.recurring.interval_count !== 1) p.push(`${row.key}: interval_count is not 1`);
  if (!Number.isInteger(price.unit_amount) || price.unit_amount < 0) p.push(`${row.key}: unit_amount missing`);
  return p;
}

/** Decide, per row, what apply would do. existing = the canonical row or undefined. */
export function planAction(existing, wanted) {
  if (!existing) return { action: "insert" };
  if (existing.stripe_price_id === wanted.stripe_price_id && Number(existing.unit_amount) === Number(wanted.unit_amount)) return { action: "unchanged" };
  return { action: "update" };
}

/**
 * Unit amounts (cents) the stripe-test-seed workflow creates, keyed by PLAN_ROWS key. They mirror
 * src/lib/access/plan-catalog.ts (a test asserts that) and the SQL in supabase/seed-staging-notes.
 * The ids file carries no amount, so --ids-file runs write these.
 */
export const STATIC_AMOUNTS = {
  talent_pro_month: 900, talent_pro_year: 9000,
  talent_max_month: 1500, talent_max_year: 15000,
  workspace_studio_month: 2900, workspace_studio_year: 29000,
  workspace_agency_month: 7900, workspace_agency_year: 79000,
};

const LOOKUP_RE = /^tulala_(talent_pro|talent_portfolio|studio|agency)_(month|year)_usd$/;

/** `tulala_talent_portfolio_month_usd` -> PLAN_ROWS key `talent_max_month`, or null. */
export function rowKeyForLookup(lookupKey) {
  const m = LOOKUP_RE.exec(String(lookupKey ?? ""));
  if (!m) return null;
  return PLAN_ROWS.find((r) => r.plan === m[1] && r.interval === m[2])?.key ?? null;
}

/**
 * Parse the artifact of the stripe-test-seed workflow: an array of
 * { id, lookup_key, livemode, interval, currency } (or { prices: [...] }).
 * Every entry must have livemode === false (strictly: missing or "false" string is rejected).
 * @returns {{ prices: Record<string,string>, amounts: Record<string,number>, errors: string[] }}
 */
export function parseIdsFile(text) {
  const out = { prices: {}, amounts: {}, errors: [] };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    out.errors.push("ids file is not valid JSON");
    return out;
  }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.prices) ? data.prices : null;
  if (!list || list.length === 0) {
    out.errors.push("ids file has no price entries");
    return out;
  }
  for (const e of list) {
    const label = e && typeof e === "object" && typeof e.lookup_key === "string" ? e.lookup_key : "(entry)";
    if (!e || typeof e !== "object") { out.errors.push(`${label}: not an object`); continue; }
    if (e.livemode !== false) { out.errors.push(`${label}: livemode is not false: ids file rejected`); continue; }
    const key = rowKeyForLookup(e.lookup_key);
    if (!key) { out.errors.push(`${label}: unknown lookup key`); continue; }
    const row = PLAN_ROWS.find((r) => r.key === key);
    if (typeof e.id !== "string" || !PRICE_ID_RE.test(e.id)) { out.errors.push(`${label}: id is not a price id`); continue; }
    if (e.interval !== row.interval) { out.errors.push(`${label}: interval ${String(e.interval)}, expected ${row.interval}`); continue; }
    if (String(e.currency).toLowerCase() !== "usd") { out.errors.push(`${label}: currency is not usd`); continue; }
    if (out.prices[key]) { out.errors.push(`${label}: duplicate entry`); continue; }
    out.prices[key] = e.id;
    out.amounts[key] = STATIC_AMOUNTS[key];
  }
  return out;
}
