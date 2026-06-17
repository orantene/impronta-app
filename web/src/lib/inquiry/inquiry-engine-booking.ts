import type { SupabaseClient } from "@supabase/supabase-js";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { improntaLog } from "@/lib/server/structured-log";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import type { EngineResult } from "./inquiry-engine.types";
import { logInquiryAction } from "./inquiry-action-log";
import { getInquiryGroupShortfall } from "./inquiry-fulfillment";
import { persistBookingCommissionSnapshot } from "@/lib/billing/commission-engine";
import type { Database } from "@/lib/supabase/database.types";

type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];
type InquiryOffersRow = Database["public"]["Tables"]["inquiry_offers"]["Row"];

// SaaS P1.B STEP A: tenant-scoped by construction. Before invoking the RPC
// we verify the inquiry row belongs to ctx.tenantId so cross-tenant ids are
// rejected at the engine boundary even though the RPC runs SECURITY DEFINER.
async function inquiryInTenant(
  supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

async function onBookingCreated(
  bookingId: string,
  ctx: {
    inquiryId: string;
    totalClientPrice: number;
    currencyCode: string;
    clientAccountId: string | null;
  },
): Promise<void> {
  await improntaLog("onBookingCreated", {
    bookingId,
    inquiryId: ctx.inquiryId,
    totalClientPrice: ctx.totalClientPrice,
    currencyCode: ctx.currencyCode,
    clientAccountId: ctx.clientAccountId ?? "",
  });
}

/**
 * W6a — POST-COMMIT snapshot of the approved offer's negotiated commercial terms
 * onto the just-created booking. Runs in TypeScript next to the commission
 * snapshot — NOT in the RPC. Display + snapshot only: records the agreed deposit
 * %, the derived deposit amount + currency, the balance-collection method, and
 * the refund policy onto agency_bookings. Nothing here charges the deposit.
 *
 * The converted offer is the inquiry's current_offer_id (the RPC sets it to
 * status 'booked' but leaves current_offer_id pointing at it). New columns are
 * read/written via .returns<T>() because database.types.ts is not regenerated.
 */
async function snapshotOfferTermsOntoBooking(
  supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
  bookingId: string,
): Promise<void> {
  const { data: inq } = await supabase
    .from("inquiries")
    .select("current_offer_id")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle()
    .returns<Pick<InquiryRow, "current_offer_id">>();
  const offerId = inq?.current_offer_id ?? null;
  if (!offerId) return;

  // TODO: inquiry_offers.total_client_price / deposit_pct / deposit_amount_cents
  // are typed as `number` in InquiryOffersRow but may arrive as string over the
  // wire in some Supabase client versions. Keep the wider cast until the Supabase
  // JS client is pinned to a version that guarantees numeric coercion.
  const { data: offer } = await supabase
    .from("inquiry_offers")
    .select(
      "total_client_price, currency_code, deposit_pct, deposit_amount_cents, balance_collection_method, refund_policy_key",
    )
    .eq("id", offerId)
    .eq("tenant_id", tenantId)
    .maybeSingle()
    .returns<Pick<InquiryOffersRow, "total_client_price" | "currency_code" | "deposit_pct" | "deposit_amount_cents" | "balance_collection_method" | "refund_policy_key">>();
  if (!offer) return;

  const { readOfferTermsFromRow } = await import("@/lib/billing/offer-commercial-terms");
  const totalCents = Math.round(Number(offer.total_client_price ?? 0) * 100);
  const terms = readOfferTermsFromRow(
    {
      deposit_pct: offer.deposit_pct,
      deposit_amount_cents: offer.deposit_amount_cents,
      balance_collection_method: offer.balance_collection_method,
      refund_policy_key: offer.refund_policy_key,
    },
    totalCents,
  );
  // No negotiated terms on the offer (drafted before W6a) → nothing to snapshot;
  // leave the booking's term columns null.
  if (!terms) return;

  const currency = (offer.currency_code ?? "").toUpperCase() || null;
  const { error } = await supabase
    .from("agency_bookings")
    .update({
      deposit_pct: terms.depositPct,
      deposit_amount_cents: terms.depositAmountCents,
      // Only set deposit_currency from the offer when present — never clobber an
      // existing value with null.
      ...(currency ? { deposit_currency: currency } : {}),
      balance_collection_method: terms.balanceMethod,
      refund_policy_key: terms.refundPolicy,
    })
    .eq("id", bookingId)
    .eq("tenant_id", tenantId);
  if (error) {
    await improntaLog("convertToBooking.offer_terms_snapshot_write_failed", {
      bookingId,
      detail: error.message,
    });
  }
}

export async function convertToBooking(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    expectedVersion: number;
    /**
     * M2.3: admin override reason. When provided AND the actor is super_admin
     * AND there is a shortfall, conversion proceeds with override metadata
     * persisted on `agency_bookings`. Min 10 chars (trimmed). The RPC enforces
     * both the role and length constraints. The failure return may include a
     * structured `shortfall` field (see `EngineErr.shortfall`) when
     * `reason === "requirement_groups_unfulfilled"`.
     */
    overrideReason?: string | null;
  },
): Promise<EngineResult<{ bookingId: string; createdWithOverride: boolean }>> {
  return runWithEngineLog("convertToBooking", ctx.inquiryId, ctx.actorUserId, async () => {
    const rl = await rateLimiter.check(engineRateKey("convertToBooking", ctx.actorUserId), 5, 60 * 60_000);
    if (!rl.ok) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: "rate_limited",
      });
      return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };
    }

    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: "forbidden",
      });
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "convert_to_booking");
    if (!perm.ok) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: "forbidden",
      });
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const overrideReasonTrimmed =
      typeof ctx.overrideReason === "string" ? ctx.overrideReason.trim() : null;
    const overrideReasonForRpc =
      overrideReasonTrimmed && overrideReasonTrimmed.length > 0 ? overrideReasonTrimmed : null;

    const { data, error } = await supabase.rpc("engine_convert_to_booking", {
      p_inquiry_id: ctx.inquiryId,
      p_actor_user_id: ctx.actorUserId,
      p_inquiry_expected_version: ctx.expectedVersion,
      p_override_reason: overrideReasonForRpc,
    });

    if (error) {
      const msg = String(error.message || "");
      let result: EngineResult<{ bookingId: string; createdWithOverride: boolean }>;
      if (msg.includes("version_conflict")) {
        result = { success: false, conflict: true, reason: "version_conflict" };
      } else if (msg.includes("inquiry_frozen")) {
        result = { success: false, reason: "inquiry_frozen" };
      } else if (msg.includes("approvals_incomplete")) {
        result = { success: false, reason: "approvals_incomplete" };
      } else if (msg.includes("no_active_offer")) {
        result = { success: false, reason: "no_active_offer" };
      } else if (msg.includes("requirement_groups_unfulfilled")) {
        // Fetch structured shortfall for UI — fails closed on error.
        const readiness = await getInquiryGroupShortfall(supabase, ctx.inquiryId);
        result = {
          success: false,
          reason: "requirement_groups_unfulfilled",
          shortfall: readiness.shortfall,
        };
      } else if (msg.includes("override_not_allowed")) {
        result = { success: false, reason: "override_not_allowed", forbidden: true };
      } else if (msg.includes("override_reason_too_short")) {
        result = { success: false, reason: "override_reason_too_short" };
      } else if (msg.includes("forbidden")) {
        result = { success: false, reason: "forbidden", forbidden: true };
      } else {
        result = { success: false, error: msg || "convert_failed" };
      }

      const err = result as Exclude<typeof result, { success: true }>;
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: err.reason ?? err.error ?? "convert_failed",
        metadata:
          err.reason === "requirement_groups_unfulfilled"
            ? { shortfall: err.shortfall, override_attempted: overrideReasonForRpc !== null }
            : { override_attempted: overrideReasonForRpc !== null },
      });

      return result;
    }

    const bookingId = String(data ?? "").trim();
    if (!bookingId) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: "convert_failed",
      });
      return { success: false, error: "convert_failed" };
    }

    const createdWithOverride = overrideReasonForRpc !== null;

    // Always log the conversion attempt outcome...
    await logInquiryAction(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      actionType: "booking_conversion_attempt",
      result: "success",
      reason: null,
      metadata: { booking_id: bookingId, created_with_override: createdWithOverride },
    });

    // ...and, separately, log the override action when one was used. This gives
    // dashboards a clean filter for override events without needing to parse
    // metadata flags on every attempt row.
    if (createdWithOverride) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_override",
        result: "success",
        reason: overrideReasonForRpc,
        metadata: { booking_id: bookingId },
      });
    }

    // Best-effort post-commit effects (kept outside transaction wrapper).
    // Read the real figures off the just-committed booking so the structured
    // log records the actual amount / currency / client instead of zeros
    // (audit #15). The RPC above already wrote the row; a read failure here
    // degrades to the prior zero/empty values rather than throwing.
    const { data: bookingFigures } = await supabase
      .from("agency_bookings")
      .select("total_client_revenue, currency_code, client_account_id")
      .eq("id", bookingId)
      .maybeSingle();
    await onBookingCreated(bookingId, {
      inquiryId: ctx.inquiryId,
      totalClientPrice: Number(bookingFigures?.total_client_revenue ?? 0),
      currencyCode: bookingFigures?.currency_code ?? "",
      clientAccountId: bookingFigures?.client_account_id ?? null,
    });

    // A6 — persist commission snapshot. This is now FATAL: a booking with no
    // commission snapshot can never pay the talent (executeBookingTransfers
    // skips a booking with no snapshot rows), so a snapshot failure must roll
    // the whole conversion back rather than leave a payout-less booking.
    //
    // GUARANTEE (verified P1 money-hardening 2026-06-17): the block below is the
    // ONLY thing standing between a snapshot failure and a payout-less booking.
    // On `!commissionResult.ok` it MUST (a) DELETE the agency_bookings row —
    // which CASCADE-removes booking_talent / booking_activity_log / any
    // snapshot+transaction children — (b) restore the inquiry to its
    // pre-convert 'approved' state at the caller's expectedVersion, and (c)
    // return { success: false }. Do NOT weaken this to a non-fatal log: a
    // commission-snapshot orphan = a talent who can never be paid. Orphan
    // MONITORING (detecting a booking that somehow slipped through with no
    // snapshot) is owned by a separate observability workstream, not here.
    //
    // Default payment_method='card' — workspaces flip to off-platform via the
    // dedicated mark-as-cash action.
    const commissionResult = await persistBookingCommissionSnapshot(supabase, bookingId);
    if (!commissionResult.ok) {
      await improntaLog("convertToBooking.commission_snapshot_failed", {
        bookingId,
        reason: commissionResult.reason,
        detail: commissionResult.detail ?? "",
      });

      // Compensating cleanup — undo everything the RPC created so the inquiry is
      // left exactly as it was pre-convert and can be retried cleanly. The
      // RPC's effects are:
      //   • agency_bookings row (the booking)
      //   • booking_talent rows           ── ON DELETE CASCADE from agency_bookings
      //   • booking_activity_log row      ── ON DELETE CASCADE from agency_bookings
      //   • (booking_commission_snapshot / booking_transactions if any) ── CASCADE
      //   • inquiries: status='booked', booked_at=now(), version+1
      // So a single DELETE of the agency_bookings row removes the booking and
      // every FK child, then we restore the inquiry to its 'approved' pre-convert
      // state (version back to the caller's expectedVersion). Done via service-role
      // so RLS can't silently filter the compensating writes.
      const { createServiceRoleClient } = await import("@/lib/supabase/admin");
      const cleanupClient = createServiceRoleClient() ?? supabase;

      const { error: delErr } = await cleanupClient
        .from("agency_bookings")
        .delete()
        .eq("id", bookingId)
        .eq("tenant_id", ctx.tenantId);

      const { error: restoreErr } = await cleanupClient
        .from("inquiries")
        .update({
          status: "approved" as never,
          booked_at: null,
          next_action_by: "coordinator",
          version: ctx.expectedVersion,
        })
        .eq("id", ctx.inquiryId)
        .eq("tenant_id", ctx.tenantId);

      if (delErr || restoreErr) {
        // The compensating cleanup itself failed — surface loudly. The booking
        // may now be orphaned (no commission snapshot) and the inquiry may be
        // stuck at 'booked'; an operator must reconcile manually.
        await improntaLog("convertToBooking.commission_snapshot_rollback_failed", {
          bookingId,
          deleteError: delErr?.message ?? "",
          restoreError: restoreErr?.message ?? "",
        });
      }

      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: "commission_snapshot_failed",
        metadata: {
          booking_id: bookingId,
          snapshot_reason: commissionResult.reason,
          rolled_back: !delErr && !restoreErr,
        },
      });

      return { success: false, error: "commission_snapshot_failed" };
    }

    // W6a — snapshot the approved offer's NEGOTIATED commercial terms onto the
    // booking. Display + snapshot only: this records the agreed deposit %, the
    // derived deposit amount, the balance-collection method, and the refund
    // policy — it does NOT charge anything. Non-fatal: a read/write failure here
    // is logged but never rolls back the booking.
    try {
      await snapshotOfferTermsOntoBooking(supabase, ctx.inquiryId, ctx.tenantId, bookingId);
    } catch (termErr) {
      await improntaLog("convertToBooking.offer_terms_snapshot_failed", {
        bookingId,
        detail: termErr instanceof Error ? termErr.message : String(termErr),
      });
    }

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.BOOKING_CREATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { bookingId, createdWithOverride },
      systemMessage: {
        threadType: "group",
        body: "Inquiry converted to booking.",
        eventType: "inquiry_booked",
      },
    });

    return { success: true, data: { bookingId, createdWithOverride } };
  });
}
