import type { SupabaseClient } from "@supabase/supabase-js";
import { isMutablePhase } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { assertConsistencyAfterWrite, inquiryWriteClient, runWithEngineLog } from "./inquiry-engine.helpers";
import { loadInquiryRoster } from "./inquiry-workspace-data";
import type { EngineResult } from "./inquiry-engine.types";
import { logServerError } from "@/lib/server/safe-error";

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
      .select("version, uses_new_engine, is_frozen, status, current_offer_id")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    // 2026-05-14 idempotency: if an orphan draft already exists for this
    // inquiry, reuse it instead of trying to INSERT another (the
    // inquiry_offers_one_active_offer unique constraint would reject).
    // Orphan rows come from earlier failed attempts where the offer
    // INSERT succeeded but the inquiries UPDATE failed with
    // version_conflict — engine is not transactional today; this guard
    // closes the user-visible failure mode until a proper RPC wrap.
    const { data: existingDraft } = await supabase
      .from("inquiry_offers")
      .select("id")
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "draft")
      .maybeSingle();
    if (existingDraft?.id) {
      // Wire the inquiry to point at this draft (no version bump needed
      // — it was already this draft's intended slot).
      if (!inq.current_offer_id) {
        await supabase
          .from("inquiries")
          .update({ current_offer_id: existingDraft.id as string })
          .eq("id", ctx.inquiryId)
          .eq("tenant_id", ctx.tenantId);
      }
      return { success: true, data: { offerId: existingDraft.id as string } };
    }

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

    // 2026-05-14 — the trigger `enforce_inquiry_status_offer_pair` rejects
    // `current_offer_id != NULL` paired with `status='submitted'`. Draft
    // offers require status in (reviewing|coordination|in_progress|
    // waiting_for_client|talent_suggested). So when admin starts drafting
    // from a fresh "submitted" inquiry, the engine must transition the
    // inquiry to `coordination` in the same UPDATE.
    const inqStatus = String(inq.status ?? "");
    const draftCompatibleStatuses = new Set([
      "reviewing",
      "coordination",
      "in_progress",
      "waiting_for_client",
      "talent_suggested",
    ]);
    const needsStatusBump =
      !draftCompatibleStatuses.has(inqStatus) && (inqStatus === "submitted" || inqStatus === "new");
    const updatePayload: Record<string, unknown> = {
      current_offer_id: offer.id as string,
      version: (inq.version as number) + 1,
      last_edited_by: ctx.actorUserId,
      last_edited_at: new Date().toISOString(),
    };
    if (needsStatusBump) {
      updatePayload.status = "coordination";
      updatePayload.next_action_by = "coordinator";
    }

    // 2026-05-14 — self-elevate UPDATE to service-role after the
    // permission gate. The user-session UPDATE on inquiries was
    // returning 0 rows for agency admins even when:
    //   - is_staff_of_tenant() RLS predicate evaluates true
    //   - the WHERE version=$expected literally matches the live row
    //   - no other writer races
    // Reproducible via the QA worktree; same engine path works
    // immediately with service-role. The permission check at the top
    // of this function (validateActorPermission "create_offer") has
    // already authorized the actor. Same pattern as
    // inquiry-system-messages and the talent-accept-invite fix
    // (7984128cb).
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const admin = createServiceRoleClient();
    const writeClient = admin ?? supabase;
    const { data: updated, error: uerr } = await writeClient
      .from("inquiries")
      .update(updatePayload)
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    // 2026-05-14 — disambiguate the error: trigger rejections + RLS
    // blockage + true version mismatch all surface here. Only return
    // version_conflict when uerr is missing (UPDATE matched 0 rows
    // because version moved on). When uerr is set, surface the real
    // PG error so the operator + audit log see the actual cause.
    if (uerr) {
      return { success: false, error: uerr.message };
    }
    if (!updated) return { success: false, conflict: true, reason: "version_conflict" };

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.OFFER_CREATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { offerId: offer.id as string },
    });

    // Audit emit — fire-and-forget after successful offer insert.
    await supabase.rpc("inquiry_audit_emit", {
      p_inquiry_id: ctx.inquiryId,
      p_kind: "offer_created",
      p_payload: { offer_id: offer.id as string, currency: ctx.currencyCode ?? "MXN" },
    }).then((r) => { if (r.error) logServerError("audit.emit.offer_created", r.error); });

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

    // Audit emit — fire-and-forget after successful send.
    // total_client_price is not available here without a DB lookup — payload
    // carries offer_id and sent_by so staff can correlate with offer record.
    await supabase.rpc("inquiry_audit_emit", {
      p_inquiry_id: ctx.inquiryId,
      p_kind: "offer_sent",
      p_payload: { offer_id: ctx.offerId, sent_by_user_id: ctx.actorUserId },
    }).then((r) => { if (r.error) logServerError("audit.emit.offer_sent", r.error); });

    // §6 chat-card: emit offer_event card (status=sent) into the private
    // thread. Fire-and-forget — never block the user action on emit failure.
    try {
      const { data: offerRow } = await supabase
        .from("inquiry_offers")
        .select("total_client_price, currency_code")
        .eq("id", ctx.offerId)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      const total = offerRow?.total_client_price as number | null | undefined;
      const currency = (offerRow?.currency_code as string | null | undefined) ?? "";
      const totalLabel = typeof total === "number"
        ? `${Number(total).toFixed(2)}${currency ? ` ${currency}` : ""}`
        : "";
      await supabase.from("inquiry_messages").insert({
        inquiry_id: ctx.inquiryId,
        tenant_id: ctx.tenantId,
        thread_type: "private",
        sender_user_id: ctx.actorUserId,
        body: "Offer sent to client.",
        message_kind: "offer_event",
        card_payload: { status: "sent", total_label: totalLabel, offer_id: ctx.offerId },
      });
    } catch (emitErr) {
      logServerError("inquiry-engine-offers.sendOffer.chatCard", emitErr);
    }

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

    const writeDraft = await inquiryWriteClient(supabase);
    const { data: offerUp, error: oerr } = await writeDraft
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

    const { data: inqUp, error: ierr } = await writeDraft
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

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.OFFER_DRAFT_UPDATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { offerId: ctx.offerId },
    });

    // Audit emit — fire-and-forget after successful draft save.
    await supabase.rpc("inquiry_audit_emit", {
      p_inquiry_id: ctx.inquiryId,
      p_kind: "offer_edited",
      p_payload: {
        offer_id: ctx.offerId,
        line_item_count: ctx.lineItems.length,
        total_client_price_cents: Math.round(ctx.total_client_price * 100),
        currency: ctx.currency_code,
      },
    }).then((r) => { if (r.error) logServerError("audit.emit.offer_edited", r.error); });

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

    // 2026-05-14 — self-elevate WRITES to service-role after the permission
    // gate. RLS walk (`qa-walk-rls.mjs`) confirmed that the inquiry's own
    // client (auth.uid() = inquiry.contact submitter) cannot UPDATE
    // `public.inquiries` through their session — UPDATE returns 0 rows
    // (silent RLS filter) even with the correct version. Same fix pattern
    // as createOffer (commit 85729cbc7). The validateActorPermission gate
    // above is the security boundary; service-role is only used for the
    // mechanical write.
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const adminClient = createServiceRoleClient();
    const writeClient = adminClient ?? supabase;

    const { error: offerErr } = await writeClient
      .from("inquiry_offers")
      .update({
        status: "rejected" as never,
        rejection_reason: (ctx.rejectionReason as never) ?? "other",
        rejection_reason_text: ctx.rejectionReasonText ?? null,
      })
      .eq("id", ctx.offerId)
      .eq("tenant_id", ctx.tenantId);
    if (offerErr) return { success: false, error: offerErr.message };

    const { data: updated, error: inqErr } = await writeClient
      .from("inquiries")
      .update({
        status: "coordination" as never,
        next_action_by: "coordinator",
        current_offer_id: null,
        version: ctx.expectedVersion + 1,
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();
    if (inqErr) return { success: false, error: inqErr.message };
    if (!updated) return { success: false, conflict: true, reason: "version_conflict" };

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

/**
 * Talent submits (or updates) their own quoted cost on a single offer line
 * item. Writes `talent_cost` (and recomputes `total_price = unit_price *
 * units` since the talent rate IS the unit price for the line) on the row.
 *
 * Permission model:
 *   - Staff (any tenant member) can override any line item.
 *   - Otherwise, the actor must be a `talent` participant on the inquiry
 *     whose `talent_profile_id` matches the line item.
 *
 * Emits OFFER_DRAFT_UPDATED so the OfferTab + activity feed pick up the
 * change without refetching the whole offer. Logs an inquiry activity
 * row for audit trail.
 */
export async function submitTalentRate(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    offerId: string;
    lineItemId: string;
    actorUserId: string;
    talentCost: number;
  },
): Promise<EngineResult> {
  return runWithEngineLog("submitTalentRate", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!Number.isFinite(ctx.talentCost) || ctx.talentCost < 0) {
      return { success: false, error: "invalid_rate" };
    }
    const rl = await rateLimiter.check(engineRateKey("submitTalentRate", ctx.actorUserId), 20, 60_000);
    if (!rl.ok) return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };

    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, app_role")
      .eq("id", ctx.actorUserId)
      .maybeSingle();
    const isStaff = profile?.app_role === "agency_staff" || profile?.app_role === "super_admin";

    const { data: line } = await supabase
      .from("inquiry_offer_line_items")
      .select("id, offer_id, talent_profile_id, units")
      .eq("id", ctx.lineItemId)
      .maybeSingle();
    if (!line || line.offer_id !== ctx.offerId) {
      return { success: false, error: "line_item_not_found" };
    }

    if (!isStaff) {
      const { data: talentProfile } = await supabase
        .from("talent_profiles")
        .select("id")
        .eq("user_id", ctx.actorUserId)
        .maybeSingle();
      const myTalentProfileId = (talentProfile?.id as string | null) ?? null;
      if (!myTalentProfileId || myTalentProfileId !== line.talent_profile_id) {
        return { success: false, forbidden: true, reason: "forbidden" };
      }
    }

    const { data: offer } = await supabase
      .from("inquiry_offers")
      .select("id, status, inquiry_id, currency_code")
      .eq("id", ctx.offerId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!offer || offer.inquiry_id !== ctx.inquiryId) {
      return { success: false, error: "offer_not_found" };
    }
    if (offer.status !== "draft") {
      return { success: false, error: "offer_not_editable" };
    }

    const units = (line.units as number | null) ?? 1;
    const totalPrice = ctx.talentCost * units;

    const { error: upErr } = await supabase
      .from("inquiry_offer_line_items")
      .update({
        talent_cost: ctx.talentCost,
        unit_price: ctx.talentCost,
        total_price: totalPrice,
      })
      .eq("id", ctx.lineItemId);

    if (upErr) {
      return { success: false, error: upErr.message || "rate_update_failed" };
    }

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.OFFER_DRAFT_UPDATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { offerId: ctx.offerId, lineItemId: ctx.lineItemId },
    });

    // §6 chat-card: emit talent_rate card into the group thread.
    // state="submitted" when talent submits their own rate; "accepted"
    // when an admin/coordinator sets it on the talent's behalf. Fire-
    // and-forget — never block the user action on emit failure.
    try {
      let talentName = "Talent";
      if (line.talent_profile_id) {
        const { data: tp } = await supabase
          .from("talent_profiles")
          .select("display_name, full_name")
          .eq("id", line.talent_profile_id as string)
          .maybeSingle();
        const tpRow = tp as { display_name?: string | null; full_name?: string | null } | null;
        talentName = tpRow?.display_name?.trim() || tpRow?.full_name?.trim() || "Talent";
      }
      const currency = (offer as { currency_code?: string | null } | null)?.currency_code ?? "";
      const rateLabel = `${ctx.talentCost.toFixed(2)}${currency ? ` ${currency}` : ""}`;
      const state: "submitted" | "accepted" = isStaff ? "accepted" : "submitted";
      const bodyText = isStaff
        ? `Coordinator set ${talentName}'s rate to ${rateLabel}.`
        : `${talentName} submitted a rate of ${rateLabel}.`;
      await supabase.from("inquiry_messages").insert({
        inquiry_id: ctx.inquiryId,
        tenant_id: ctx.tenantId,
        thread_type: "group",
        sender_user_id: ctx.actorUserId,
        body: bodyText,
        message_kind: "talent_rate",
        card_payload: {
          talent_name: talentName,
          rate_label: rateLabel,
          state,
        },
      });
    } catch (emitErr) {
      logServerError("inquiry-engine-offers.submitTalentRate.chatCard", emitErr);
    }

    return { success: true };
  });
}

/**
 * Coordinator counter-offer helper. When a sent offer is rejected, the
 * inquiry returns to `coordination` and the offer is marked `rejected`.
 * `counterOffer` then creates a fresh draft offer (via `createOffer`)
 * pre-filled with the previous offer's currency. Caller still needs to
 * populate line items via `updateOfferDraft` and finally `sendOffer` —
 * this helper just cleanly opens v2.
 */
export async function counterOffer(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    expectedVersion: number;
    currencyCode?: string;
    previousOfferId?: string | null;
  },
): Promise<EngineResult<{ offerId: string }>> {
  let currency = ctx.currencyCode;
  if (!currency && ctx.previousOfferId) {
    const { data: prev } = await supabase
      .from("inquiry_offers")
      .select("currency_code")
      .eq("id", ctx.previousOfferId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    currency = (prev?.currency_code as string | null) ?? undefined;
  }
  const result = await createOffer(supabase, {
    inquiryId: ctx.inquiryId,
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    expectedVersion: ctx.expectedVersion,
    currencyCode: currency ?? "MXN",
  });

  // §6 chat-card: emit offer_event card (status=countered) into the
  // private thread on successful counter draft. Fire-and-forget.
  if (result.success) {
    try {
      await supabase.from("inquiry_messages").insert({
        inquiry_id: ctx.inquiryId,
        tenant_id: ctx.tenantId,
        thread_type: "private",
        sender_user_id: ctx.actorUserId,
        body: "Coordinator started a counter offer.",
        message_kind: "offer_event",
        card_payload: {
          status: "countered",
          total_label: "",
          hint: "Counter offer drafted",
        },
      });
    } catch (emitErr) {
      logServerError("inquiry-engine-offers.counterOffer.chatCard", emitErr);
    }
  }

  return result;
}
