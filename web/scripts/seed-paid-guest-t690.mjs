#!/usr/bin/env node
/**
 * TUL-690 staging seed: a guest client with ONE PAID booking, paid through a
 * real Stripe TEST-mode PaymentIntent (pm_card_visa only), so QA can walk
 *   guest booked and paid -> signs in by email link -> claim + activate -> /client history.
 *
 * STAGING ONLY. Refuses to run unless the Supabase URL is the staging project
 * (fxlankepwnvelxjrahwk) and the Stripe key starts with sk_test_. Keys are
 * never printed. Idempotent (fixed row ids + Stripe idempotency key).
 *
 * The guest has NO auth user on purpose: the QA step "signs in by email link"
 * creates it, and claimEverythingForVerifiedEmail then attaches these rows by
 * email (owner columns NULL, email = the verified one).
 *
 * Rows written (all ids deterministic, printed on success):
 *   customers             guest identity in the tenant (email, user_id NULL)
 *   agency_bookings       confirmed booking, contact_email = guest, payment_status paid
 *   booking_transactions  provider stripe, status paid, payer_email = guest,
 *                         provider_metadata.payment_intent_id = the real test PI
 * Stripe (test mode): one PaymentIntent, metadata.transaction_id = the txn id,
 * confirmed with pm_card_visa. It cannot be deleted; --rollback prints its id.
 *
 * This writes the rows markPaid would leave behind; it does not run markPaid
 * itself, so it sends no emails, creates no chat cards and fans out no talent
 * transfers (the money-lane code is untouched).
 *
 * Usage (from web/, env from the staging env file, never the prod one):
 *   node --env-file=.env.staging scripts/seed-paid-guest-t690.mjs --dry-run
 *   node --env-file=.env.staging scripts/seed-paid-guest-t690.mjs
 *   node --env-file=.env.staging scripts/seed-paid-guest-t690.mjs --rollback
 * Options: --tenant-id <uuid> (default qa-journeys tenant) --amount-cents N --currency usd
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import {
  GUEST_EMAIL,
  SEED_TAG,
  TEST_PAYMENT_METHOD,
  checkTarget,
  parseArgs,
  seedIds,
  splitAmounts,
} from "./lib/paid-guest-seed.mjs";

const USAGE = "usage: seed-paid-guest-t690.mjs [--dry-run | --rollback] [--tenant-id <uuid>] [--amount-cents N] [--currency usd]";

function fail(msg, code = 1) {
  console.error(`[t690-seed] ${msg}`);
  process.exit(code);
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) fail(`${label}: ${error.message}`);
  return data;
}

async function rollback(sb, ids) {
  const txn = await must(
    "read transaction",
    sb.from("booking_transactions").select("id, payer_email, provider_metadata").eq("id", ids.transactionId).maybeSingle(),
  );
  const booking = await must(
    "read booking",
    sb.from("agency_bookings").select("id, contact_email").eq("id", ids.bookingId).maybeSingle(),
  );
  const customer = await must(
    "read customer",
    sb.from("customers").select("id, email").eq("id", ids.customerId).maybeSingle(),
  );
  // Belt and braces: only ever delete a row whose email is the seed guest.
  const same = (v) => String(v ?? "").toLowerCase() === GUEST_EMAIL;
  if ((txn && !same(txn.payer_email)) || (booking && !same(booking.contact_email)) || (customer && !same(customer.email))) {
    fail("a seed id exists but its email is not the seed guest; refusing to delete");
  }
  if (txn) await must("delete transaction", sb.from("booking_transactions").delete().eq("id", ids.transactionId));
  if (booking) await must("delete booking", sb.from("agency_bookings").delete().eq("id", ids.bookingId));
  if (customer) await must("delete customer", sb.from("customers").delete().eq("id", ids.customerId));
  console.log(`[t690-seed] rolled back: transaction=${txn ? "deleted" : "absent"} booking=${booking ? "deleted" : "absent"} customer=${customer ? "deleted" : "absent"}`);
  const pi = txn?.provider_metadata?.payment_intent_id;
  if (pi) console.log(`[t690-seed] Stripe test PaymentIntent ${pi} remains in the Stripe sandbox (cannot be deleted). The auth user created at sign-in is not touched.`);
}

async function seed(sb, stripe, args, ids) {
  const tenant = await must("read tenant", sb.from("agencies").select("id").eq("id", args.tenantId).maybeSingle());
  if (!tenant) fail(`tenant ${args.tenantId} not found on staging; pass --tenant-id of a staging agency`);

  const existing = await must(
    "read transaction",
    sb.from("booking_transactions").select("id, status, provider_metadata").eq("id", ids.transactionId).maybeSingle(),
  );
  if (existing?.status === "paid") {
    console.log("[t690-seed] already seeded and paid; nothing to do.");
    return report(ids, existing.provider_metadata?.payment_intent_id ?? null, args);
  }

  const dupe = await must(
    "check customer email",
    sb.from("customers").select("id").eq("tenant_id", args.tenantId).eq("email", GUEST_EMAIL).neq("id", ids.customerId).limit(1),
  );
  if (dupe?.length) fail(`tenant already has a different customer for ${GUEST_EMAIL} (${dupe[0].id}); remove it first so the claim step is unambiguous`);

  const money = splitAmounts(args.amountCents);
  const now = new Date().toISOString();

  await must(
    "upsert customer",
    sb.from("customers").upsert(
      { id: ids.customerId, tenant_id: args.tenantId, email: GUEST_EMAIL, display_name: "QA Paid Guest 690", user_id: null, locale: "en" },
      { onConflict: "id" },
    ),
  );
  await must(
    "upsert booking",
    sb.from("agency_bookings").upsert(
      {
        id: ids.bookingId,
        tenant_id: args.tenantId,
        source_inquiry_id: null,
        customer_id: ids.customerId,
        title: `QA paid guest booking (${SEED_TAG})`,
        status: "confirmed",
        payment_status: "unpaid",
        currency_code: args.currency.toUpperCase(),
        // Major units, same convention as seed-talent-agenda-qa.mjs.
        total_client_revenue: args.amountCents / 100,
        contact_name: "QA Paid Guest 690",
        contact_email: GUEST_EMAIL,
        source_type_snapshot: "manual",
        internal_notes: `${SEED_TAG}: staging fixture for TUL-690, safe to delete via --rollback`,
      },
      { onConflict: "id" },
    ),
  );
  await must(
    "insert transaction (draft)",
    sb.from("booking_transactions").upsert(
      {
        id: ids.transactionId,
        booking_id: ids.bookingId,
        source_tenant_id: args.tenantId,
        source_inquiry_id: null,
        payer_user_id: null,
        payer_email: GUEST_EMAIL,
        gross_amount_cents: money.grossCents,
        platform_fee_basis_points: money.feeBps,
        platform_fee_cents: money.feeCents,
        net_amount_cents: money.netCents,
        currency: args.currency.toUpperCase(),
        provider: "stripe",
        status: "draft",
        checkout_type: "full",
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
  );
  // The DB only accepts new rows as draft; move draft -> payment_requested.
  await must(
    "request transaction payment",
    sb.from("booking_transactions").update({
      status: "payment_requested",
      requested_at: now,
      // On-platform transactions need a payout receiver before payment is
      // requested. Default: the QA Journeys talent fixture (staging only).
      payout_receiver_kind: process.env.T690_PAYOUT_RECEIVER_KIND ?? "talent",
      payout_receiver_id: process.env.T690_PAYOUT_RECEIVER_ID ?? "5b42df02-40e2-43ae-85ca-9ccfde3f2a61",
      payout_receiver_display_name: process.env.T690_PAYOUT_RECEIVER_NAME ?? "QA Journeys Talent (paid-run fixture)",
    }).eq("id", ids.transactionId).eq("status", "draft"),
  );

  // The real Stripe TEST charge. Idempotency key at the txn grain: a re-run
  // returns the same PaymentIntent instead of charging twice.
  const intent = await stripe.paymentIntents.create(
    {
      amount: money.grossCents,
      currency: args.currency,
      payment_method: TEST_PAYMENT_METHOD,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: `${SEED_TAG} guest booking payment`,
      metadata: { transaction_id: ids.transactionId, booking_id: ids.bookingId, seed: SEED_TAG },
    },
    { idempotencyKey: `${SEED_TAG}_pi_${ids.transactionId}` },
  );
  if (intent.status !== "succeeded") fail(`PaymentIntent ${intent.id} ended ${intent.status}, expected succeeded; rows left in payment_requested, re-run is safe`);

  // What markPaid + applyBookingPaymentSync leave behind.
  await must(
    "mark transaction paid",
    sb
      .from("booking_transactions")
      .update({ status: "paid", paid_at: now, provider_metadata: { payment_intent_id: intent.id, seed: SEED_TAG } })
      .eq("id", ids.transactionId)
      .in("status", ["payment_requested", "pending"]),
  );
  await must(
    "sync booking",
    sb
      .from("agency_bookings")
      .update({ payment_status: "paid", client_revenue_lifecycle: "fully_paid", updated_at: now })
      .eq("id", ids.bookingId),
  );
  return report(ids, intent.id, args);
}

function report(ids, paymentIntentId, args) {
  console.log("[t690-seed] done. Created / present:");
  console.log(`  guest email          ${GUEST_EMAIL}`);
  console.log(`  tenant               ${args.tenantId}`);
  console.log(`  customers.id         ${ids.customerId}`);
  console.log(`  agency_bookings.id   ${ids.bookingId}`);
  console.log(`  booking_transactions ${ids.transactionId}`);
  console.log(`  stripe test PI       ${paymentIntentId ?? "(unknown)"}`);
  console.log("  QA: sign in at the staging host with that email by email link, then open /client.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.errors.length) fail(`${args.errors.join("; ")}\n${USAGE}`, 2);

  const verdict = checkTarget(process.env);
  if (!verdict.ok) fail(`refusing to run:\n  - ${verdict.reasons.join("\n  - ")}`, 2);

  const ids = seedIds();
  if (args.dryRun) {
    console.log("[t690-seed] dry run, nothing written. Target checks passed (staging project, sk_test_ key).");
    console.log(`  would write for ${GUEST_EMAIL} in tenant ${args.tenantId}: ${JSON.stringify(ids)}`);
    console.log(`  and one ${args.currency.toUpperCase()} ${(args.amountCents / 100).toFixed(2)} Stripe test PaymentIntent via ${TEST_PAYMENT_METHOD}`);
    return;
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (args.rollback) return rollback(sb, ids);
  const stripe = new Stripe(process.env[verdict.keyName]);
  return seed(sb, stripe, args, ids);
}

main().catch((e) => fail(`unexpected failure: ${e instanceof Error ? e.message : "unknown"}`));
