/**
 * Commission engine — Phase B PR 2 (per-participant grain, ADR 2026-05-22).
 *
 * Bridges the pure resolver (`./commission.ts`) and the booking-conversion
 * engine path (`@/lib/inquiry/inquiry-engine-booking`). Two SECURITY DEFINER
 * RPCs do the IO; this module orchestrates and surfaces non-fatal results
 * so a snapshot failure NEVER blocks a booking from being created.
 *
 * **Per-participant grain (2026-05-22):** one booking now produces N
 * `booking_commission_snapshot` rows — one per active talent participant
 * (`inquiry_participants`, role='talent'). Each row's commission is
 * resolved from the participant's frozen `owning_party_*`, so cross-tenant
 * inquiries are commissioned correctly per owning tenant.
 *
 * v1 invariant: all participants on a booking share the same payment
 * method (one Stripe PI per booking). The `paymentMethod` argument applies
 * uniformly to every row written by a single call.
 *
 * Spec: `web/docs/commission-model-2026-05-13.md`,
 *       `web/docs/adr-xtenant-commission-2026-05-22.md`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveBookingCommissions,
  reconcileBookingLanes,
  CommissionResolutionError,
  type PaymentMethod,
  type PlatformCommissionConfig,
  type WorkspaceCommissionOverride,
  type RelationshipCommissionOverride,
  type WorkspacePlanTier,
  type OfferLineItemForResolver,
  type BookingCommissionSnapshot,
  type PersistedBookingCommissionSnapshot,
} from "./commission";

/** One element of the participants array returned by
 *  `engine_load_commission_context`. */
interface ParticipantContext {
  participant_id: string;
  /** Null for house (workspace menu) participants. */
  talent_profile_id: string | null;
  owning_party_type: "agency" | "workspace" | "talent";
  owning_party_id: string;
  /** NULL when owning_party_type='talent' (independent). */
  tenant_id: string | null;
  /** NULL when owning_party_type='talent' (resolver falls to platform_default). */
  workspace_plan: string | null;
  tenant_override: WorkspaceCommissionOverride | null;
  offer_line_items: Array<{
    units: number;
    unit_price_cents: number;
    talent_cost_cents: number;
  }>;
}

/** Per-participant context shape returned by the new
 *  `engine_load_commission_context` RPC. */
interface CommissionContext {
  booking_id: string;
  home_tenant_id: string;
  offer_id: string;
  currency_code: string;
  platform_config: PlatformCommissionConfig;
  participants: ParticipantContext[];
  /** Phase C — the originating channel (inquiries.source_workspace_id). Always
   *  set post-Phase-A; absent on older RPC revisions (treated as no channel). */
  source_workspace_id?: string | null;
  /** Phase C — the referral rate configured for the channel (0 when unconfigured
   *  or the RPC predates Phase C). */
  hub_referral_bps?: number | null;
}

/** Normalize `workspace_plan` strings from the DB into the typed union the
 *  resolver expects. The DB column `agencies.plan_tier` historically allows
 *  more strings than the resolver's narrow type; we map and default. */
function normalizePlan(raw: string | null): WorkspacePlanTier {
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
      // Includes null (independent talents): plan_tier_bps lookup will
      // miss and the resolver falls to platform_default, which is the
      // correct behaviour for independents.
      return "free";
  }
}

/** Per-row snapshot the engine persists. Pairs the pure-resolver output
 *  with the freeze fields (participant_id + owning_party_*) the snapshot
 *  table now carries. */
interface ParticipantSnapshot extends BookingCommissionSnapshot {
  participant_id: string;
  owning_party_type: "agency" | "workspace" | "talent";
  owning_party_id: string;
}

export type CommissionEngineResult =
  | { ok: true; snapshots: ParticipantSnapshot[] }
  | { ok: false; reason:
      | "context_load_failed"
      | "resolver_failed"
      | "persist_failed"
      | "skipped_no_offer"; detail?: string };

/**
 * Compute + persist commission snapshots for a freshly-converted booking.
 *
 * One call writes N rows (one per active talent participant). Failures
 * are surfaced as non-fatal results — the booking has already happened;
 * commission errors are logged and the result returned to the caller for
 * downstream handling (e.g. surfacing in the admin UI). The booking is
 * NEVER reverted because commissions couldn't be snapshotted.
 *
 * @param paymentMethod  v1 default 'card', applied uniformly to every
 *                       participant row on the booking (one PI per booking).
 *                       Workspace marks off-platform via the separate
 *                       `setBookingPaymentMethod` action.
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
  if (!Array.isArray(ctx.participants) || ctx.participants.length === 0) {
    return { ok: false, reason: "context_load_failed", detail: "no_participants" };
  }

  // P4: the context RPC doesn't carry the client/seller split ratio; fetch it
  // so the resolver applies the admin-set split instead of the even-split
  // default. Non-fatal — on any error the resolver falls back to even split.
  try {
    const splitRes = (await supabase.rpc(
      "engine_platform_commission_split" as never,
    )) as { data: number | null };
    if (typeof splitRes.data === "number") {
      ctx.platform_config = {
        ...ctx.platform_config,
        client_surcharge_bps: splitRes.data,
      };
    }
  } catch {
    /* even-split default applies */
  }

  // Phase C — hub referral lane. Gated on the HUB_REFERRAL_LANE flag (default
  // off): when off the rate is forced to 0, so the resolver produces a 0
  // referral and the result is byte-identical to pre-Phase-C. When on, the
  // per-channel rate from the RPC drives the lane (still 0 for any unconfigured
  // channel). The channel party + managing home tenant come from the context.
  const hubReferralLaneOn = process.env.HUB_REFERRAL_LANE === "1";
  const hubReferralBps = hubReferralLaneOn ? (ctx.hub_referral_bps ?? 0) : 0;
  const channelPartyId = ctx.source_workspace_id ?? null;
  const homeTenantId = ctx.home_tenant_id ?? null;

  // 2. Resolve per participant (pure — no IO inside the loop).
  const snapshots: ParticipantSnapshot[] = [];
  try {
    for (const p of ctx.participants) {
      // P4c: surface this workspace's base reservation fee + the platform caps
      // (the context RPC doesn't carry them). Workspace sellers only; non-fatal.
      let platformConfig = ctx.platform_config;
      let tenantOverride = p.tenant_override;
      let relationshipOverride: RelationshipCommissionOverride | null = null;
      if (p.tenant_id && p.talent_profile_id) {
        try {
          const { data: rel } = await supabase
            .from("workspace_talent_commission_overrides")
            .select("platform_take_bps, platform_take_floor_cents, workspace_take_bps")
            .eq("tenant_id", p.tenant_id)
            .eq("talent_profile_id", p.talent_profile_id)
            .maybeSingle();
          if (rel) {
            relationshipOverride = {
              platform_take_bps: rel.platform_take_bps ?? null,
              platform_take_floor_cents: rel.platform_take_floor_cents ?? null,
              workspace_take_bps: rel.workspace_take_bps ?? null,
            };
          }
        } catch {
          /* relationship override is non-fatal — tenant/plan still apply */
        }
      }
      if (p.owning_party_type !== "talent" && p.tenant_id) {
        try {
          const feeRes = (await supabase.rpc(
            "engine_workspace_base_fee_inputs" as never,
            { p_tenant_id: p.tenant_id } as never,
          )) as {
            data: {
              base_reservation_fee_cents: number | null;
              base_reservation_fee_bps: number | null;
              max_base_fee_cents: number | null;
              max_base_fee_bps: number | null;
            } | null;
          };
          const f = feeRes.data;
          if (f) {
            platformConfig = {
              ...ctx.platform_config,
              max_base_fee_cents: f.max_base_fee_cents,
              max_base_fee_bps: f.max_base_fee_bps,
            };
            tenantOverride = {
              ...(p.tenant_override ?? { platform_take_bps: null, platform_take_floor_cents: null }),
              base_reservation_fee_cents: f.base_reservation_fee_cents,
              base_reservation_fee_bps: f.base_reservation_fee_bps,
            };
          }
        } catch {
          /* base fee non-fatal — resolver defaults it to 0 */
        }
      }

      const base = resolveBookingCommissions({
        // tenantId is an input field but isn't consumed by the math.
        // For independents we pass the owning_party_id (the talent's id)
        // so traceability still has a value to surface.
        tenantId: p.tenant_id ?? p.owning_party_id,
        workspacePlan: normalizePlan(p.workspace_plan),
        // Seller of record drives who bears the seller-side platform fee.
        // owning_party_type='talent' → the independent talent sells direct and
        // bears it; agency/workspace → the workspace bears it and the talent is
        // paid their full quote (protected).
        sellerOfRecord: p.owning_party_type === "talent" ? "talent" : "workspace",
        offerLineItems: p.offer_line_items as OfferLineItemForResolver[],
        currencyCode: ctx.currency_code,
        paymentMethod,
        offPlatformReason,
        platformConfig,
        tenantOverride,
        relationshipOverride,
        bookingPlatformTakeBpsOverride,
        // Phase C — referral applies only to workspace-seller rows; the resolver
        // itself no-ops the lane for independent talent + when channel === home.
        hubReferralBps,
        channelPartyId,
        homeTenantId,
      });
      snapshots.push({
        ...base,
        participant_id: p.participant_id,
        owning_party_type: p.owning_party_type,
        owning_party_id: p.owning_party_id,
      });
    }
  } catch (err) {
    const code = err instanceof CommissionResolutionError ? err.code : "unknown";
    logServerError(`commission-engine/resolve_failed[${code}][booking=${bookingId}]`, err);
    return { ok: false, reason: "resolver_failed", detail: code };
  }

  // 2b. Booking-level lane reconciliation (P1 hardening — multi-talent drift).
  //     Each row already balances per the per-ROW invariant, so summing N rows
  //     is exact and `driftCents` is 0 for the current resolver. This is a
  //     DEFENSIVE assertion: if a future change ever leaves the booking-level
  //     Σ(lanes) off from Σ(gross_charged) (cents silently stuck on the platform
  //     balance), we log it loudly AND apply a single correcting cent adjustment
  //     to the platform fee of the largest-gross participant so the persisted
  //     snapshot still sums exactly to what the client was charged.
  const recon = reconcileBookingLanes(snapshots);
  if (recon.driftCents !== 0 && recon.adjustParticipantId) {
    logServerError(
      `commission-engine/lane_drift[booking=${bookingId}]`,
      new Error(
        `booking lanes drifted ${recon.driftCents} cents (laneTotal=${recon.laneTotalCents} grossCharged=${recon.grossChargedTotalCents}) — correcting platform_fee on participant ${recon.adjustParticipantId}`,
      ),
    );
    for (const s of snapshots) {
      if (s.participant_id === recon.adjustParticipantId) {
        s.platform_fee_cents += recon.driftCents;
        break;
      }
    }
  }

  // 3. Persist via the engine RPC (atomic — N snapshot rows + (for any
  //    off-platform rows) per-row accrual + balance bump against the
  //    OWNING tenant). Single round-trip with the JSONB array payload.
  const { error: persistError } = await supabase
    .rpc("engine_persist_booking_commission_snapshot", {
      p_booking_id: bookingId,
      p_rows: snapshots.map((s) => ({
        participant_id: s.participant_id,
        owning_party_type: s.owning_party_type,
        owning_party_id: s.owning_party_id,
        platform_take_bps: s.platform_take_bps,
        platform_take_floor_cents: s.platform_take_floor_cents,
        gross_cents: s.gross_cents,
        platform_fee_cents: s.platform_fee_cents,
        workspace_fee_cents: s.workspace_fee_cents,
        talent_net_cents: s.talent_net_cents,
        client_surcharge_cents: s.client_surcharge_cents,
        seller_deduction_cents: s.seller_deduction_cents,
        gross_charged_cents: s.gross_charged_cents,
        seller_shortfall_cents: s.seller_shortfall_cents,
        channel_referral_cents: s.channel_referral_cents,
        channel_referral_party_id: s.channel_referral_party_id,
        currency_code: s.currency_code,
        payment_method: s.payment_method,
        off_platform_reason: s.off_platform_reason,
        resolved_from: s.resolved_from,
      })),
    });

  if (persistError) {
    logServerError(`commission-engine/persist_failed[booking=${bookingId}]`, persistError);
    return { ok: false, reason: "persist_failed", detail: persistError.message };
  }

  // Audit emit — fire-and-forget. Aggregate the lane totals across
  // participants so the audit payload stays stable for any consumers.
  // Failure must never surface to callers.
  const totals = snapshots.reduce(
    (acc, s) => ({
      platform_fee_cents: acc.platform_fee_cents + s.platform_fee_cents,
      workspace_fee_cents: acc.workspace_fee_cents + s.workspace_fee_cents,
      talent_fee_cents: acc.talent_fee_cents + s.talent_net_cents,
    }),
    { platform_fee_cents: 0, workspace_fee_cents: 0, talent_fee_cents: 0 },
  );
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
        participant_count: snapshots.length,
        ...totals,
      },
    }).then((r) => { if (r.error) logServerError("audit.emit.commission_split_changed", r.error); });
  }

  return { ok: true, snapshots };
}

/** Load all per-participant snapshots for a booking. Reads through normal
 *  RLS (the policy already covers platform admins + home-tenant staff +
 *  owning-tenant staff). Ordered by participant_id for deterministic UI. */
export async function loadBookingCommissionSnapshots(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<PersistedBookingCommissionSnapshot[]> {
  const { data, error } = await supabase
    .from("booking_commission_snapshot")
    .select("*")
    .eq("booking_id", bookingId)
    .order("participant_id", { ascending: true });

  if (error) {
    logServerError(`commission-engine/load_snapshots[booking=${bookingId}]`, error);
    return [];
  }
  return (data ?? []) as PersistedBookingCommissionSnapshot[];
}

/** Single-row legacy helper — returns the first snapshot row for a booking,
 *  or null. Maintained for callers that only need to know whether *any*
 *  commission has been recorded (e.g. the "payment method already set"
 *  guard). For lane totals, use {@link loadBookingCommissionSnapshots} and
 *  sum. */
export async function loadBookingCommissionSnapshot(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<PersistedBookingCommissionSnapshot | null> {
  const rows = await loadBookingCommissionSnapshots(supabase, bookingId);
  return rows[0] ?? null;
}

/** Sum the platform_fee_cents across every participant snapshot on a
 *  booking. This is what Stripe needs as the application fee. */
export async function sumBookingPlatformFeeCents(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const rows = await loadBookingCommissionSnapshots(supabase, bookingId);
  return rows.reduce((sum, r) => sum + r.platform_fee_cents, 0);
}

/** Sum the client-side surcharge across every participant snapshot on a
 *  booking — the platform's client-side half, added ON TOP of the subtotal.
 *  The booking transaction adds this so the client is billed `gross_charged`
 *  (subtotal + surcharge) and the platform actually collects its client share.
 *  Returns 0 when no snapshot exists yet (charge the bare subtotal). */
export async function sumBookingClientSurchargeCents(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const rows = await loadBookingCommissionSnapshots(supabase, bookingId);
  return rows.reduce((sum, r) => sum + (r.client_surcharge_cents ?? 0), 0);
}

/** Sum gross_charged_cents across the booking's snapshots — the FULL amount
 *  the client is charged: subtotal + client surcharge + workspace base fee.
 *  This is what the booking transaction should bill so everything the
 *  workspace/platform is paid was actually collected. Returns 0 when no
 *  snapshot exists yet (the caller falls back to the bare booking revenue). */
export async function sumBookingGrossChargedCents(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const rows = await loadBookingCommissionSnapshots(supabase, bookingId);
  return rows.reduce((sum, r) => sum + (r.gross_charged_cents ?? 0), 0);
}
