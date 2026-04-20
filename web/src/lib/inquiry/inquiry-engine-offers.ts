import type { SupabaseClient } from "@supabase/supabase-js";
import { isMutablePhase } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { logInquiryActivity } from "@/lib/server/commercial-audit";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import { loadInquiryRoster } from "./inquiry-workspace-data";
import type { EngineResult } from "./inquiry-engine.types";

// SaaS P1.B STEP A: tenant-scoped by construction on every inquiry + offers
// read/write. RPC-backed helpers also pre-flight the inquiry's tenant ownership
// so cross-tenant ids are rejected before the SECURITY DEFINER call.

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

async function ensureClientParticipant(
  supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
  clientUserId: string | null,
): Promise<void> {
  if (!clientUserId) return;
  const { data: existing } = await supabase
    .from("inquiry_participants")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("role", "client")
    .maybeSingle();
  if (existing) return;
  await supabase.from("inquiry_participants").insert({
    inquiry_id: inquiryId,
    tenant_id: tenantId,
    user_id: clientUserId,
    role: "client",
    status: "active",
  });
}

async function seedApprovalsForOffer(
  supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
  offerId: string,
): Promise<void> {
  const { data: inq } = await supabase
    .from("inquiries")
    .select("client_user_id")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  await ensureClientParticipant(supabase, inquiryId, tenantId, (inq?.client_user_id as string | null) ?? null);

  const { data: clientPart } = await supabase
    .from("inquiry_participants")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("role", "client")
    .maybeSingle();

  const roster = await loadInquiryRoster(supabase, inquiryId);
  const activeTalents = roster.filter((r) => r.status === "active");

  const rows: { inquiry_id: string; tenant_id: string; offer_id: string; participant_id: string; status: string }[] = [];
  if (clientPart) {
    rows.push({
      inquiry_id: inquiryId,
      tenant_id: tenantId,
      offer_id: offerId,
      participant_id: clientPart.id as string,
      status: "pending",
    });
  }
  for (const t of activeTalents) {
    const { data: tp } = await supabase
      .from("inquiry_participants")
      .select("id")
      .eq("inquiry_id", inquiryId)
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", t.talentProfileId)
      .eq("role", "talent")
      .maybeSingle();
    if (tp) {
      rows.push({
        inquiry_id: inquiryId,
        tenant_id: tenantId,
        offer_id: offerId,
        participant_id: tp.id as string,
        status: "pending",
      });
    }
  }

  if (rows.length) {
    await supabase.from("inquiry_approvals").insert(rows);
  }
}

// Exported for API route compatibility — currently unused in engine paths.
export { seedApprovalsForOffer };

export async function createOffer(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    expectedVersion: number;
    currencyCode?: string;
  },
): Promise<EngineResult<{ offerId: string }>> {
  return runWithEngineLog("createOffer", ctx.inquiryId, ctx.actorUserId, async () => {
    const rl = await rateLimiter.check(engineRateKey("createOffer", ctx.actorUserId), 10, 60 * 60_000);
    if (!rl.ok) return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "create_offer");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen, status")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    const { data: offer, error } = await supabase
      .from("inquiry_offers")
      .insert({
        inquiry_id: ctx.inquiryId,
        tenant_id: ctx.tenantId,
        created_by_user_id: ctx.actorUserId,
        currency_code: ctx.currencyCode ?? "MXN",
        status: "draft",
      })
      .select("id")
      .single();

    if (error || !offer) return { success: false, error: error?.message ?? "offer_insert_failed" };

    const { data: updated, error: uerr } = await supabase
      .from("inquiries")
      .update({
        current_offer_id: offer.id as string,
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (uerr || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "offer_created",
      payload: { offer_id: offer.id },
    });

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.OFFER_CREATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { offerId: offer.id as string },
    });

    return { success: true, data: { offerId: offer.id as string } };
  });
}

export async function sendOffer(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; offerId: string; actorUserId: string; inquiryExpectedVersion: number; offerExpectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("sendOffer", ctx.inquiryId, ctx.actorUserId, async () => {
    const rl = await rateLimiter.check(engineRateKey("sendOffer", ctx.actorUserId), 5, 60 * 60_000);
    if (!rl.ok) return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };

    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "send_offer");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data, error } = await supabase.rpc("engine_send_offer", {
      p_inquiry_id: ctx.inquiryId,
      p_offer_id: ctx.offerId,
      p_actor_user_id: ctx.actorUserId,
      p_inquiry_expected_version: ctx.inquiryExpectedVersion,
      p_offer_expected_version: ctx.offerExpectedVersion,
    });

    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("version_conflict")) return { success: false, conflict: true, reason: "version_conflict" };
      if (msg.includes("inquiry_frozen")) return { success: false, reason: "inquiry_frozen" };
      if (msg.includes("legacy_inquiry")) return { success: false, error: "legacy_inquiry" };
      if (msg.includes("offer_not_found")) return { success: false, error: "offer_not_found" };
      return { success: false, error: msg || "send_offer_failed" };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === "object") {
      const oV = (row as Record<string, unknown>).next_offer_version;
      if (typeof oV === "number" && oV === ctx.offerExpectedVersion) {
        // already sent (idempotent)
        return { success: true, already: true };
      }
    }

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.OFFER_SENT,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { offerId: ctx.offerId },
      systemMessage: {
        threadType: "private",
        body: "Offer sent to client.",
        eventType: "offer_sent",
      },
    });

    return { success: true };
  });
}

const PRICING_UNITS = new Set(["hour", "day", "week", "event"]);

export type OfferLineDraft = {
  talent_profile_id: string | null;
  label: string | null;
  pricing_unit: "hour" | "day" | "week" | "event";
  units: number;
  unit_price: number;
  total_price: number;
  talent_cost: number;
  notes: string | null;
  sort_order: number;
};

/**
 * Replace draft offer line items and pricing fields (coordinator/staff).
 */
export async function updateOfferDraft(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    offerId: string;
    actorUserId: string;
    inquiryExpectedVersion: number;
    offerExpectedVersion: number;
    total_client_price: number;
    coordinator_fee: number;
    currency_code: string;
    notes: string | null;
    lineItems: OfferLineDraft[];
  },
): Promise<EngineResult> {
  return runWithEngineLog("updateOfferDraft", ctx.inquiryId, ctx.actorUserId, async () => {
    const rl = await rateLimiter.check(engineRateKey("createOffer", ctx.actorUserId), 10, 60 * 60_000);
    if (!rl.ok) {
      return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "update_offer");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen, status")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };
    if (!isMutablePhase(inq.status as string, !!inq.is_frozen)) {
      return { success: false, reason: "post_booking_immutable" };
    }

    const { data: offer } = await supabase
      .from("inquiry_offers")
      .select("id, inquiry_id, status, version")
      .eq("id", ctx.offerId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (!offer || offer.inquiry_id !== ctx.inquiryId) return { success: false, error: "offer_not_found" };
    if (offer.status !== "draft") return { success: false, error: "offer_not_editable" };
    if ((offer.version as number) !== ctx.offerExpectedVersion) {
      return { success: false, conflict: true, reason: "version_conflict" };
    }

    for (const line of ctx.lineItems) {
      if (!PRICING_UNITS.has(line.pricing_unit)) {
        return { success: false, error: "invalid_pricing_unit" };
      }
    }

    await supabase
      .from("inquiry_offer_line_items")
      .delete()
      .eq("offer_id", ctx.offerId)
      .eq("tenant_id", ctx.tenantId);

    for (const line of ctx.lineItems) {
      const { error: liErr } = await supabase.from("inquiry_offer_line_items").insert({
        offer_id: ctx.offerId,
        tenant_id: ctx.tenantId,
        talent_profile_id: line.talent_profile_id,
        label: line.label,
        pricing_unit: line.pricing_unit as never,
        units: line.units,
        unit_price: line.unit_price,
        total_price: line.total_price,
        talent_cost: line.talent_cost,
        notes: line.notes,
        sort_order: line.sort_order,
      });
      if (liErr) return { success: false, error: liErr.message };
    }

    const { data: offerUp, error: oerr } = await supabase
      .from("inquiry_offers")
      .update({
        total_client_price: ctx.total_client_price,
        coordinator_fee: ctx.coordinator_fee,
        currency_code: ctx.currency_code,
        notes: ctx.notes,
        version: (offer.version as number) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.offerId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.offerExpectedVersion)
      .select("id")
      .maybeSingle();

    if (oerr || !offerUp) return { success: false, conflict: true, reason: "version_conflict" };

    const { data: inqUp, error: ierr } = await supabase
      .from("inquiries")
      .update({
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.inquiryExpectedVersion)
      .select("id")
      .maybeSingle();

    if (ierr || !inqUp) return { success: false, conflict: true, reason: "version_conflict" };

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "offer_draft_updated",
      payload: { offer_id: ctx.offerId },
    });

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.OFFER_DRAFT_UPDATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { offerId: ctx.offerId },
    });

    return { success: true };
  });
}

export async function clientRejectOffer(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    offerId: string;
    actorUserId: string;
    expectedVersion: number;
    rejectionReason?: string | null;
    rejectionReasonText?: string | null;
  },
): Promise<EngineResult> {
  return runWithEngineLog("clientRejectOffer", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "client_reject_offer");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    await supabase
      .from("inquiry_offers")
      .update({
        status: "rejected" as never,
        rejection_reason: (ctx.rejectionReason as never) ?? "other",
        rejection_reason_text: ctx.rejectionReasonText ?? null,
      })
      .eq("id", ctx.offerId)
      .eq("tenant_id", ctx.tenantId);

    await supabase
      .from("inquiries")
      .update({
        status: "coordination" as never,
        next_action_by: "coordinator",
        current_offer_id: null,
        version: ctx.expectedVersion + 1,
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "client_rejected_offer",
      payload: { offer_id: ctx.offerId },
    });

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.OFFER_CLIENT_REJECTED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { offerId: ctx.offerId, reason: ctx.rejectionReason ?? "other" },
      systemMessage: {
        threadType: "private",
        body: "Client rejected the offer.",
        eventType: "offer_rejected",
      },
    });

    return { success: true };
  });
}
