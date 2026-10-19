#!/usr/bin/env node
/**
 * Provision the staging Stripe TEST config from this Mac (TUL-830).
 *
 *   node web/scripts/stripe/provision-staging-test.mjs --lane <us|connect|mx|portal|client-pro-price|all>
 *        [--apply] [--recreate] [--client-pro-amount-cents N] [--keys-file PATH]
 *
 * DRY RUN BY DEFAULT: without --apply it only reads (Stripe lists, Vercel env
 * names) and prints the plan: names, URLs, counts, account fingerprints. Never
 * a value.
 *
 * Writes the `_TEST` siblings staging reads under STRIPE_FORCE_TEST_MODE=1:
 *   us        account webhook  /api/webhooks/stripe     -> STRIPE_WEBHOOK_SECRET_TEST
 *   connect   Connect webhook  /api/webhooks/stripe     -> STRIPE_WEBHOOK_SECRET_CONNECT_TEST
 *   mx        account + Connect webhooks /api/webhooks/stripe-mx
 *                                -> STRIPE_MX_WEBHOOK_SECRET_TEST, STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST
 *   portal    billing portal configuration per account
 *                                -> STRIPE_PORTAL_CONFIGURATION_ID_TEST, STRIPE_MX_PORTAL_CONFIGURATION_ID_TEST
 *   client-pro-price  monthly USD price -> STRIPE_CLIENT_PRO_PRICE_ID_TEST
 *
 * Hard guards (all before any write; any failure refuses with exit 2):
 *   - Keys: ONLY STRIPE_SECRET_KEY and STRIPE_MX_SECRET_KEY are parsed out of
 *     the env file by our own line parser. The file (which also holds
 *     production DB settings) is never loaded into the process environment.
 *     No database client, no database call.
 *   - Each key is sk_test_/rk_test_, /v1/balance says livemode=false, and the
 *     account fingerprint in the key equals the one in the Preview publishable
 *     key (US NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST, MX
 *     STRIPE_MX_PUBLISHABLE_KEY_TEST) and /v1/account. US and MX must differ.
 *   - Vercel writes: type sensitive, target exactly ["preview"], upsert by id
 *     of the one preview-wide entry; an entry shared with production refuses.
 *   - Values never printed, logged or written to disk: the publishable key is
 *     read into memory by env id, and Vercel bodies go over stdin to
 *     `vercel api` (the logged-in CLI), never argv.
 *
 * Pure logic: lib/stripe-staging-config.mjs + lib/stripe-staging-webhook.mjs.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_BASE_URL,
  MANAGED_BY,
  STRIPE_API_VERSION,
  checkBalanceLivemode,
  checkTestKey,
  laneConfig,
  pickVercelEntry,
  planEndpoint,
} from "../lib/stripe-staging-webhook.mjs";
import {
  CLIENT_PRO,
  KEY_NAMES,
  PORTAL_VARS,
  PUBLISHABLE_NAMES,
  TEST_SIBLING_COVERAGE,
  checkAccountMatch,
  checkDistinctAccounts,
  clientProPriceParams,
  fingerprintLabel,
  parseAmountCents,
  parseArgs,
  planClientProPrice,
  planPortal,
  portalFeatureSummary,
  readNamedVars,
  selectSteps,
  toForm,
  vercelWriteBody,
} from "../lib/stripe-staging-config.mjs";
import { LOOKUP_KEYS, buildPortalConfiguration, productsFromPrices } from "../lib/stripe-portal-config.mjs";

const VERCEL_PROJECT_ID = "prj_oM9OZ4CLewpMPxpKfkacWs9nRcA2";
const VERCEL_TEAM_ID = "team_otRX11wclvw89c5ls7A7UsZd";

const die = (msg) => {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
};

const args = parseArgs(process.argv.slice(2));
if (!args.ok) die(args.reason);
const amount = parseAmountCents(args.clientProAmountCents);
if (!amount.ok) die(amount.reason);
const explicit = args.lane !== "all";

let fileText;
try {
  fileText = readFileSync(args.envFile, "utf8");
} catch {
  die(`cannot read env file ${args.envFile}`);
}
const found = readNamedVars(fileText, Object.values(KEY_NAMES));
fileText = null;
const keys = { us: found[KEY_NAMES.us] || null, mx: found[KEY_NAMES.mx] || null };
if (!keys.us) die(`${KEY_NAMES.us} is not in ${args.envFile}`);
for (const a of ["us", "mx"]) {
  if (!keys[a]) continue;
  const k = checkTestKey(keys[a]);
  if (!k.ok) die(`${KEY_NAMES[a]}: ${k.reason}`);
}
const sel = selectSteps(args.lane, { hasMxKey: !!keys.mx });
if (!sel.ok) die(sel.reason);

// ─── I/O ─────────────────────────────────────────────────────────────────────

async function stripe(account, method, path, form) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${keys[account]}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? form.toString() : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Stripe(${account}) ${method} ${path.split("?")[0]} -> ${res.status} ${body?.error?.type ?? ""} ${body?.error?.code ?? ""}`);
  return body;
}

async function stripeList(account, path) {
  const out = [];
  let after = null;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await stripe(account, "GET", `${path}${sep}limit=100${after ? `&starting_after=${after}` : ""}`);
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}

/** `vercel api` with the logged-in CLI. Body (if any) over stdin. Output never printed. */
function vercelApi(method, path, body) {
  const sep = path.includes("?") ? "&" : "?";
  const argv = ["api", `${path}${sep}teamId=${VERCEL_TEAM_ID}`, "-X", method, "--raw"];
  if (body) argv.push("--input", "-");
  const r = spawnSync("vercel", argv, {
    input: body ? JSON.stringify(body) : undefined,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  if (r.status !== 0 || !parsed || parsed.error) {
    throw new Error(`Vercel ${method} ${path.split("?")[0]} failed (exit ${r.status}${parsed?.error?.code ? `, ${parsed.error.code}` : ""})`);
  }
  return parsed;
}

const project = encodeURIComponent(VERCEL_PROJECT_ID);

function writeVar(entry, name, value) {
  const payload = vercelWriteBody(value);
  if (entry) {
    vercelApi("PATCH", `/v9/projects/${project}/env/${entry.id}`, payload);
    console.log(`  Vercel: replaced ${name} (Preview only, sensitive). Production untouched.`);
  } else {
    vercelApi("POST", `/v10/projects/${project}/env`, { key: name, ...payload });
    console.log(`  Vercel: created ${name} (Preview only, sensitive). Production untouched.`);
  }
}

const lookupQuery = (ks) => ks.map((k) => `lookup_keys[]=${encodeURIComponent(k)}`).join("&");

// ─── PLAN (read only) ────────────────────────────────────────────────────────

async function planAll() {
  console.log(`Lane ${args.lane}, ${args.apply ? "APPLY" : "dry run (no --apply): nothing will be written"}.`);
  for (const s of sel.skipped) console.log(`[${s.id}] ${s.reason}`);

  const envs = vercelApi("GET", `/v10/projects/${project}/env`).envs ?? [];
  const accounts = sel.steps.some((id) => id.includes("mx")) ? ["us", "mx"] : ["us"];
  const fp = {};
  const acctIds = {};
  for (const a of accounts) {
    const live = checkBalanceLivemode(await stripe(a, "GET", "/v1/balance"));
    if (!live.ok) die(`${a}: ${live.reason}`);
    acctIds[a] = (await stripe(a, "GET", "/v1/account").catch(() => null))?.id ?? null;
    const pkEntry = envs.find((e) => e.key === PUBLISHABLE_NAMES[a] && (e.target ?? []).includes("preview"));
    if (!pkEntry) die(`${PUBLISHABLE_NAMES[a]} is not in Vercel Preview; cannot pin the ${a} account`);
    const pk = vercelApi("GET", `/v1/projects/${project}/env/${pkEntry.id}`).value;
    const m = checkAccountMatch({ label: a.toUpperCase(), secretKey: keys[a], publishableKey: pk, accountId: acctIds[a] });
    if (!m.ok) die(m.reason);
    fp[a] = fingerprintLabel(m.fingerprint);
    console.log(
      `Account ${a.toUpperCase()} ${fp[a]}: test key, livemode=false, matches ${PUBLISHABLE_NAMES[a]} and /v1/account.`,
    );
  }
  if (accounts.includes("mx")) {
    const d = checkDistinctAccounts(acctIds.us, acctIds.mx);
    if (!d.ok) die(d.reason);
  }

  const pickVar = (name) => {
    const p = pickVercelEntry(envs, name);
    if (!p.ok) die(p.reason);
    return p.entry;
  };
  const endpointsBy = {};
  const endpointsOf = async (a) => (endpointsBy[a] ??= await stripeList(a, "/v1/webhook_endpoints"));

  const plans = [];
  for (const id of sel.steps) {
    if (id.startsWith("webhook:")) {
      const lc = laneConfig(id.slice("webhook:".length), DEFAULT_BASE_URL);
      if (!lc.ok) die(lc.reason);
      const entry = pickVar(lc.secretVar);
      const plan = planEndpoint({
        endpoints: await endpointsOf(lc.account),
        url: lc.url,
        otherUrl: lc.otherUrl,
        varExists: !!entry,
        recreate: args.recreate,
        kind: lc.kind,
      });
      plans.push({
        id,
        kind: "webhook",
        account: lc.account,
        lc,
        entry,
        plan,
        varName: lc.secretVar,
        target: `${lc.account.toUpperCase()} ${lc.kind === "connect" ? "Connect" : "platform"} endpoint ${lc.url}, ${lc.events.length} events`,
      });
    } else if (id.startsWith("portal:")) {
      const a = id.slice("portal:".length);
      const configs = await stripeList(a, "/v1/billing_portal/configurations");
      const prices = await stripeList(a, `/v1/prices?active=true&${lookupQuery(LOOKUP_KEYS)}`);
      const products = productsFromPrices(prices);
      plans.push({
        id,
        kind: "portal",
        account: a,
        products,
        entry: pickVar(PORTAL_VARS[a]),
        plan: planPortal({ configs, products, explicit }),
        varName: PORTAL_VARS[a],
        target: `${a.toUpperCase()} billing portal configuration: ${portalFeatureSummary(buildPortalConfiguration(products))}`,
      });
    } else if (id === "client-pro-price") {
      const prices = await stripeList("us", `/v1/prices?active=true&${lookupQuery([CLIENT_PRO.lookupKey])}`);
      const plan = planClientProPrice({ prices, amountCents: amount.cents, explicit });
      const amt = plan.amountCents != null ? `${plan.amountCents} cents` : "amount: needs --client-pro-amount-cents";
      plans.push({
        id,
        kind: "price",
        account: "us",
        entry: pickVar(CLIENT_PRO.varName),
        plan,
        varName: CLIENT_PRO.varName,
        target: `US Client Pro price ${CLIENT_PRO.lookupKey}, ${amt}, ${CLIENT_PRO.currency}, every ${CLIENT_PRO.interval}`,
      });
    }
  }

  console.log("\nPlan:");
  for (const p of plans) {
    const writes =
      p.plan.action === "skip" || p.plan.action === "refuse" || (p.kind === "webhook" && p.plan.action === "reuse")
        ? "not written"
        : p.entry
          ? "will be REPLACED"
          : "will be created";
    const head = p.plan.action === "skip" ? p.plan.reason : p.plan.action === "refuse" ? `REFUSE: ${p.plan.reason}` : p.plan.action;
    console.log(`[${p.id}] account ${fp[p.account]} | ${head}`);
    console.log(`    object: ${p.target}`);
    console.log(`    var:    ${p.varName} (${p.entry ? "exists" : "missing"}; ${writes})`);
  }
  const willWrite = plans.filter((p) => !["skip", "refuse"].includes(p.plan.action) && !(p.kind === "webhook" && p.plan.action === "reuse"));
  console.log(`\nVercel Preview vars that --apply would write: ${willWrite.length ? willWrite.map((p) => p.varName).join(", ") : "(none)"}.`);
  const manual = Object.entries(TEST_SIBLING_COVERAGE).filter(([, v]) => v.source === "manual").map(([k]) => k);
  console.log(`Manual (PM/Oran, Stripe dashboard -> Vercel Preview): ${manual.join(", ")}.`);
  return plans;
}

// ─── APPLY ───────────────────────────────────────────────────────────────────

async function applyWebhook({ id, lc, entry, plan }) {
  const lane = id.slice("webhook:".length);
  const eventsForm = () => toForm({ enabled_events: lc.events });
  if (plan.action === "reuse") {
    await stripe(lc.account, "POST", `/v1/webhook_endpoints/${plan.endpointId}`, eventsForm());
    console.log(`  Stripe: enabled_events synced (${lc.events.length}). Secret unchanged.`);
    return;
  }
  if (plan.action === "recreate") {
    await stripe(lc.account, "DELETE", `/v1/webhook_endpoints/${plan.endpointId}`);
    console.log("  Stripe: deleted the endpoint this script made earlier.");
  }
  const form = eventsForm();
  toForm(
    {
      url: lc.url,
      description: `Tulala staging (TEST), ${lane} lane. Managed by provision-staging-test.`,
      metadata: { managed_by: MANAGED_BY, lane },
      api_version: STRIPE_API_VERSION,
      ...(lc.kind === "connect" ? { connect: true } : {}),
    },
    form,
  );
  const created = await stripe(lc.account, "POST", "/v1/webhook_endpoints", form);
  if (created.livemode !== false) die("created endpoint is not livemode=false");
  if (created.api_version !== STRIPE_API_VERSION) die(`created endpoint api_version ${created.api_version} != ${STRIPE_API_VERSION}`);
  console.log(`  Stripe: created ${lc.kind} endpoint (${lc.events.length} events, api_version ${created.api_version}).`);
  if (!created.secret) die("Stripe returned no signing secret");
  writeVar(entry, lc.secretVar, created.secret);
}

async function applyPortal({ account, products, entry, plan, varName }) {
  let configId = plan.configId;
  if (plan.action === "create") {
    const c = await stripe(account, "POST", "/v1/billing_portal/configurations", toForm(buildPortalConfiguration(products)));
    if (c.livemode !== false) die("created portal configuration is not livemode=false");
    configId = c.id;
    console.log(`  Stripe: created portal configuration (${products.length} products in plan switching).`);
  } else {
    console.log("  Stripe: reused the tagged portal configuration (not changed).");
  }
  writeVar(entry, varName, configId);
}

async function applyPrice({ entry, plan, varName }) {
  let priceId = plan.priceId;
  if (plan.action === "create") {
    const p = await stripe("us", "POST", "/v1/prices", toForm(clientProPriceParams(plan.amountCents)));
    if (p.livemode !== false) die("created price is not livemode=false");
    priceId = p.id;
    console.log(`  Stripe: created ${CLIENT_PRO.lookupKey}.`);
  } else {
    console.log(`  Stripe: reused ${CLIENT_PRO.lookupKey}.`);
  }
  writeVar(entry, varName, priceId);
}

async function main() {
  const plans = await planAll();
  const refused = plans.filter((p) => p.plan.action === "refuse");
  if (refused.length) die(`${refused.length} step(s) refused (${refused.map((p) => p.id).join(", ")}); nothing written`);
  if (!args.apply) {
    console.log("\nDry run: nothing written. Re-run with --apply to write.");
    return;
  }
  for (const p of plans) {
    if (p.plan.action === "skip") continue;
    console.log(`[${p.id}] ${p.plan.action}`);
    if (p.kind === "webhook") await applyWebhook(p);
    else if (p.kind === "portal") await applyPortal(p);
    else if (p.kind === "price") await applyPrice(p);
  }
  console.log("Done. Takes effect on the next staging build (no build fired here).");
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
