/**
 * Stripe webhook handler — consumes `checkout.session.completed` events
 * and flips the corresponding `booking_transactions` row to `paid`.
 *
 * Endpoint: POST /api/webhooks/stripe
 *
 * Configuration (required):
 *   STRIPE_SECRET_KEY        — used to construct the Stripe client
 *   STRIPE_WEBHOOK_SECRET    — endpoint secret used to verify signatures
 *
 * Without these env vars the route refuses every request with 503 so
 * misconfigured deployments don't silently accept unsigned events.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/payments/stripe-checkout";
import {
  findAgencyByStripeAccountId,
  persistAccountSnapshot,
} from "@/lib/payments/stripe-connect";
import { markPaid, loadActiveBookingTransaction } from "@/lib/bookings/transactions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Stripe requires the raw body for signature verification.
  const bodyText = await req.text();

  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret);
  } catch (err) {
    logServerError("webhooks.stripe.signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as import("stripe").Stripe.Checkout.Session;
        const transactionId =
          (session.client_reference_id as string | null)
          ?? (session.metadata?.transaction_id as string | undefined)
          ?? null;
        if (!transactionId) {
          logServerError("webhooks.stripe.checkoutCompleted", new Error("no transaction id"));
          break;
        }
        const result = await markPaid(transactionId);
        if (!result.ok) {
          logServerError("webhooks.stripe.markPaid", new Error(result.error));
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as import("stripe").Stripe.PaymentIntent;
        // PaymentIntent doesn't carry the transaction id directly; rely
        // on the metadata we set on the Checkout session (Stripe forwards
        // it to the PaymentIntent).
        const transactionId = (intent.metadata?.transaction_id as string | undefined) ?? null;
        if (transactionId) {
          // Best-effort failure path. We don't markFailed here because
          // we don't know that the user wants to abandon the txn — they
          // may retry the same Checkout session. Logging is enough.
          logServerError("webhooks.stripe.paymentFailed", new Error(`tx ${transactionId} failed`));
        }
        break;
      }
      // ── Connect events ──────────────────────────────────────────────────
      // These arrive at the same endpoint when the platform's webhook
      // subscription includes "Listen to events on Connected accounts" or
      // when the event itself originates on a connected account
      // (`event.account` is set on the envelope in either case).
      case "account.updated": {
        const account = event.data.object as import("stripe").Stripe.Account;
        const agency = await findAgencyByStripeAccountId(account.id);
        if (!agency) break; // event for an account we don't know about — ignore
        const persisted = await persistAccountSnapshot(agency.agencyId, account);
        if (!persisted.ok) {
          logServerError("webhooks.stripe.account.updated", new Error(persisted.error));
        }
        break;
      }
      case "payout.paid":
      case "payout.failed":
      case "payout.created":
      case "payout.canceled": {
        // Connect payout events. We don't write to DB today — the agency's
        // payout history is fully visible in their Stripe Express dashboard.
        // Logging here lets us see them in the platform logs for debugging.
        const payout = event.data.object as import("stripe").Stripe.Payout;
        const stripeAccountId = (event.account as string | undefined) ?? null;
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info(`[stripe.connect] ${event.type} acct=${stripeAccountId ?? "?"} payout=${payout.id} amount=${payout.amount} ${payout.currency}`);
        }
        break;
      }
      case "capability.updated": {
        // A capability flag on a Connect account changed (e.g. transfers
        // got enabled or restricted). Refresh the persisted snapshot.
        const cap = event.data.object as import("stripe").Stripe.Capability;
        const stripeAccountId = (event.account as string | undefined) ?? (cap.account as string | undefined) ?? null;
        if (!stripeAccountId) break;
        const agency = await findAgencyByStripeAccountId(stripeAccountId);
        if (!agency) break;
        // Re-fetch the account to get the full state, then persist.
        try {
          const acct = await stripe.accounts.retrieve(stripeAccountId);
          const persisted = await persistAccountSnapshot(agency.agencyId, acct);
          if (!persisted.ok) {
            logServerError("webhooks.stripe.capability.updated", new Error(persisted.error));
          }
        } catch (err) {
          logServerError("webhooks.stripe.capability.updated/retrieve", err);
        }
        break;
      }

      // ── F.6 subscription lifecycle ──────────────────────────────────────
      case "customer.subscription.updated": {
        // Cancel-at-period-end toggle + status transitions (active → past_due
        // → unpaid → canceled). Mirror to workspace_subscriptions.
        const sub = event.data.object as import("stripe").Stripe.Subscription;
        const admin = createServiceRoleClient();
        if (!admin) break;
        // current_period_end moved onto subscription items in newer Stripe
        // typings (one period per item). Read the first item's period end
        // as the canonical billing-cycle marker — Tulala plans are single-
        // item subscriptions so this matches the old top-level field.
        const periodEndUnix =
          (sub.items.data[0] as { current_period_end?: number } | undefined)?.current_period_end ?? null;
        await admin
          .from("workspace_subscriptions")
          .update({
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            current_period_end_at: periodEndUnix
              ? new Date(periodEndUnix * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", typeof sub.customer === "string" ? sub.customer : sub.customer.id);
        break;
      }
      case "customer.subscription.deleted": {
        // Subscription fully cancelled. Drop the workspace to 'free' so
        // entitlements degrade cleanly + record the cancellation audit row
        // (F.6 audit was already inserted client-side; this is the
        // billing-system confirmation).
        const sub = event.data.object as import("stripe").Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const admin = createServiceRoleClient();
        if (!admin) break;
        const { data: ws } = await admin
          .from("workspace_subscriptions")
          .select("tenant_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        const tenantId = (ws as { tenant_id?: string } | null)?.tenant_id;
        if (tenantId) {
          await admin
            .from("agencies")
            .update({ plan_tier: "free", talent_seat_limit: 5, updated_at: new Date().toISOString() })
            .eq("id", tenantId);
        }
        await admin
          .from("workspace_subscriptions")
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
        break;
      }
      case "invoice.payment_succeeded": {
        // Subscription renewal billed successfully. No state change needed
        // — entitlements stay where they are. Log for audit traceability.
        const invoice = event.data.object as import("stripe").Stripe.Invoice;
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info(
            `[stripe.subscription] invoice paid customer=${typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "?"} amount=${invoice.amount_paid} ${invoice.currency}`,
          );
        }
        break;
      }
      case "invoice.payment_failed": {
        // Subscription renewal failed (dunning). Stripe will retry per the
        // smart-retry schedule; we mark the workspace as past_due so the
        // UI can surface "Your card needs attention".
        const invoice = event.data.object as import("stripe").Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;
        const admin = createServiceRoleClient();
        if (!admin) break;
        await admin
          .from("workspace_subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", customerId);
        break;
      }

      // ── F.5 booking deposit ─────────────────────────────────────────────
      case "payment_intent.succeeded": {
        const intent = event.data.object as import("stripe").Stripe.PaymentIntent;
        const purpose = (intent.metadata?.purpose as string | undefined) ?? null;
        if (purpose !== "booking_deposit") break;
        const bookingId = (intent.metadata?.booking_id as string | undefined) ?? null;
        if (!bookingId) {
          logServerError("webhooks.stripe.depositPaid", new Error(`PI ${intent.id} missing booking_id`));
          break;
        }
        const admin = createServiceRoleClient();
        if (!admin) break;
        const { error: updateErr } = await admin
          .from("bookings")
          .update({
            deposit_paid_at: new Date().toISOString(),
            deposit_amount_cents: intent.amount,
            deposit_currency: intent.currency.toUpperCase(),
            deposit_payment_intent_id: intent.id,
          })
          .eq("id", bookingId);
        if (updateErr) {
          logServerError("webhooks.stripe.depositPaid.update", updateErr);
        }
        break;
      }

      default:
        // Ignore other event types — we only care about checkout completion,
        // Connect account lifecycle, subscription lifecycle, and deposits.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    logServerError("webhooks.stripe.dispatch", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Suppress "unused import" warning for the loadActiveBookingTransaction
// helper that's reserved for a future enhancement (e.g. validating the
// transaction is in the expected status before marking paid).
// createServiceRoleClient is now used by the subscription + deposit
// handlers above.
void loadActiveBookingTransaction;
