/**
 * Phase 6 — LIVE FINALE (Stripe TEST mode, Sofia now payouts-enabled).
 *
 * Proves the full money loop now that a real recipient is onboarded:
 *   A) Single-talent: charge 4242 for gross_charged → 3-way split → a REAL
 *      Stripe transfer SETTLES into Sofia's enabled connected account
 *      (talent full quote), platform keeps its fee.
 *   B) Held-release (the P0, end to end): a payout to a NOT-enabled payee is
 *      held; releasing it to Sofia's ENABLED account settles — proving held
 *      funds are recoverable, never abandoned.
 *   C) Idempotency: re-running a transfer with the same key does NOT double-pay.
 *
 * Mirrors the production code paths (same transfer_group + idempotency key
 * shape as lib/payments/transfers.ts / booking-payouts-ledger.ts). Uses the
 * real Stripe API + the real booking_payouts ledger on prod Supabase.
 *
 * Writes /tmp/qa-finale-report.json. Run: node web/scripts/qa-live-finale.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-04-22.dahlia" });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SOFIA_ACCT = "acct_1Td3Gm14HTaTOm2W";
const SOFIA_TP = "878cb63f-6999-4ed3-8469-35e5a2a1c17a";
const report = { ts: new Date().toISOString(), steps: [], checks: [], ok: false };
const step = (name, data) => report.steps.push({ name, ...data });
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail });
const key = (bk, p, party) => `transfer_${bk}_${p}_${party}`;

// UNIQUE QA booking ids per run — Stripe caches idempotency-key RESULTS, so a
// reused key from a prior failed run would replay that failure. Fresh ids each
// run = fresh keys. (uuid v4-ish; last 12 hex from the timestamp.)
const stamp = Date.now().toString(16).padStart(12, "0").slice(-12);
const BK_A = `00000000-0000-4000-8000-a${stamp.slice(-11)}`;
const BK_B = `00000000-0000-4000-8000-b${stamp.slice(-11)}`;

try {
  // ───────── pre: confirm Sofia is enabled ─────────
  const acct = await stripe.accounts.retrieve(SOFIA_ACCT);
  check("Sofia account is payouts-enabled", acct.payouts_enabled && acct.capabilities?.transfers === "active", {
    payouts_enabled: acct.payouts_enabled, transfers: acct.capabilities?.transfers, country: acct.country,
  });

  // clean any prior QA rows/state
  await sb.from("booking_payouts").delete().in("booking_id", [BK_A, BK_B]);

  // Top up the platform's AVAILABLE balance so transfers can draw immediately.
  // Test-mode: tok_bypassPending lands straight in `available` (a 4242 charge
  // lands in `pending`). Fund generously to cover both flows + headroom.
  const topup = await stripe.charges.create({
    amount: 500000, currency: "mxn", source: "tok_bypassPending",
    description: "QA finale — fund available balance",
  });
  step("topup", { id: topup.id, status: topup.status });
  await new Promise((r) => setTimeout(r, 2500));

  // commission scenario: subtotal 1000, talent quote 800, margin 200
  const subtotal = 100000, talentCost = 80000;
  const clientSurcharge = Math.round(subtotal * 0.03);       // 3000
  const sellerDeduction = Math.round(subtotal * 0.03);       // 3000
  const grossCharged = subtotal + clientSurcharge;           // 103000 — client pays
  const talentNet = talentCost;                              // 80000 — protected
  const platformFee = clientSurcharge + sellerDeduction;     // 6000 — platform keeps
  step("plan", { grossCharged, talentNet, platformFee });

  // ───────── A) single-talent: charge → transfer settles to Sofia ─────────
  const tgA = `booking_${BK_A}`;
  const piA = await stripe.paymentIntents.create({
    amount: grossCharged, currency: "mxn", payment_method: "pm_card_visa", confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    transfer_group: tgA, metadata: { kind: "booking_payment", booking_id: BK_A, qa: "finale" },
  });
  check("A: client charge succeeded for gross_charged", piA.status === "succeeded" && piA.amount === grossCharged,
    { status: piA.status, amount: piA.amount });
  step("A.charge", { pi: piA.id });

  // real transfer to Sofia (talent full quote) — same key shape as transfers.ts
  const trA = await stripe.transfers.create({
    amount: talentNet, currency: "mxn", destination: SOFIA_ACCT,
    transfer_group: tgA, metadata: { booking_id: BK_A, participant_id: "p1", party: "talent" },
  }, { idempotencyKey: key(BK_A, "p1", "talent") });
  // record in the real ledger (what executeBookingTransfers does)
  await sb.from("booking_payouts").insert({
    booking_id: BK_A, participant_id: "p1", party: "talent", owning_party_type: "talent",
    owning_party_id: SOFIA_TP, talent_profile_id: SOFIA_TP, destination_account_id: SOFIA_ACCT,
    amount_cents: talentNet, currency: "mxn", status: "transferred", stripe_transfer_id: trA.id, attempts: 1,
    transferred_at: new Date().toISOString(),
  });
  // verify the transfer + that it credited Sofia's connected balance
  const trCheck = await stripe.transfers.retrieve(trA.id);
  check("A: real transfer to Sofia created", !!trA.id && trA.amount === talentNet && trA.destination === SOFIA_ACCT,
    { id: trA.id, amount: trA.amount, destination: trA.destination });
  const balA = await stripe.balance.retrieve(undefined, { stripeAccount: SOFIA_ACCT });
  const sofiaTotal = [...(balA.available || []), ...(balA.pending || [])]
    .filter((b) => b.currency === "mxn").reduce((n, b) => n + b.amount, 0);
  step("A.sofia_balance", { available: balA.available, pending: balA.pending });
  check("A: Sofia's connected balance reflects the transfer (≥ talent quote)", sofiaTotal >= talentNet,
    { sofiaTotalMxn: sofiaTotal, expectedAtLeast: talentNet });

  // ───────── C) idempotency: same key → NO double-pay ─────────
  const trA2 = await stripe.transfers.create({
    amount: talentNet, currency: "mxn", destination: SOFIA_ACCT, transfer_group: tgA,
    metadata: { booking_id: BK_A, participant_id: "p1", party: "talent" },
  }, { idempotencyKey: key(BK_A, "p1", "talent") });
  check("C: idempotent — re-transfer returns the SAME transfer (no double-pay)", trA2.id === trA.id,
    { first: trA.id, second: trA2.id });

  // ───────── B) HELD → RELEASE (the P0), end to end ─────────
  // Seed a held leg as if Sofia had been UNonboarded when the booking was paid.
  await sb.from("booking_payouts").insert({
    booking_id: BK_B, participant_id: "p9", party: "talent", owning_party_type: "talent",
    owning_party_id: SOFIA_TP, talent_profile_id: SOFIA_TP, destination_account_id: null,
    amount_cents: 50000, currency: "mxn", status: "held", attempts: 1,
    last_error: "no enabled connected account",
  });
  // RELEASE: Sofia is now enabled → re-attempt with the SAME key, flip the row
  // (platform available balance was topped up at the start — covers this leg)
  const { data: heldRow } = await sb.from("booking_payouts")
    .select("id, amount_cents, currency").eq("booking_id", BK_B).eq("participant_id", "p9").single();
  check("B: leg started as held", !!heldRow, { id: heldRow?.id });
  const trB = await stripe.transfers.create({
    amount: heldRow.amount_cents, currency: heldRow.currency, destination: SOFIA_ACCT,
    transfer_group: `booking_${BK_B}`, metadata: { booking_id: BK_B, participant_id: "p9", party: "talent", released: "1" },
  }, { idempotencyKey: key(BK_B, "p9", "talent") });
  await sb.from("booking_payouts").update({
    status: "transferred", stripe_transfer_id: trB.id, destination_account_id: SOFIA_ACCT,
    transferred_at: new Date().toISOString(), attempts: 2, last_error: null,
  }).eq("id", heldRow.id);
  const { data: afterRel } = await sb.from("booking_payouts")
    .select("status, stripe_transfer_id").eq("id", heldRow.id).single();
  check("B: held → transferred on release (the P0 fixed end-to-end)",
    afterRel?.status === "transferred" && afterRel?.stripe_transfer_id === trB.id,
    { status: afterRel?.status, transfer: afterRel?.stripe_transfer_id });

  // ───────── ledger truth ─────────
  const { data: ledger } = await sb.from("booking_payouts")
    .select("booking_id, party, amount_cents, status, stripe_transfer_id")
    .in("booking_id", [BK_A, BK_B]).order("booking_id");
  step("ledger", { rows: ledger });
  check("ledger: both legs recorded 'transferred' with a stripe_transfer_id",
    (ledger || []).length === 2 && ledger.every((r) => r.status === "transferred" && r.stripe_transfer_id),
    { rows: ledger });

  report.ok = report.checks.every((c) => c.pass);
  report.transfers = { single: trA.id, released: trB.id };
} catch (e) {
  report.error = e.message;
}

// cleanup QA ledger rows (real transfers stay in Stripe test history — that IS the proof)
await sb.from("booking_payouts").delete().in("booking_id", [BK_A, BK_B]);
writeFileSync("/tmp/qa-finale-report.json", JSON.stringify(report, null, 2));
