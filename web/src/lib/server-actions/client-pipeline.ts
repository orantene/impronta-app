"use server";

/**
 * Client-side pipeline server actions for the prototype client shell.
 *
 * Mirrors `talent-pipeline.ts`: any authenticated user, with engine-level
 * permission validation per action. The client surface uses these to
 * Approve / Counter-reject the current offer, send messages on the
 * private (client) thread, and request payment-related actions.
 *
 * All wrappers translate `EngineResult` to a flat `{ ok, error }` shape.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { clientAcceptOffer } from "@/lib/inquiry/inquiry-engine-approvals";
import { clientRejectOffer } from "@/lib/inquiry/inquiry-engine-offers";
import { loadActiveBookingTransaction } from "@/lib/bookings/transactions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { checkInquiryCurrencyMatchesSeller } from "@/lib/inquiry/offer-currency-seller";
import { buildCheckoutReturnUrls } from "@/lib/payments/checkout-return-urls";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { createPaymentIntentForTransaction } from "@/lib/payments/stripe-payment-intent";
import { publicOrigin } from "@/lib/storefront/request-context";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { getRequestLocale } from "@/i18n/request-locale";
import { assertNotImpersonating, requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

// A.4 INTENTIONAL DIVERGENCE: align with canonical `ServerActionResult<T>` — currently
// preserved as a structurally compatible local type so `startInquiryCheckout`
// can attach `url`/`mock` on success without restructuring callers (Stripe
// redirect flow). Convert when checkout response is moved into a `data`
// payload across all callers.
export type ClientActionResult = { ok: true } | { ok: false; error: string };

async function loadClientInquiryContext(inquiryId: string): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
      tenantId: string;
      sourceWorkspaceId: string | null;
      version: number;
      currentOfferId: string | null;
    }
> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: inq } = await supabase
    .from("inquiries")
    // source_workspace_id (the originating channel/host) is loaded alongside
    // tenant_id so checkout routing can detect a cross-channel re-home — an
    // inquiry filed under a tenant that is NOT the channel it came in through
    // (see startInquiryCheckout). For a native storefront inquiry the two are
    // equal, so the re-home branch there is a strict no-op.
    .select("tenant_id, source_workspace_id, version, current_offer_id, client_user_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inq) return { ok: false, error: "Inquiry not found." };
  // The client_user_id check below is a belt-and-suspenders gate — the
  // engine itself uses participant-role validation, so even if a user
  // with no client_user_id binding tried this they'd be rejected at
  // validateActorPermission. But fail fast here for cleaner error copy.
  if (inq.client_user_id && inq.client_user_id !== user.id) {
    return { ok: false, error: "Not your inquiry." };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    tenantId: inq.tenant_id as string,
    sourceWorkspaceId: (inq.source_workspace_id as string | null) ?? null,
    version: (inq.version as number | null) ?? 1,
    currentOfferId: (inq.current_offer_id as string | null) ?? null,
  };
}

/**
 * Client approves the current offer on an inquiry. Records the approval
 * via the engine's `clientAcceptOffer` (which resolves the client's
 * participant row and writes to `inquiry_approvals` + advances the
 * inquiry to `approved` once all approvals land).
 */
export async function clientApproveCurrentOffer(inquiryId: string): Promise<ClientActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;
    if (!ctx.currentOfferId) return { ok: false, error: "No active offer to approve yet." };

    const result = await clientAcceptOffer(ctx.supabase, {
      inquiryId,
      tenantId: ctx.tenantId,
      offerId: ctx.currentOfferId,
      actorUserId: ctx.userId,
      expectedVersion: ctx.version,
    });
    if (!result.success) {
      const reason = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not approve offer.";
      const friendly =
        reason === "no_client_participant" ? "We couldn't find your client record on this inquiry."
        : reason === "version_conflict" ? "This inquiry was updated — refresh and retry."
        : reason === "forbidden" ? "You don't have permission to approve this offer."
        : reason;
      return { ok: false, error: friendly };
    }
    // Slice AUDIT wiring: emit audit row on successful approval. Fire-
    // and-forget — if the audit emit fails (network/transient), the
    // approval still stands. The user-facing action result is unchanged.
    await ctx.supabase.rpc("inquiry_audit_emit", {
      p_inquiry_id: inquiryId,
      p_kind: "offer_accepted",
      p_payload: { offer_id: ctx.currentOfferId, accepted_by: ctx.userId },
    }).then((r) => {
      if (r.error) logServerError("client-pipeline.approve.audit", r.error);
    });
    // §6 chat-card: emit offer_event card into the private thread.
    try {
      await ctx.supabase.from("inquiry_messages").insert({
        inquiry_id: inquiryId,
        tenant_id: ctx.tenantId,
        thread_type: "private",
        sender_user_id: ctx.userId,
        body: "Client approved the offer.",
        message_kind: "offer_event",
        card_payload: { status: "accepted", total_label: "" },
      });
    } catch (emitErr) {
      logServerError("client-pipeline.approve.chatCard", emitErr);
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.clientApproveCurrentOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client rejects the current offer. Optional `reason` + `reasonText`.
 * Sends the inquiry back to coordination so the agency can counter.
 */
export async function clientRejectCurrentOffer(
  inquiryId: string,
  reason: "too_expensive" | "wrong_talent" | "timing" | "changed_plans" | "other" = "other",
  reasonText?: string,
): Promise<ClientActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;
    if (!ctx.currentOfferId) return { ok: false, error: "No active offer to reject." };

    const result = await clientRejectOffer(ctx.supabase, {
      inquiryId,
      tenantId: ctx.tenantId,
      offerId: ctx.currentOfferId,
      actorUserId: ctx.userId,
      expectedVersion: ctx.version,
      rejectionReason: reason,
      rejectionReasonText: reasonText ?? null,
    });
    if (!result.success) {
      const r = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not reject offer.";
      return { ok: false, error: r };
    }
    // Slice AUDIT wiring: emit audit row on successful decline.
    await ctx.supabase.rpc("inquiry_audit_emit", {
      p_inquiry_id: inquiryId,
      p_kind: "offer_declined",
      p_payload: {
        offer_id: ctx.currentOfferId,
        declined_by: ctx.userId,
        reason,
        reason_text: reasonText ?? null,
      },
    }).then((r) => {
      if (r.error) logServerError("client-pipeline.reject.audit", r.error);
    });
    // §6 chat-card: emit offer_event card into the private thread.
    try {
      await ctx.supabase.from("inquiry_messages").insert({
        inquiry_id: inquiryId,
        tenant_id: ctx.tenantId,
        thread_type: "private",
        sender_user_id: ctx.userId,
        body: "Client declined the offer.",
        message_kind: "offer_event",
        card_payload: { status: "declined", reason },
      });
    } catch (emitErr) {
      logServerError("client-pipeline.reject.chatCard", emitErr);
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.clientRejectCurrentOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client requests a Stripe Checkout session to pay the inquiry's
 * outstanding invoice. Returns the hosted Stripe URL on success — the
 * client redirects the browser there. Webhook flips the transaction
 * to `paid` once Stripe confirms the charge.
 *
 * Mock mode (no STRIPE_SECRET_KEY): returns a synthetic URL so the
 * prototype demo still completes the redirect step without crashing.
 */
export async function startInquiryCheckout(
  inquiryId: string,
): Promise<ClientActionResult & { url?: string; mock?: boolean }> {
  await requireNotImpersonating();
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;

    const { data: booking } = await ctx.supabase
      .from("agency_bookings")
      .select("id, currency_code, contact_email")
      .eq("tenant_id", ctx.tenantId)
      .eq("source_inquiry_id", inquiryId)
      .maybeSingle();
    if (!booking) return { ok: false, error: "No booking yet for this inquiry." };

    const txn = await loadActiveBookingTransaction(booking.id as string, ctx.supabase);
    if (!txn) return { ok: false, error: "No active transaction — ask the agency to request payment first." };
    if (txn.status === "paid" || txn.status === "payout_pending" || txn.status === "payout_sent") {
      return { ok: false, error: "This invoice is already paid." };
    }

    // TUL-274: never start a charge in a currency the single seller does not charge in.
    // Sellers are read with the service client: the client's own session cannot see talent rows.
    // Fails CLOSED on a read error, or when the service client is missing.
    // No silent USD on a charge: an unreadable currency refuses.
    const chargeCurrencyA = txn.currency || (booking.currency_code as string | null);
    if (!chargeCurrencyA) return { ok: false, error: "This invoice has no currency yet - ask the agency to resend it." };
    const curCheck = await checkInquiryCurrencyMatchesSeller(createServiceRoleClient(), {
      inquiryId,
      currency: chargeCurrencyA,
      mode: "charge",
    });
    if (!curCheck.ok) return { ok: false, error: curCheck.message };

    // TUL-350 slice 1: success/cancel from the request host + locale the
    // client is reading in. Never NEXT_PUBLIC_BASE_URL (app-host bounce).
    const origin = await publicOrigin();
    if (!origin) return { ok: false, error: "Could not open payment." };
    const locale = await getRequestLocale();
    const { successUrl, cancelUrl } = buildCheckoutReturnUrls({ origin, locale });

    // The charge ALWAYS lands on the platform account — there is no
    // connected-account routing here any more. It used to branch: a workspace
    // with a fully-onboarded Connect account got a Direct Charge on its own
    // account with the platform taking an application fee, and a cross-channel
    // re-home was special-cased back onto the platform to keep the payout
    // fan-out funded. Both the branch and the special case are gone
    // (finance audit, 2026-09-01): our connected accounts are on the
    // `recipient` service agreement, which Stripe does not allow to process
    // payments at all, and a Direct Charge leaves the gross on the workspace's
    // account while `markPaid` pays talent + workspace out of the PLATFORM
    // balance. See lib/payments/stripe-checkout.ts for the full reasoning.
    const result = await createCheckoutSessionForTransaction({
      transactionId: txn.id,
      amountCents: txn.grossAmountCents,
      currency: chargeCurrencyA,
      payerEmail: txn.payerEmail ?? (booking.contact_email as string | null) ?? null,
      inquiryId,
      bookingId: booking.id as string,
      successUrl,
      cancelUrl,
      description: "Booking invoice",
      // Pay in the language the client is reading the app in, not the one
      // their browser happens to advertise.
      locale,
    });

    if (!result.ok) return { ok: false, error: result.error };

    return { ok: true, url: result.url, mock: result.mock };
  } catch (err) {
    logServerError("client-pipeline.startInquiryCheckout", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Embedded checkout: create a PaymentIntent for the inquiry's outstanding
 * invoice and return its client secret. The client confirms ON-PAGE via the
 * Stripe Payment Element drawer (no redirect, auto-updating). The
 * `payment_intent.succeeded` webhook flips the transaction to `paid`.
 *
 * Charges the full transaction amount on the PLATFORM account (separate
 * charges + transfers model). The 3-way split — talent paid in full, the
 * platform's seller share deducted from the workspace margin — is fanned out
 * post-payment via transfers (Phase 3).
 *
 * Mock mode (no STRIPE_SECRET_KEY): returns a synthetic client secret + `mock`
 * flag so the drawer simulates the confirm step and the prototype still demos.
 */
export async function createInquiryPaymentIntent(
  inquiryId: string,
): Promise<ClientActionResult & {
  clientSecret?: string;
  amountCents?: number;
  currency?: string;
  mock?: boolean;
  /** Publishable key of the Stripe platform that owns the charge (MX differs from US). */
  publishableKey?: string | null;
}> {
  await requireNotImpersonating();
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;

    const { data: booking } = await tenantScopedQuery(ctx.supabase, "agency_bookings", ctx.tenantId)
      .select("id, currency_code, contact_email")
      .eq("source_inquiry_id", inquiryId)
      .maybeSingle() as {
        data: { id: string; currency_code: string | null; contact_email: string | null } | null;
      };
    if (!booking) return { ok: false, error: "No booking yet for this inquiry." };

    const txn = await loadActiveBookingTransaction(booking.id as string, ctx.supabase);
    if (!txn) return { ok: false, error: "No active transaction — ask the agency to request payment first." };
    if (txn.status === "paid" || txn.status === "payout_pending" || txn.status === "payout_sent") {
      return { ok: false, error: "This invoice is already paid." };
    }

    const currency = txn.currency || (booking.currency_code as string | null);
    if (!currency) return { ok: false, error: "This invoice has no currency yet - ask the agency to resend it." };

    // TUL-274: never start a charge in a currency the single seller does not charge in.
    const curCheck = await checkInquiryCurrencyMatchesSeller(createServiceRoleClient(), { inquiryId, currency, mode: "charge" });
    if (!curCheck.ok) return { ok: false, error: curCheck.message };

    const result = await createPaymentIntentForTransaction({
      transactionId: txn.id,
      // The transaction gross is what the agency requested. Once the offer
      // composer bakes the client surcharge into the offer total (Phase 0.5)
      // this already includes it; until then it is the service subtotal.
      amountCents: txn.grossAmountCents,
      currency,
      payerEmail: txn.payerEmail ?? (booking.contact_email as string | null) ?? null,
      inquiryId,
      bookingId: booking.id as string,
      description: "Booking payment",
    });

    if (!result.ok) return { ok: false, error: result.error };

    return {
      ok: true,
      clientSecret: result.clientSecret,
      amountCents: result.amountCents,
      currency: result.currency,
      mock: result.mock,
      publishableKey: result.publishableKey ?? null,
    };
  } catch (err) {
    logServerError("client-pipeline.createInquiryPaymentIntent", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client sends a message on the private (client) thread. Bypasses the
 * staff-capability gate by validating the actor is the inquiry's client.
 */
export async function sendInquiryMessageAsClient(
  inquiryId: string,
  body: string,
): Promise<ClientActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Message body is empty." };
    if (trimmed.length > 10000) return { ok: false, error: "Message too long." };

    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;

    const { error } = await ctx.supabase
      .from("inquiry_messages")
      .insert({
        inquiry_id: inquiryId,
        thread_type: "private",
        sender_user_id: ctx.userId,
        body: trimmed,
        tenant_id: ctx.tenantId,
      });
    if (error) {
      logServerError("client-pipeline.sendInquiryMessageAsClient", error);
      return { ok: false, error: "Failed to send message." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.sendInquiryMessageAsClient", err);
    return { ok: false, error: "Unexpected error." };
  }
}
