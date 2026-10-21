/**
 * Stripe TEST step for the Stage 2 seed (a SEPARATE `--stripe` step, never part of --selftest):
 *   T1     an Express TEST Connect account for the MX restaurant, on the MX platform  -> agencies.stripe_account_id / stripe_account_platform ('mx')
 *   T4     an Express TEST Connect account for the US salon, on the US platform       -> agencies.stripe_account_id / stripe_account_platform ('us')
 *   CLOCKS two Stripe test clocks (trial and downgrade cases); ids are printed, nothing is stored in the database
 * Test-mode proof, both required before any call (same as #4048's S6): the key starts with sk_test_ AND GET /v1/balance reports
 * livemode=false. Every object is tagged metadata.seed and looked up before it is created (idempotency keys last only 24 h).
 * No key, account id secret or credential is ever printed; account and clock ids are test-object ids, not secrets.
 */
import { checkBalanceLivemode, openTestStripe } from "./failed-cards-stripe.mjs";
import { s2Id } from "./stage2-guards.mjs";

export { checkBalanceLivemode, openTestStripe };

export const S2_SEED_TAG = "s2-stage2-fixtures";
export const STRIPE_STEPS = ["T1", "T4", "CLOCKS"];
export const CONNECT = {
  T1: { country: "MX", platform: "mx", workspaceKey: "workspace:t1", label: "T1 (MX restaurant)" },
  T4: { country: "US", platform: "us", workspaceKey: "workspace:t4", label: "T4 (US salon)" },
};
export const CLOCKS = [
  { key: "trial", name: `${S2_SEED_TAG} trial clock` },
  { key: "downgrade", name: `${S2_SEED_TAG} downgrade clock` },
];

/** Pure: refuse unless the Stripe CLI args name known steps. */
export function checkStripeSteps(steps) {
  const bad = steps.filter((s) => !STRIPE_STEPS.includes(s));
  return bad.length ? { ok: false, reason: `unknown --stripe step ${bad.join(",")} (known: ${STRIPE_STEPS.join(",")})` } : { ok: true };
}

/** Pure: what each step would do, given what already exists (dry run / write list). */
export function describeS2Stripe(steps, have) {
  const lines = [];
  for (const s of steps) {
    if (s === "T1" || s === "T4") {
      const c = CONNECT[s];
      const usable = c.platform === "mx" ? have.mxKey : have.usKey;
      lines.push(usable ? `${have.accounts?.[s] ? "reuse " : "create"} Express TEST account ${c.country} on the ${c.platform.toUpperCase()} platform for ${c.label}; set agencies.stripe_account_id / stripe_account_platform on the seed's own workspace row` : `SKIP ${s}: no ${c.platform.toUpperCase()} TEST key (${c.platform === "mx" ? "--stripe-mx-key-file or STRIPE_MX_SECRET_KEY_TEST" : "--stripe-key-file or STRIPE_SECRET_KEY"})`);
    }
    if (s === "CLOCKS") for (const k of CLOCKS) lines.push(`${have.clocks?.[k.key] ? "reuse " : "create"} test clock "${k.name}" (frozen at now)`);
  }
  return lines;
}

/**
 * stripes = { us, mx } (each already passed openTestStripe). deps = { q, updateOwned, log }.
 * Connect accounts are looked up by metadata first; the workspace row is only written when the column is empty.
 */
export async function runS2Stripe(steps, stripes, { q, updateOwned, log }) {
  for (const s of steps.filter((x) => x === "T1" || x === "T4")) {
    const c = CONNECT[s];
    const wsId = s2Id(c.workspaceKey);
    const cur = (await q("select stripe_account_id from public.agencies where id = $1", [wsId])).rows[0];
    if (!cur) { log(`${s}: workspace ${c.label} missing (apply the DB seed first)`); continue; }
    if (cur.stripe_account_id) { log(`${s}: ${cur.stripe_account_id} (already set)`); continue; }
    const stripe = c.platform === "mx" ? stripes.mx : stripes.us;
    if (!stripe) { log(`${s}: SKIPPED (no ${c.platform.toUpperCase()} TEST key)`); continue; }
    const listed = await stripe.accounts.list({ limit: 100 });
    let acct = listed.data.find((a) => a.metadata?.seed === S2_SEED_TAG && a.metadata?.workspace_id === wsId);
    if (!acct) {
      acct = await stripe.accounts.create({
        type: "express", country: c.country, business_type: "company",
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
        metadata: { account_type: "workspace", workspace_id: wsId, seed: S2_SEED_TAG },
      }, { idempotencyKey: `${S2_SEED_TAG}_connect_${s}` });
    }
    await updateOwned("public.agencies", wsId, { stripe_account_id: acct.id, stripe_account_platform: c.platform });
    log(`${s}: Express TEST account ${acct.id} on the ${c.platform} platform`);
  }
  if (steps.includes("CLOCKS")) {
    const stripe = stripes.us ?? stripes.mx;
    if (!stripe) { log("CLOCKS: SKIPPED (no TEST key)"); return; }
    const existing = (await stripe.testHelpers.testClocks.list({ limit: 100 })).data;
    for (const k of CLOCKS) {
      const found = existing.find((t) => t.name === k.name);
      const clock = found ?? (await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: k.name }));
      log(`CLOCKS ${k.key}: ${clock.id} (${found ? "reused" : "created"}, frozen_time ${clock.frozen_time})`);
    }
  }
}
