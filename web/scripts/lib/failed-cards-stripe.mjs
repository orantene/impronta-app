/**
 * Stripe TEST steps for scripts/seed-failed-cards-fixtures.mts (S2 coupons, S3 workspace subscription,
 * S4 portal config + paid invoices on T1, S6 Connect TEST accounts). Each step looks objects up before
 * creating them (idempotency keys last only 24h), tags them metadata.seed, and never prints a key.
 *
 * Test-mode proof, both required before any call: the key starts with sk_test_ (checkStripeKey) AND
 * GET /v1/balance reports livemode=false. (GET /v1/account has no livemode field, so it is not used.)
 */
import { PREFIX, planLookupKey, stableId } from "./group6-fixtures.mjs";
import { fcId } from "./failed-cards-guards.mjs";
import { PAYOUT_COUNTRIES } from "./failed-cards-plan-sites.mjs";

export const SEED_TAG = `${PREFIX}-failed-cards`;
export const QA20_CODE = "QA20";
export const QA20_COUPON_ID = "tulala_test_20pct_3m";
export const STUDIO_LOOKUP = planLookupKey("studio", "month");

/** Pure: refuse unless /v1/balance said livemode === false. */
export function checkBalanceLivemode(balance) {
  if (!balance || balance.livemode !== false) return { ok: false, reason: "GET /v1/balance did not report livemode=false; refusing" };
  return { ok: true };
}

export async function openTestStripe(Stripe, key) {
  const stripe = new Stripe(key);
  const live = checkBalanceLivemode(await stripe.balance.retrieve());
  if (!live.ok) throw new Error(live.reason);
  return stripe;
}

/** Pure: what each requested step would create, given what already exists (dry run / write list). */
export function describeStripeSteps(steps, have) {
  const lines = [];
  if (steps.includes("S2")) {
    lines.push(`${have.coupon ? "reuse " : "create"} coupon ${QA20_COUPON_ID} (20% x 3 months, from seed-stripe-test-coupons.mjs)`);
    lines.push(`${have.qa20 ? "reuse " : "create"} promotion code ${QA20_CODE} on ${QA20_COUPON_ID}`);
  }
  if (steps.includes("S3")) {
    lines.push(have.studioPrice ? `${have.wsSub ? "reuse " : "create"} customer + subscription on ${STUDIO_LOOKUP} for workspace qa-fixture-g6-studio; +1 public.workspace_subscriptions row` : `BLOCKED S3: TEST price ${STUDIO_LOOKUP} missing (run seed-stripe-test-prices.mjs)`);
  }
  if (steps.includes("S4")) {
    lines.push(`${have.portal ? "reuse " : "create"} billing portal configuration (seed-stripe-portal-config.mjs body)`);
    lines.push(have.t1Sub ? `ensure >= 1 paid invoice on T1's TEST subscription (pays an open one if none is paid)` : "BLOCKED S4 invoices: T1 has no TEST subscription row (run the Group-6 seed with --stripe)");
  }
  if (steps.includes("S6")) {
    for (const c of PAYOUT_COUNTRIES) {
      const usable = c.platform === "mx" ? have.mxKey : true;
      lines.push(usable ? `${have.accounts?.[c.iso] ? "reuse " : "create"} Express TEST account ${c.iso} on the ${c.platform.toUpperCase()} platform; set talent_profiles.stripe_account_id on ${c.code}` : `SKIP S6 ${c.iso}: no MX TEST key (--stripe-mx-key-file or STRIPE_MX_SECRET_KEY_TEST)`);
    }
  }
  return lines;
}

export async function stepS2(stripe, PLANNED_COUPONS, log) {
  const spec = PLANNED_COUPONS.find((c) => c.id === QA20_COUPON_ID);
  let coupon = await stripe.coupons.retrieve(spec.id).catch(() => null);
  if (!coupon) {
    coupon = await stripe.coupons.create({ id: spec.id, name: spec.name, percent_off: spec.percent_off, duration: spec.duration, duration_in_months: spec.duration_in_months, metadata: { source: "seed-stripe-test-coupons" } });
  }
  const found = await stripe.promotionCodes.list({ code: QA20_CODE, limit: 1 });
  const promo = found.data[0] ?? (await stripe.promotionCodes.create({ promotion: { type: "coupon", coupon: coupon.id }, code: QA20_CODE, metadata: { seed: SEED_TAG } }));
  log(`S2 coupon ${coupon.id}, promotion code ${QA20_CODE} -> ${promo.id}`);
}

export async function stepS3(stripe, { q, studioId, insertRow, log }) {
  const sid = fcId("s3:workspace_subscription");
  if ((await q("select 1 from public.workspace_subscriptions where tenant_id = $1", [studioId])).rowCount) return log("S3 workspace subscription row already present: nothing to do");
  const price = (await stripe.prices.list({ lookup_keys: [STUDIO_LOOKUP], limit: 1 })).data[0];
  if (!price) throw new Error(`S3: TEST price ${STUDIO_LOOKUP} missing`);
  const found = await stripe.customers.search({ query: `metadata['seed']:'${SEED_TAG}' AND metadata['fixture_key']:'s3-studio'`, limit: 1 });
  let customer = found.data[0];
  if (!customer) customer = await stripe.customers.create({ email: `${PREFIX}-studio-owner@impronta.test`, name: "qa-fixture Studio", payment_method: "pm_card_visa", metadata: { seed: SEED_TAG, fixture_key: "s3-studio" } }, { idempotencyKey: `${SEED_TAG}_s3_customer` });
  const pms = await stripe.paymentMethods.list({ customer: customer.id, type: "card", limit: 1 });
  if (pms.data[0]) await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pms.data[0].id } });
  const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
  let sub = subs.data.find((s) => s.metadata?.seed === SEED_TAG && s.status !== "canceled");
  if (!sub) sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: price.id }], metadata: { seed: SEED_TAG, fixture_key: "s3-studio", tenant_id: studioId } }, { idempotencyKey: `${SEED_TAG}_s3_subscription` });
  const end = sub.items?.data?.[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 2592000;
  await insertRow("public.workspace_subscriptions", { id: sid, tenant_id: studioId, stripe_subscription_id: sub.id, stripe_customer_id: customer.id, plan_key: "studio", status: sub.status === "active" || sub.status === "trialing" ? sub.status : "incomplete", current_period_end: new Date(end * 1000).toISOString(), stripe_price_id: price.id });
  log(`S3 customer ${customer.id}, subscription ${sub.id} (${sub.status}) on ${STUDIO_LOOKUP}`);
}

export async function stepS4(stripe, { q, buildPortalConfiguration, PORTAL_SEED_TAG, LOOKUP_KEYS, log }) {
  const existing = (await stripe.billingPortal.configurations.list({ limit: 100 })).data.find((c) => c.metadata?.tulala_seed === PORTAL_SEED_TAG);
  if (existing) log(`S4 portal configuration ${existing.id} (exists)`);
  else {
    const prices = await stripe.prices.list({ lookup_keys: LOOKUP_KEYS, active: true, limit: 100 });
    const byProduct = new Map();
    for (const p of prices.data) {
      const prod = typeof p.product === "string" ? p.product : p.product.id;
      byProduct.set(prod, [...(byProduct.get(prod) ?? []), p.id]);
    }
    const c = await stripe.billingPortal.configurations.create(buildPortalConfiguration([...byProduct].map(([product, ids]) => ({ product, prices: ids }))));
    log(`S4 portal configuration ${c.id} (created)`);
  }
  const row = (await q("select stripe_subscription_id from public.talent_subscriptions where id = $1", [stableId("talent_subscription")])).rows[0];
  if (!row?.stripe_subscription_id) return log("S4 invoices BLOCKED: T1 has no TEST subscription row");
  const paid = await stripe.invoices.list({ subscription: row.stripe_subscription_id, status: "paid", limit: 10 });
  if (paid.data.length) return log(`S4 T1 subscription has ${paid.data.length} paid invoice(s): nothing to do`);
  const open = await stripe.invoices.list({ subscription: row.stripe_subscription_id, status: "open", limit: 1 });
  if (!open.data[0]) return log("S4 T1 subscription has no paid and no open invoice: nothing to pay");
  const inv = await stripe.invoices.pay(open.data[0].id);
  log(`S4 paid invoice ${inv.id} (${inv.status})`);
}

export async function stepS6(stripes, { q, updateOwned, log }) {
  for (const c of PAYOUT_COUNTRIES) {
    const tid = fcId(`talent:s6-${c.iso.toLowerCase()}`);
    const cur = (await q("select stripe_account_id from public.talent_profiles where id = $1", [tid])).rows[0];
    if (!cur) { log(`S6 ${c.iso}: payout talent ${c.code} missing (run the DB seed with S6 first)`); continue; }
    if (cur.stripe_account_id) { log(`S6 ${c.iso}: ${cur.stripe_account_id} (already set)`); continue; }
    const stripe = c.platform === "mx" ? stripes.mx : stripes.us;
    if (!stripe) { log(`S6 ${c.iso}: SKIPPED (no ${c.platform.toUpperCase()} TEST key)`); continue; }
    const listed = await stripe.accounts.list({ limit: 100 });
    let acct = listed.data.find((a) => a.metadata?.seed === SEED_TAG && a.metadata?.talent_profile_id === tid);
    if (!acct) {
      acct = await stripe.accounts.create({
        type: "express", country: c.iso, business_type: "individual",
        capabilities: { transfers: { requested: true }, ...(c.platform === "mx" ? { card_payments: { requested: true } } : {}) },
        metadata: { account_type: "talent", talent_profile_id: tid, seed: SEED_TAG },
      }, { idempotencyKey: `${SEED_TAG}_s6_${c.iso}` });
    }
    await updateOwned("public.talent_profiles", tid, { stripe_account_id: acct.id, ...(c.platform === "mx" ? { stripe_account_platform: "mx" } : {}) });
    log(`S6 ${c.iso}: Express TEST account ${acct.id} on ${c.platform}`);
  }
}
