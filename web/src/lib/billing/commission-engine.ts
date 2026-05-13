/**
 * Commission engine — Phase B PR 2.
 *
 * Bridges the pure resolver (`./commission.ts`) and the booking-conversion
 * engine path (`@/lib/inquiry/inquiry-engine-booking`). Two SECURITY DEFINER
 * RPCs do the IO; this module orchestrates and surfaces non-fatal results
 * so a snapshot failure NEVER blocks a booking from being created.
 *
 * Spec: `web/docs/commission-model-2026-05-13.md`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveBookingCommissions,
  CommissionResolutionError,
  type PaymentMethod,
  type PlatformCommissionConfig,
  type WorkspaceCommissionOverride,
  type WorkspacePlanTier,
  type OfferLineItemForResolver,
  type BookingCommissionSnapshot,
} from "./commission";

interface CommissionContext {
  tenant_id: string;
  workspace_plan: string;
  platform_config: PlatformCommissionConfig;
  tenant_override: WorkspaceCommissionOverride | null;
  offer_id: string;
  currency_code: string;
  offer_line_items: Array<{
    units: number;
    unit_price_cents: number;
    talent_cost_cents: number;
  }>;
}

/** Normalize `workspace_plan` strings from the DB into the typed union the
 *  resolver expects. The DB column `agencies.plan` historically allows
 *  more strings than the resolver's narrow type; we map and default. */
function normalizePlan(raw: string): WorkspacePlanTier {
  switch (raw) {
    case "free":
    case "studio":
    case "agency":
    case "network":
      return raw;
    case "hub-network":
    case "hub_network":
      return "network";
    default:
      return "free";
  }
}

export type CommissionEngineResult =
  | { ok: true; snapshot: BookingCommissionSnapshot }
  | { ok: false; reason:
      | "context_load_failed"
      | "resolver_failed"
      | "persist_failed"
      | "skipped_no_offer"; detail?: string };

/**
 * Compute + persist a commission snapshot for a freshly-converted booking.
 *
 * Called from `convertToBooking` after the booking row exists. Failures
 * are surfaced as non-fatal results — the booking has already happened;
 * commission errors are logged and the result returned to the caller for
 * downstream handling (e.g. surfacing in the admin UI). The booking is
 * NEVER reverted because commissions couldn't be snapshotted.
 *
 * @param paymentMethod  v1 default 'card'. Workspace marks off-platform
 *                       via the separate `setBookingPaymentMethod` action
 *                       (lands in a future PR; updates the snapshot).
 */
export async function persistBookingCommissionSnapshot(
  supabase: SupabaseClient,
  bookingId: string,
  paymentMethod: PaymentMethod = "card",
  offPlatformReason: string | null = null,
  bookingPlatformTakeBpsOverride: number | null = null,
): Promise<CommissionEngineResult> {
  // 1. Load context from the RPC (one round trip).
  const { data: ctxRaw, error: ctxError } = await supabase
    .rpc("engine_load_commission_context", { p_booking_id: bookingId });

  if (ctxError) {
    logServerError("commission-engine/load_context", ctxError);
    return { ok: false, reason: "context_load_failed", detail: ctxError.message };
  }
  if (!ctxRaw) {
    return { ok: false, reason: "context_load_failed", detail: "context_null" };
  }

  // Defensive cast — the RPC returns JSONB with the shape we encoded.
  const ctx = ctxRaw as CommissionContext;

  // 2. Resolve (pure function — no IO).
  let snapshot: BookingCommissionSnapshot;
  try {
    snapshot = resolveBookingCommissions({
      tenantId: ctx.tenant_id,
      workspacePlan: normalizePlan(ctx.workspace_plan),
      offerLineItems: ctx.offer_line_items as OfferLineItemForResolver[],
      currencyCode: ctx.currency_code,
      paymentMethod,
      offPlatformReason,
      platformConfig: ctx.platform_config,
      tenantOverride: ctx.tenant_override,
      bookingPlatformTakeBpsOverride,
    });
  } catch (err) {
    const code = err instanceof CommissionResolutionError ? err.code : "unknown";
    logServerError(`commission-engine/resolve_failed[${code}][booking=${bookingId}]`, err);
    return { ok: false, reason: "resolver_failed", detail: code };
  }

  // 3. Persist via the engine RPC (atomic — snapshot + (if off-platform)
  //    accrual movement + balance bump).
  const { error: persistError } = await supabase
    .rpc("engine_persist_booking_commission_snapshot", {
      p_booking_id: bookingId,
      p_platform_take_bps: snapshot.platform_take_bps,
      p_platform_take_floor_cents: snapshot.platform_take_floor_cents,
      p_gross_cents: snapshot.gross_cents,
      p_platform_fee_cents: snapshot.platform_fee_cents,
      p_workspace_fee_cents: snapshot.workspace_fee_cents,
      p_talent_net_cents: snapshot.talent_net_cents,
      p_currency_code: snapshot.currency_code,
      p_payment_method: snapshot.payment_method,
      p_off_platform_reason: snapshot.off_platform_reason,
      p_resolved_from: snapshot.resolved_from,
    });

  if (persistError) {
    logServerError(`commission-engine/persist_failed[booking=${bookingId}]`, persistError);
    return { ok: false, reason: "persist_failed", detail: persistError.message };
  }

  // Audit emit — fire-and-forget. Resolve inquiry_id from the booking so the
  // emit lands on the correct audit thread. Failure must never surface to callers.
  const { data: bk } = await supabase
    .from("agency_bookings")
    .select("source_inquiry_id")
    .eq("id", bookingId)
    .maybeSingle();
  const auditInquiryId = (bk?.source_inquiry_id as string | null) ?? null;
  if (auditInquiryId) {
    await supabase.rpc("inquiry_audit_emit", {
      p_inquiry_id: auditInquiryId,
      p_kind: "commission_split_changed",
      p_payload: {
        booking_id: bookingId,
        platform_fee_cents: snapshot.platform_fee_cents,
        workspace_fee_cents: snapshot.workspace_fee_cents,
        talent_fee_cents: snapshot.talent_net_cents,
      },
    }).then((r) => { if (r.error) logServerError("audit.emit.commission_split_changed", r.error); });
  }

  return { ok: true, snapshot };
}

/** Load the snapshot for a booking — for UI consumption (offer drafter
 *  breakdown, talent view, settings → money). Reads through normal RLS
 *  (no SECURITY DEFINER) because the read policy already covers the
 *  appropriate audiences. */
export async function loadBookingCommissionSnapshot(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingCommissionSnapshot | null> {
  const { data, error } = await supabase
    .from("booking_commission_snapshot")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) {
    logServerError(`commission-engine/load_snapshot[booking=${bookingId}]`, error);
    return null;
  }
  if (!data) return null;
  return data as BookingCommissionSnapshot;
}
