#!/usr/bin/env node
/**
 * Stripe TEST webhook endpoint for staging + its signing secret in Vercel
 * Preview (TUL-830). Run only by .github/workflows/stripe-staging-webhook.yml.
 *
 * Env: STRIPE_SECRET_KEY (test only), VERCEL_TOKEN, VERCEL_PROJECT_ID,
 * VERCEL_TEAM_ID, LANE (us|mx, default us), BASE_URL, RECREATE (yes|no),
 * DRY_RUN (yes|no). Refusals and planning live in lib/stripe-staging-webhook.mjs.
 *
 * Never prints a key or the signing secret. The secret goes from Stripe's
 * create response straight into the Vercel API body; in Actions it is also
 * masked first (`::add-mask::`).
 */
import {
  DEFAULT_BASE_URL,
  ENABLED_EVENTS,
  MANAGED_BY,
  STRIPE_API_VERSION,
  checkBalanceLivemode,
  checkTestKey,
  laneConfig,
  pickVercelEntry,
  planEndpoint,
} from "./lib/stripe-staging-webhook.mjs";

const env = process.env;
const die = (msg) => {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
};

const key = env.STRIPE_SECRET_KEY;
const keyOk = checkTestKey(key);
if (!keyOk.ok) die(keyOk.reason);
const lane = (env.LANE || "us").trim();
const lc = laneConfig(lane, env.BASE_URL || DEFAULT_BASE_URL);
if (!lc.ok) die(lc.reason);
const dryRun = env.DRY_RUN === "yes";
const recreate = env.RECREATE === "yes";
for (const n of ["VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"]) if (!env[n]) die(`${n} is not set`);

async function stripe(method, path, form) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? form.toString() : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Stripe ${method} ${path} -> ${res.status} ${body?.error?.type ?? ""} ${body?.error?.code ?? ""}`);
  return body;
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

async function writeSecret(entry, secret) {
  if (env.GITHUB_ACTIONS === "true") process.stdout.write(`::add-mask::${secret}\n`);
  const project = encodeURIComponent(env.VERCEL_PROJECT_ID);
  const payload = { value: secret, type: "sensitive", target: ["preview"] };
  if (entry) {
    await vercel("PATCH", `/v9/projects/${project}/env/${entry.id}`, payload);
    console.log(`Vercel: updated ${lc.secretVar} (Preview, all branches). Production untouched.`);
  } else {
    await vercel("POST", `/v10/projects/${project}/env`, { key: lc.secretVar, ...payload });
    console.log(`Vercel: created ${lc.secretVar} (Preview, all branches). Production untouched.`);
  }
}

function endpointForm() {
  const f = new URLSearchParams();
  ENABLED_EVENTS.forEach((e, i) => f.append(`enabled_events[${i}]`, e));
  return f;
}

async function main() {
  // 1. Test mode, asked of Stripe itself.
  const bal = await stripe("GET", "/v1/balance");
  const live = checkBalanceLivemode(bal);
  if (!live.ok) die(live.reason);
  const acct = await stripe("GET", "/v1/account").catch(() => null);
  console.log(`Stripe: livemode=false (balance). Account ${acct?.id ?? "(id not readable)"}.`);

  // 2. Existing endpoints (paged).
  const endpoints = [];
  let after = null;
  for (;;) {
    const page = await stripe("GET", `/v1/webhook_endpoints?limit=100${after ? `&starting_after=${after}` : ""}`);
    endpoints.push(...page.data);
    if (!page.has_more) break;
    after = page.data[page.data.length - 1].id;
  }
  console.log(`Stripe: ${endpoints.length} webhook endpoint(s) on this account.`);

  // 3. Vercel entry (names and scopes only).
  const project = encodeURIComponent(env.VERCEL_PROJECT_ID);
  const list = await vercel("GET", `/v10/projects/${project}/env`);
  const pick = pickVercelEntry(list.envs, lc.secretVar);
  if (!pick.ok) die(pick.reason);
  const varExists = !!pick.entry;
  console.log(`Vercel: ${lc.secretVar} preview-wide entry ${varExists ? "exists" : "missing"}.`);

  const plan = planEndpoint({ endpoints, url: lc.url, otherUrl: lc.otherUrl, varExists, recreate });
  console.log(`Plan: ${plan.action}${plan.endpointId ? ` (${plan.endpointId})` : ""} -> ${lc.url}`);
  if (plan.action === "refuse") die(plan.reason);
  if (dryRun) {
    console.log("DRY_RUN=yes: nothing written.");
    return;
  }

  if (plan.action === "reuse") {
    await stripe("POST", `/v1/webhook_endpoints/${plan.endpointId}`, endpointForm());
    console.log(`Stripe: enabled_events synced (${ENABLED_EVENTS.length}). Secret unchanged.`);
    return;
  }
  if (plan.action === "recreate") {
    await stripe("DELETE", `/v1/webhook_endpoints/${plan.endpointId}`);
    console.log(`Stripe: deleted ${plan.endpointId} (made by this workflow).`);
  }
  const form = endpointForm();
  form.append("url", lc.url);
  form.append("description", `Tulala staging (TEST), ${lane} lane. Managed by stripe-staging-webhook workflow.`);
  form.append("metadata[managed_by]", MANAGED_BY);
  form.append("metadata[lane]", lane);
  // Same version the app's client pins, so payloads match what the handler parses.
  form.append("api_version", STRIPE_API_VERSION);
  const created = await stripe("POST", "/v1/webhook_endpoints", form);
  if (created.livemode !== false) die("created endpoint is not livemode=false");
  if (created.api_version !== STRIPE_API_VERSION) die(`created endpoint api_version ${created.api_version} != ${STRIPE_API_VERSION}`);
  console.log(`Stripe: created ${created.id} (${ENABLED_EVENTS.length} events, api_version ${created.api_version}).`);
  if (!created.secret) die("Stripe returned no signing secret");
  await writeSecret(pick.entry, created.secret);
  console.log("Done. Takes effect on the next staging build (no build fired here).");
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
