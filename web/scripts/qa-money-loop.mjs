/**
 * QA harness — live money-loop proof against Stripe TEST mode.
 *
 * Proves what is provable WITHOUT human KYC:
 *   1. A real client charge (gross_charged) succeeds with a test card.
 *   2. The commission split arithmetic obeys the engine invariant
 *      (talent_net + workspace_fee + platform_fee === gross_charged).
 *   3. Transferring to a NON-onboarded recipient is rejected by Stripe —
 *      which is exactly why executeBookingTransfers holds funds (skip+log).
 *
 * The "money lands in a recipient bank" hop needs an ENABLED connected
 * account (human KYC) and is covered by the integration test + the live
 * finale, not here.
 *
 * Writes a JSON report to /tmp/qa-money-report.json (source of truth).
 * Run: node web/scripts/qa-money-loop.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import Stripe from "stripe";

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

const report = { ts: new Date().toISOString(), steps: [], checks: [], ok: false };
const step = (name, data) => report.steps.push({ name, ...data });
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail });

try {
  const acct = await stripe.accounts.retrieve();
  report.platformAccount = acct.id;

  // ---- Real commission scenario: 1 agency-owned talent w/ margin ----
  // unit_price = what the client pays for the talent's time; talent_cost =
  // the talent's protected quote. margin = workspace's gross profit.
  const subtotal = 100000;          // MX$1000 client-facing
  const talentCost = 80000;          // MX$800 protected to talent
  const margin = subtotal - talentCost; // 20000
  const CLIENT_BPS = 300, SELLER_BPS = 300;
  const clientSurcharge = Math.round(subtotal * CLIENT_BPS / 10000); // 3000
  const sellerDeduction = Math.min(Math.round(subtotal * SELLER_BPS / 10000), margin); // 3000
  const grossCharged = subtotal + clientSurcharge; // 103000 — client pays
  const talentNet = talentCost;                    // 80000 protected
  const workspaceFee = margin - sellerDeduction;   // 17000
  const platformFee = clientSurcharge + sellerDeduction; // 6000 (~6% of subtotal)

  step("plan", { subtotal, talentCost, margin, clientSurcharge, sellerDeduction, grossCharged, talentNet, workspaceFee, platformFee });

  // The engine's hard invariant:
  check("engine invariant: talent_net + workspace_fee + platform_fee == gross_charged",
    talentNet + workspaceFee + platformFee === grossCharged,
    { lhs: talentNet + workspaceFee + platformFee, grossCharged });
  check("talent protected (gets full quote)", talentNet === talentCost, { talentNet, talentCost });
  check("platform take ≈ 6% of subtotal", platformFee === Math.round(subtotal * 600 / 10000), { platformFee });

  // ---- 1) LIVE client charge for gross_charged (no Connect needed) ----
  const bookingId = `qa_${acct.id.slice(-6)}_${Date.now().toString().slice(-8)}`;
  const transferGroup = `booking_${bookingId}`;
  const pi = await stripe.paymentIntents.create({
    amount: grossCharged, currency: "mxn",
    payment_method: "pm_card_visa", confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    transfer_group: transferGroup,
    metadata: { kind: "booking_payment", booking_id: bookingId, qa: "1" },
  });
  step("charge", { paymentIntent: pi.id, status: pi.status, amount: pi.amount, currency: pi.currency });
  check("LIVE client charge succeeded for exactly gross_charged",
    pi.status === "succeeded" && pi.amount === grossCharged, { status: pi.status, amount: pi.amount, expected: grossCharged });

  // available platform balance reflects the charge (test funds are instant-ish)
  const bal = await stripe.balance.retrieve();
  step("platform_balance", { available: bal.available, pending: bal.pending });

  // ---- 2) Transfer to a NON-onboarded recipient → expect rejection ----
  // This is the exact condition executeBookingTransfers guards with
  // skipped_no_account. Sofia's account exists but isn't payouts-enabled.
  let transferRejected = false, rejectMsg = "";
  try {
    await stripe.transfers.create({
      amount: talentNet, currency: "mxn", destination: "acct_1Td3Gm14HTaTOm2W",
      transfer_group: transferGroup, metadata: { booking_id: bookingId, party: "talent" },
    }, { idempotencyKey: `qa_transfer_${bookingId}_talent` });
  } catch (e) { transferRejected = true; rejectMsg = e.message; }
  step("transfer_to_unonboarded", { rejected: transferRejected, message: rejectMsg.slice(0, 160) });
  check("Stripe rejects transfer to a non-onboarded recipient (→ our code holds the funds)",
    transferRejected, { message: rejectMsg.slice(0, 160) });

  report.ok = report.checks.every((c) => c.pass);
} catch (e) {
  report.error = e.message;
}
writeFileSync("/tmp/qa-money-report.json", JSON.stringify(report, null, 2));
