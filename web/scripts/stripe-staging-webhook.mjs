#!/usr/bin/env node
/**
 * Stripe TEST config for staging: webhook endpoints, billing portal
 * configurations and the Client Pro TEST price, each written into Vercel
 * Preview as the `_TEST` sibling the app reads under STRIPE_FORCE_TEST_MODE=1
 * (TUL-830). Run only by .github/workflows/stripe-staging-webhook.yml.
 *
 * Env: STRIPE_SECRET_KEY (US test key, required), STRIPE_MX_TEST_SECRET_KEY
 * (MX test key, optional: MX steps are skipped without it, lane=mx refuses),
 * VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID, LANE
 * (us|connect|mx|portal|client-pro-price|all), BASE_URL, RECREATE (yes|no),
 * DRY_RUN (yes|no), CLIENT_PRO_AMOUNT_CENTS (blank or whole cents).
 *
 * Two phases. PLAN reads only (Stripe lists, Vercel env names and scopes) and
 * prints one line per step: action, target, var name, never a value. Any
 * refusal stops the run before anything is written. APPLY (DRY_RUN=no) then
 * runs each planned step. Refusals and planning are pure, in
 * lib/stripe-staging-webhook.mjs and lib/stripe-staging-config.mjs (unit-tested).
 *
 * Never prints a key, a signing secret, or a written var's value. Secrets go
 * from Stripe's create response straight into the Vercel API body; in Actions
 * every written value is masked first (`::add-mask::`).
 */
import {
  DEFAULT_BASE_URL,
  MANAGED_BY,
  STRIPE_API_VERSION,
  checkBalanceLivemode,
  checkTestKey,
  laneConfig,
  pickVercelEntry,
  planEndpoint,
} from "./lib/stripe-staging-webhook.mjs";
import {
  CLIENT_PRO,
  MX_KEY_SECRET,
  PORTAL_VARS,
  TEST_SIBLING_COVERAGE,
  checkDistinctAccounts,
  clientProPriceParams,
  parseAmountCents,
  planClientProPrice,
  planPortal,
  selectSteps,
  toForm,
} from "./lib/stripe-staging-config.mjs";
import { LOOKUP_KEYS, buildPortalConfiguration, productsFromPrices } from "./lib/stripe-portal-config.mjs";

const env = process.env;
const die = (msg) => {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
};

const keys = { us: env.STRIPE_SECRET_KEY, mx: (env[MX_KEY_SECRET] ?? "").trim() || null };
const usOk = checkTestKey(keys.us);
if (!usOk.ok) die(`US key: ${usOk.reason}`);
if (keys.mx) {
  const mxOk = checkTestKey(keys.mx);
  if (!mxOk.ok) die(`${MX_KEY_SECRET}: ${mxOk.reason}`);
}
const lane = (env.LANE || "us").trim();
const sel = selectSteps(lane, { hasMxKey: !!keys.mx });
if (!sel.ok) die(sel.reason);
const explicit = lane !== "all";
const baseUrl = env.BASE_URL || DEFAULT_BASE_URL;
const dryRun = env.DRY_RUN !== "no";
const recreate = env.RECREATE === "yes";
const amount = parseAmountCents(env.CLIENT_PRO_AMOUNT_CENTS);
if (!amount.ok) die(amount.reason);
for (const n of ["VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"]) if (!env[n]) die(`${n} is not set`);

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

async function vercel(method, path, json) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.vercel.com${path}${sep}teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}`, {
    method,
    headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, "Content-Type": "application/json" },
    body: json ? JSON.stringify(json) : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Vercel ${method} ${path.split("?")[0]} -> ${res.status} ${body?.error?.code ?? ""}`);
  return body;
}

/** Preview-only, all branches. `sensitive` for signing secrets, `encrypted` for ids. */
async function writeVar(entry, name, value, type) {
  if (env.GITHUB_ACTIONS === "true") process.stdout.write(`::add-mask::${value}\n`);
  const project = encodeURIComponent(env.VERCEL_PROJECT_ID);
  const payload = { value, type, target: ["preview"] };
  if (entry) {
    await vercel("PATCH", `/v9/projects/${project}/env/${entry.id}`, payload);
    console.log(`  Vercel: updated ${name} (Preview, all branches, ${type}). Production untouched.`);
  } else {
    await vercel("POST", `/v10/projects/${project}/env`, { key: name, ...payload });
    console.log(`  Vercel: created ${name} (Preview, all branches, ${type}). Production untouched.`);
  }
}

const lookupQuery = (ks) => ks.map((k) => `lookup_keys[]=${encodeURIComponent(k)}`).join("&");

// ─── PLAN (read only) ────────────────────────────────────────────────────────

async function planAll() {
  for (const s of sel.skipped) console.log(`[${s.id}] ${s.reason}`);

  const accounts = [...new Set(sel.steps.map((id) => (id.includes("mx") ? "mx" : "us")))];
  const acctIds = {};
  for (const a of accounts.includes("mx") ? ["us", "mx"] : accounts) {
    const live = checkBalanceLivemode(await stripe(a, "GET", "/v1/balance"));
    if (!live.ok) die(`${a}: ${live.reason}`);
    acctIds[a] = (await stripe(a, "GET", "/v1/account").catch(() => null))?.id ?? null;
    console.log(`Stripe ${a}: livemode=false (balance). Account ${acctIds[a] ?? "(id not readable)"}.`);
  }
  if (accounts.includes("mx")) {
    const d = checkDistinctAccounts(acctIds.us, acctIds.mx);
    if (!d.ok) die(d.reason);
  }

  const project = encodeURIComponent(env.VERCEL_PROJECT_ID);
  const vercelEnvs = (await vercel("GET", `/v10/projects/${project}/env`)).envs;
  const pickVar = (name) => {
    const p = pickVercelEntry(vercelEnvs, name);
    if (!p.ok) die(p.reason);
    return p.entry;
  };
  const endpointsBy = {};
  const endpointsOf = async (a) => (endpointsBy[a] ??= await stripeList(a, "/v1/webhook_endpoints"));

  const plans = [];
  for (const id of sel.steps) {
    if (id.startsWith("webhook:")) {
      const lc = laneConfig(id.slice("webhook:".length), baseUrl);
      if (!lc.ok) die(lc.reason);
      const entry = pickVar(lc.secretVar);
      const plan = planEndpoint({
        endpoints: await endpointsOf(lc.account),
        url: lc.url,
        otherUrl: lc.otherUrl,
        varExists: !!entry,
        recreate,
        kind: lc.kind,
      });
      plans.push({ id, kind: "webhook", lc, entry, plan, varName: lc.secretVar, target: `${lc.kind} endpoint -> ${lc.url}` });
    } else if (id.startsWith("portal:")) {
      const a = id.slice("portal:".length);
      const configs = await stripeList(a, "/v1/billing_portal/configurations");
      const prices = await stripeList(a, `/v1/prices?active=true&${lookupQuery(LOOKUP_KEYS)}`);
      const products = productsFromPrices(prices);
      const varName = PORTAL_VARS[a];
      plans.push({
        id,
        kind: "portal",
        account: a,
        products,
        entry: pickVar(varName),
        plan: planPortal({ configs, products, explicit }),
        varName,
        target: `billing portal configuration (${a})`,
      });
    } else if (id === "client-pro-price") {
      const prices = await stripeList("us", `/v1/prices?active=true&${lookupQuery([CLIENT_PRO.lookupKey])}`);
      plans.push({
        id,
        kind: "price",
        entry: pickVar(CLIENT_PRO.varName),
        plan: planClientProPrice({ prices, amountCents: amount.cents, explicit }),
        varName: CLIENT_PRO.varName,
        target: `price ${CLIENT_PRO.lookupKey} (monthly ${CLIENT_PRO.currency})`,
      });
    }
  }

  console.log("\nPlan:");
  for (const p of plans) {
    const varState = p.entry ? "exists" : "missing";
    const writesVar =
      p.plan.action === "skip" || p.plan.action === "refuse" || (p.kind === "webhook" && p.plan.action === "reuse")
        ? "not written"
        : p.entry
          ? "will be replaced"
          : "will be created";
    const head =
      p.plan.action === "skip" ? p.plan.reason : p.plan.action === "refuse" ? `refuse: ${p.plan.reason}` : p.plan.action;
    console.log(`[${p.id}] ${head} | ${p.target} | var ${p.varName} (${varState}, ${writesVar})`);
  }
  const manual = Object.entries(TEST_SIBLING_COVERAGE).filter(([, v]) => v.source === "manual").map(([k]) => k);
  console.log(`\nManual (PM/Oran, Stripe dashboard -> Vercel Preview): ${manual.join(", ")}.`);
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
    console.log(`  Stripe: deleted ${plan.endpointId} (made by this workflow).`);
  }
  const form = eventsForm();
  toForm(
    {
      url: lc.url,
      description: `Tulala staging (TEST), ${lane} lane. Managed by stripe-staging-webhook workflow.`,
      metadata: { managed_by: MANAGED_BY, lane },
      // Same version the app's client pins, so payloads match what the handler parses.
      api_version: STRIPE_API_VERSION,
      ...(lc.kind === "connect" ? { connect: true } : {}),
    },
    form,
  );
  const created = await stripe(lc.account, "POST", "/v1/webhook_endpoints", form);
  if (created.livemode !== false) die("created endpoint is not livemode=false");
  if (created.api_version !== STRIPE_API_VERSION) die(`created endpoint api_version ${created.api_version} != ${STRIPE_API_VERSION}`);
  console.log(`  Stripe: created ${created.id} (${lc.kind}, ${lc.events.length} events, api_version ${created.api_version}).`);
  if (!created.secret) die("Stripe returned no signing secret");
  await writeVar(entry, lc.secretVar, created.secret, "sensitive");
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
  await writeVar(entry, varName, configId, "encrypted");
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
  await writeVar(entry, varName, priceId, "encrypted");
}

async function main() {
  const plans = await planAll();
  const refused = plans.filter((p) => p.plan.action === "refuse");
  if (refused.length) die(`${refused.length} step(s) refused (${refused.map((p) => p.id).join(", ")}); nothing written`);
  if (dryRun) {
    console.log("DRY_RUN=yes: nothing written.");
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
