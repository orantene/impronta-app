/**
 * Hold-the-send, app half (the SQL half is 20261231357000).
 *
 * `releaseOfferToClient`: everything the client sees when an offer reaches them: the OFFER_SENT event
 * (client notifications), the audit row, the private-thread card and the talent group-thread card.
 * Used by `sendOffer` for an offer that is not held, and by `submitApproval` when the last talent
 * approval releases a held one (which also restarts the client's validity clock).
 *
 * `announceHeldOffer`: what staff and talent see instead while it is held. NOTHING here is client
 * visible: the private thread is the client thread, so the staff line is an `internal_note`
 * (client readers exclude that kind) and the only card is the talent-facing group-thread one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { logServerError } from "@/lib/server/safe-error";

export const DEFAULT_OFFER_EXPIRY_DAYS = 7;

type Ctx = { inquiryId: string; tenantId: string; offerId: string; actorUserId: string };

/** The event emitter is injectable so the tests can see exactly what a client could be notified of. */
export type OfferReleaseDeps = { emit: typeof emitStandardEngineEvent };
const REAL_DEPS: OfferReleaseDeps = { emit: emitStandardEngineEvent };

async function offerTotalLabel(supabase: SupabaseClient, ctx: Ctx): Promise<string> {
  const { data: offerRow } = await supabase
    .from("inquiry_offers")
    .select("total_client_price, currency_code")
    .eq("id", ctx.offerId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  const total = offerRow?.total_client_price as number | null | undefined;
  const currency = (offerRow?.currency_code as string | null | undefined) ?? "";
  return typeof total === "number" ? `${Number(total).toFixed(2)}${currency ? ` ${currency}` : ""}` : "";
}

async function insertTalentGroupCard(supabase: SupabaseClient, ctx: Ctx): Promise<void> {
  // Talent-facing mirror: assigned talents read the GROUP (booking-team) thread. Amount-free on
  // purpose (the shared thread must not leak the client total or another talent's rate).
  await supabase.from("inquiry_messages").insert({
    inquiry_id: ctx.inquiryId,
    tenant_id: ctx.tenantId,
    thread_type: "group",
    sender_user_id: ctx.actorUserId,
    body: "You've received an offer — open the Offer tab to review and approve.",
    message_kind: "offer_event",
    card_payload: { status: "sent", total_label: "", offer_id: ctx.offerId },
  });
}

export async function releaseOfferToClient(
  supabase: SupabaseClient,
  ctx: Ctx & {
    /** True when a held offer is being released: restart the client's validity window now. */
    restampExpiry?: boolean;
    /** The talent group-thread card already exists (a held offer announced it at send time). */
    skipTalentCard?: boolean;
  },
  deps: OfferReleaseDeps = REAL_DEPS,
): Promise<void> {
  if (ctx.restampExpiry) {
    const validUntil = new Date(Date.now() + DEFAULT_OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("inquiry_offers")
      .update({ valid_until: validUntil })
      .eq("id", ctx.offerId)
      .eq("tenant_id", ctx.tenantId);
    if (error) logServerError("offer-release.restampExpiry", error);
  }

  await deps.emit(supabase, {
    type: ENGINE_EVENT_TYPES.OFFER_SENT,
    inquiryId: ctx.inquiryId,
    actorUserId: ctx.actorUserId,
    data: { offerId: ctx.offerId },
    systemMessage: { threadType: "private", body: "Offer sent to client.", eventType: "offer_sent" },
  });

  await supabase
    .rpc("inquiry_audit_emit", {
      p_inquiry_id: ctx.inquiryId,
      p_kind: "offer_sent",
      p_payload: { offer_id: ctx.offerId, sent_by_user_id: ctx.actorUserId },
    })
    .then((r) => {
      if (r.error) logServerError("audit.emit.offer_sent", r.error);
    });

  // §6 chat-card: fire-and-forget, never block the user action on an emit failure.
  try {
    const totalLabel = await offerTotalLabel(supabase, ctx);
    await supabase.from("inquiry_messages").insert({
      inquiry_id: ctx.inquiryId,
      tenant_id: ctx.tenantId,
      thread_type: "private",
      sender_user_id: ctx.actorUserId,
      body: "Offer sent to client.",
      message_kind: "offer_event",
      card_payload: { status: "sent", total_label: totalLabel, offer_id: ctx.offerId },
    });
    if (!ctx.skipTalentCard) await insertTalentGroupCard(supabase, ctx);
  } catch (emitErr) {
    logServerError("offer-release.chatCard", emitErr);
  }
}

export async function announceHeldOffer(supabase: SupabaseClient, ctx: Ctx): Promise<void> {
  await supabase
    .rpc("inquiry_audit_emit", {
      p_inquiry_id: ctx.inquiryId,
      p_kind: "offer_awaiting_talent",
      p_payload: { offer_id: ctx.offerId, sent_by_user_id: ctx.actorUserId },
    })
    .then((r) => {
      if (r.error) logServerError("audit.emit.offer_awaiting_talent", r.error);
    });
  try {
    await supabase.from("inquiry_messages").insert({
      inquiry_id: ctx.inquiryId,
      tenant_id: ctx.tenantId,
      thread_type: "private",
      sender_user_id: ctx.actorUserId,
      body: "Offer is waiting for the talent to approve. The client sees it as soon as the last talent approves.",
      message_kind: "internal_note",
    });
    await insertTalentGroupCard(supabase, ctx);
  } catch (emitErr) {
    logServerError("offer-release.announceHeld", emitErr);
  }
}

/** A talent declined a held offer and it is a draft again: staff get her note (never the client). */
export async function noteHeldOfferReturned(
  supabase: SupabaseClient,
  ctx: Ctx & { notes: string | null | undefined },
): Promise<void> {
  const reason = ctx.notes && ctx.notes.trim() ? ` Her note: ${ctx.notes.trim()}` : "";
  const { error } = await supabase.from("inquiry_messages").insert({
    inquiry_id: ctx.inquiryId,
    tenant_id: ctx.tenantId,
    thread_type: "private",
    sender_user_id: ctx.actorUserId,
    body: `A talent declined the offer, so it is back in draft.${reason}`,
    message_kind: "internal_note",
  });
  if (error) logServerError("offer-release.noteReturned", error);
}
