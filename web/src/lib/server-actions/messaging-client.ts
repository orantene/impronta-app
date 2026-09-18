"use server";

/**
 * L9: the actions a CLIENT takes from the secure thread link (/c/t/[token]).
 *
 * Identity is the signed thread token (`verifyThreadToken`): a valid token is
 * proof the holder is the client of that inquiry, the same way
 * `messagingGuestDraftAdd` already treats it. There is no staff guard here,
 * and nothing in this file reads or returns a staff-only field.
 *
 * Writers (D-MSG-160..166):
 *   - reply       -> `insertMessage` (kind "text", sender null) — inquiry_messages only
 *   - choose      -> POS `addLine` on the conversation's shared draft, `proposedBy: "client"`
 *                    (the same writer `messagingGuestDraftAdd` uses; a pick never books)
 *   - pick a time -> `placeReservationHold` (the storefront's own talent hold, 15-min TTL)
 *   - accept      -> engine `clientAcceptOffer` when the inquiry has a client user;
 *                    a guarded direct write of the same two rows otherwise (D-MSG-162)
 *   - decline     -> engine `clientRejectOffer` / the same fallback (D-MSG-162)
 *   - change      -> a `change_request` card + client message; staff revise (D-MSG-164)
 *
 * Split out of `messaging-engine.ts` (already at the 800-line cap, same move
 * S6/L6 made) and kept apart from the staff wrappers on purpose: the client
 * bundle imports this file and nothing from the staff shell.
 */

import { z } from "zod";

import { clientAcceptOffer } from "@/lib/inquiry/inquiry-engine-approvals";
import { clientRejectOffer } from "@/lib/inquiry/inquiry-engine-offers";
import { renameClientContact } from "@/lib/messaging/client-rename";
import { insertMessage } from "@/lib/messaging/insert-message";
import { fail } from "@/lib/messaging/refusals";
import { verifyThreadToken } from "@/lib/messaging/thread-token";
import type { ActionResult, MessagingRefusal } from "@/lib/messaging/types";
import { addLine, createDraftOrder } from "@/lib/pos/draft";
import { placeReservationHold } from "@/lib/scheduling/reservation-hold";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { SupabaseClient } from "@supabase/supabase-js";

const uuid = z.string().uuid();
const scoped = tenantScopedQuery;

/** A time pick holds the slot for this long (board C01 / D09: "held 15 min"). Mirrored as `CLIENT_TIME_HOLD_SECONDS` in client-thread-view.ts. */
const CLIENT_TIME_HOLD_SECONDS = 15 * 60;
const DEFAULT_SLOT_MINUTES = 60;

type Link = { tenantId: string; inquiryId: string; admin: SupabaseClient };

async function link(token: string): Promise<Link | { ok: false; reason: MessagingRefusal }> {
  const verified = verifyThreadToken(token);
  if (!verified.ok) return fail(verified.reason === "expired" ? "expired" : "not_allowed");
  const admin = createServiceRoleClient();
  if (!admin) return fail("unavailable");
  return { tenantId: verified.tenantId, inquiryId: verified.inquiryId, admin };
}

function isFail(x: unknown): x is { ok: false; reason: MessagingRefusal } {
  return typeof x === "object" && x !== null && (x as { ok?: boolean }).ok === false;
}

async function ownedMessage(l: Link, messageId: string) {
  const { data } = await scoped(l.admin, "inquiry_messages", l.tenantId)
    .select("id, inquiry_id, message_kind, card_payload")
    .eq("id", messageId)
    .maybeSingle();
  const row = data as { id: string; inquiry_id: string; message_kind: string; card_payload: Record<string, unknown> | null } | null;
  if (!row || row.inquiry_id !== l.inquiryId) return null;
  return row;
}

async function clientText(l: Link, body: string) {
  return insertMessage(l.admin, { tenantId: l.tenantId, inquiryId: l.inquiryId, kind: "text", body, senderUserId: null });
}

/* ---------- 1. reply (D-MSG-160) ---------- */

export async function messagingClientReply(input: { token: string; body: string }): Promise<ActionResult<{ messageId: string }>> {
  const parsed = z.object({ token: z.string().min(1), body: z.string().trim().min(1).max(4000) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const l = await link(parsed.data.token);
  if (isFail(l)) return l;
  return clientText(l, parsed.data.body);
}

/* ---------- 2. choose items (D-MSG-161) ---------- */

async function sharedDraft(l: Link): Promise<{ orderId: string } | { ok: false; reason: MessagingRefusal }> {
  const { data: existing } = await scoped(l.admin, "orders", l.tenantId)
    .select("id")
    .eq("inquiry_id", l.inquiryId)
    .eq("status", "draft")
    .eq("source_channel", "messages")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { orderId: (existing as { id: string }).id };
  // No shared draft yet: open one the way `messagingEnsureSharedDraft` does,
  // on behalf of the conversation's owner (a draft row records who opened it).
  const { data: inquiry } = await scoped(l.admin, "inquiries", l.tenantId).select("owner_user_id").eq("id", l.inquiryId).maybeSingle();
  const ownerId = (inquiry as { owner_user_id: string | null } | null)?.owner_user_id ?? null;
  if (!ownerId) return fail("no_owner");
  const created = await createDraftOrder(l.admin, { tenantId: l.tenantId, actorUserId: ownerId, currency: "USD", context: "messages" });
  if (!created.ok) return fail("unavailable");
  await scoped(l.admin, "orders", l.tenantId).update({ inquiry_id: l.inquiryId, source_channel: "messages" }).eq("id", created.orderId);
  return { orderId: created.orderId };
}

export async function messagingClientChoose(input: {
  token: string;
  messageId: string;
  choices: readonly { offeringId: string; label: string; sessionId?: string | null }[];
}): Promise<ActionResult<{ orderId: string }>> {
  const parsed = z
    .object({
      token: z.string().min(1),
      messageId: uuid,
      choices: z.array(z.object({ offeringId: z.string().min(1), label: z.string().max(200), sessionId: z.string().uuid().nullable().optional() })).min(1).max(20),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const l = await link(parsed.data.token);
  if (isFail(l)) return l;
  const card = await ownedMessage(l, parsed.data.messageId);
  if (!card) return fail("not_found");
  const state = typeof card.card_payload?.state === "string" ? card.card_payload.state : "sent";
  if (state === "expired" || state === "cancelled" || state === "unavailable") return fail("expired");

  const draft = await sharedDraft(l);
  if (isFail(draft)) return draft;
  for (const choice of parsed.data.choices) {
    // No expectedVersion: the client holds no draft version (the card carries none), and the
    // POS writer bumps the order version on every line, so a stale guess would refuse the second pick.
    const added = await addLine(l.admin, {
      tenantId: l.tenantId,
      orderId: draft.orderId,
      line: { offeringId: choice.offeringId, units: 1, sessionId: choice.sessionId ?? null },
      // The client chose this from their link: theirs until staff confirm it (owner decision 3; S5).
      proposedBy: "client",
    });
    if (!added.ok) return fail(added.reason === "conflict" ? "conflict" : added.reason === "not_found" ? "not_found" : "unavailable");
  }
  const previous = card.card_payload?.chosenIds;
  const chosenIds = [...new Set([...(Array.isArray(previous) ? (previous as string[]) : []), ...parsed.data.choices.map((c) => c.offeringId)])];
  await scoped(l.admin, "inquiry_messages", l.tenantId)
    .update({ card_payload: { ...(card.card_payload ?? {}), state: "selected", chosenIds, chosenAt: new Date().toISOString() } })
    .eq("id", card.id);
  const labels = parsed.data.choices.map((c) => c.label.trim()).filter(Boolean);
  if (labels.length > 0) await clientText(l, labels.join(", "));
  return { ok: true, orderId: draft.orderId };
}

/* ---------- 3. pick a time (D-MSG-163) ---------- */

export async function messagingClientPickTime(input: { token: string; messageId: string; startsAt: string }): Promise<ActionResult<{ holdExpiresAt: string | null }>> {
  const parsed = z.object({ token: z.string().min(1), messageId: uuid, startsAt: z.string().datetime({ offset: true }) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const l = await link(parsed.data.token);
  if (isFail(l)) return l;
  const card = await ownedMessage(l, parsed.data.messageId);
  if (!card || card.message_kind !== "professional_times") return fail("not_found");
  const p = card.card_payload ?? {};
  const slots = Array.isArray(p.slots) ? (p.slots as Array<{ startsAt?: unknown }>) : [];
  if (!slots.some((s) => s.startsAt === parsed.data.startsAt)) return fail("invalid");
  const talentProfileId = typeof p.talentProfileId === "string" ? p.talentProfileId : null;
  if (!talentProfileId) return fail("unavailable");
  const held = typeof p.holdExpiresAt === "string" ? Date.parse(p.holdExpiresAt) : NaN;
  if (typeof p.pickedStartsAt === "string" && Number.isFinite(held) && held > Date.now()) return fail("already");
  if (Date.parse(parsed.data.startsAt) <= Date.now()) return fail("expired");

  let minutes = DEFAULT_SLOT_MINUTES;
  if (typeof p.offeringId === "string" && p.offeringId) {
    const { data: offering } = await scoped(l.admin, "talent_offerings", l.tenantId).select("duration_minutes").eq("id", p.offeringId).maybeSingle();
    const d = (offering as { duration_minutes?: number | null } | null)?.duration_minutes;
    if (typeof d === "number" && d > 0) minutes = d;
  }
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
  const hold = await placeReservationHold(l.admin, {
    talentProfileId,
    tenantId: l.tenantId,
    inquiryId: l.inquiryId,
    startsAt,
    endsAt,
    title: typeof p.title === "string" && p.title ? p.title : "Client pick",
    ttlSeconds: CLIENT_TIME_HOLD_SECONDS,
    createdByUserId: null,
  });
  if (!hold.ok) return fail(hold.code === "slot_taken" ? "unavailable" : hold.code === "invalid" ? "invalid" : "unavailable");
  await scoped(l.admin, "inquiry_messages", l.tenantId)
    .update({ card_payload: { ...p, state: "selected", pickedStartsAt: parsed.data.startsAt, holdId: hold.holdId, holdExpiresAt: hold.expiresAt, pickedAt: new Date().toISOString() } })
    .eq("id", card.id);
  return { ok: true, holdExpiresAt: hold.expiresAt };
}

/* ---------- 3b. add an item from the catalog (L13 wave 5) ---------- */

/**
 * The client adds a priced item to the conversation's shared draft from the
 * dock's Items tab, with no card in between. Same writer and the same
 * `proposedBy: "client"` as `messagingClientChoose`; a line never books
 * (owner decision 3), staff confirm and price it in the offer.
 */
export async function messagingClientAddItem(input: {
  token: string;
  offeringId: string;
  label: string;
  units?: number;
  sessionId?: string | null;
}): Promise<ActionResult<{ orderId: string }>> {
  const parsed = z
    .object({
      token: z.string().min(1),
      offeringId: z.string().min(1),
      label: z.string().max(200),
      units: z.number().int().min(1).max(50).optional(),
      sessionId: z.string().uuid().nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const l = await link(parsed.data.token);
  if (isFail(l)) return l;
  const draft = await sharedDraft(l);
  if (isFail(draft)) return draft;
  const added = await addLine(l.admin, {
    tenantId: l.tenantId,
    orderId: draft.orderId,
    line: { offeringId: parsed.data.offeringId, units: parsed.data.units ?? 1, sessionId: parsed.data.sessionId ?? null },
    proposedBy: "client",
  });
  if (!added.ok) return fail(added.reason === "conflict" ? "conflict" : "unavailable");
  return { ok: true, orderId: draft.orderId };
}

/* ---------- 4. accept / decline an exact offer version (D-MSG-162) ---------- */

type OfferRow = { id: string; inquiry_id: string; status: string; version: number; valid_until: string | null; total_client_price?: number | string | null; currency_code?: string | null };

async function offerFor(l: Link, offerId: string, offerVersion: number): Promise<OfferRow | { ok: false; reason: MessagingRefusal }> {
  const { data } = await scoped(l.admin, "inquiry_offers", l.tenantId).select("id, inquiry_id, status, version, valid_until, total_client_price, currency_code").eq("id", offerId).maybeSingle();
  const row = data as OfferRow | null;
  if (!row || row.inquiry_id !== l.inquiryId) return fail("not_found");
  // Accept binds to an exact version (owner ruling): a card drawn for v2 cannot act on v3.
  if (Number(row.version) !== offerVersion) return fail("version_stale");
  return row;
}

async function inquiryFor(l: Link) {
  const { data } = await scoped(l.admin, "inquiries", l.tenantId).select("id, version, client_user_id").eq("id", l.inquiryId).maybeSingle();
  return data as { id: string; version: number; client_user_id: string | null } | null;
}

function engineRefusal(result: { success: false; conflict?: boolean; reason?: string; error?: string; rateLimited?: boolean }): MessagingRefusal {
  if (result.conflict || result.reason === "version_conflict") return "conflict";
  if (result.rateLimited) return "rate_limited";
  if (result.error === "offer_expired") return "expired";
  if (result.error === "no_client_participant") return "not_allowed";
  return "unavailable";
}

async function offerStateCard(l: Link, offer: OfferRow, offerStatus: "accepted" | "declined", body: string) {
  await insertMessage(l.admin, {
    tenantId: l.tenantId,
    inquiryId: l.inquiryId,
    kind: "offer_state",
    body,
    payload: { state: offerStatus === "accepted" ? "selected" : "cancelled", offerId: offer.id, version: offer.version, offerStatus, totalCents: Math.round(Number(offer.total_client_price ?? 0) * 100), currency: offer.currency_code ?? "USD" },
    senderUserId: null,
  });
}

export async function messagingClientAcceptOffer(input: { token: string; offerId: string; offerVersion: number }): Promise<ActionResult<{ payCode: string | null }>> {
  const parsed = z.object({ token: z.string().min(1), offerId: uuid, offerVersion: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const l = await link(parsed.data.token);
  if (isFail(l)) return l;
  const offer = await offerFor(l, parsed.data.offerId, parsed.data.offerVersion);
  if (isFail(offer)) return offer;
  if (offer.status === "accepted") return fail("already");
  if (offer.status !== "sent") return fail("expired");
  if (offer.valid_until && Date.parse(offer.valid_until) < Date.now()) return fail("expired");
  const inquiry = await inquiryFor(l);
  if (!inquiry) return fail("not_found");

  if (inquiry.client_user_id) {
    // The real writer: the engine's client approval, acting as the inquiry's own client.
    const result = await clientAcceptOffer(l.admin, {
      inquiryId: l.inquiryId,
      tenantId: l.tenantId,
      offerId: offer.id,
      actorUserId: inquiry.client_user_id,
      expectedVersion: Number(inquiry.version),
    });
    if (!result.success) {
      // A guest-created inquiry may carry a client user with no participant row; fall through to the guarded write.
      if (result.error !== "no_client_participant") return fail(engineRefusal(result));
      const direct = await acceptDirect(l, offer, Number(inquiry.version));
      if (isFail(direct)) return direct;
    }
  } else {
    const direct = await acceptDirect(l, offer, Number(inquiry.version));
    if (isFail(direct)) return direct;
  }
  await offerStateCard(l, offer, "accepted", `Accepted offer v${offer.version}`);
  const { data: linkRow } = await scoped(l.admin, "payment_links", l.tenantId)
    .select("code")
    .eq("inquiry_id", l.inquiryId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ok: true, payCode: (linkRow as { code?: string } | null)?.code ?? null };
}

/**
 * D-MSG-162 fallback: a link-holder with NO client user cannot go through
 * `engine_submit_approval` (it needs an `inquiry_participants` row, and a
 * client participant requires a user id by CHECK constraint). When no other
 * party's approval is pending on the offer, write exactly the two rows the
 * RPC's all-accepted branch writes, guarded by the inquiry version.
 */
async function acceptDirect(l: Link, offer: OfferRow, expectedVersion: number): Promise<{ ok: true } | { ok: false; reason: MessagingRefusal }> {
  // Pending approvals block a direct accept, EXCEPT the client's own row:
  // that row is the very approval this accept records (D-MSG-210 (1): a
  // guest-seat inquiry carries a client participant with no user, and its
  // pending approval refused every accept from the link).
  const { data: pending } = await scoped(l.admin, "inquiry_approvals", l.tenantId)
    .select("id, participant_id, inquiry_participants!inner(role)")
    .eq("offer_id", offer.id)
    .neq("status", "accepted");
  const rows = (pending ?? []) as Array<{ id: string; inquiry_participants: { role: string } | { role: string }[] | null }>;
  const roleOf = (r: (typeof rows)[number]) => (Array.isArray(r.inquiry_participants) ? r.inquiry_participants[0]?.role : r.inquiry_participants?.role) ?? "";
  if (rows.some((r) => roleOf(r) !== "client")) return fail("not_allowed");
  const own = rows.filter((r) => roleOf(r) === "client").map((r) => r.id);
  if (own.length > 0) {
    await scoped(l.admin, "inquiry_approvals", l.tenantId).update({ status: "accepted", decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", own);
  }
  const { error: offerErr } = await scoped(l.admin, "inquiry_offers", l.tenantId)
    .update({ status: "accepted", accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "sent");
  if (offerErr) return fail("unavailable");
  const { data: updated, error: inqErr } = await scoped(l.admin, "inquiries", l.tenantId)
    .update({ status: "approved", next_action_by: "coordinator", version: expectedVersion + 1 })
    .eq("id", l.inquiryId)
    .eq("version", expectedVersion)
    .select("id")
    .maybeSingle();
  if (inqErr) return fail("unavailable");
  if (!updated) return fail("conflict");
  return { ok: true };
}

export async function messagingClientDeclineOffer(input: { token: string; offerId: string; offerVersion: number; reason: string }): Promise<ActionResult<{ declined: true }>> {
  const parsed = z.object({ token: z.string().min(1), offerId: uuid, offerVersion: z.number().int().positive(), reason: z.string().trim().max(1000) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const l = await link(parsed.data.token);
  if (isFail(l)) return l;
  const offer = await offerFor(l, parsed.data.offerId, parsed.data.offerVersion);
  if (isFail(offer)) return offer;
  if (offer.status === "rejected") return fail("already");
  if (offer.status !== "sent") return fail("expired");
  const inquiry = await inquiryFor(l);
  if (!inquiry) return fail("not_found");
  const reasonText = parsed.data.reason || null;

  let done = false;
  if (inquiry.client_user_id) {
    const result = await clientRejectOffer(l.admin, {
      inquiryId: l.inquiryId,
      tenantId: l.tenantId,
      offerId: offer.id,
      actorUserId: inquiry.client_user_id,
      expectedVersion: Number(inquiry.version),
      rejectionReason: "other",
      rejectionReasonText: reasonText,
    });
    if (result.success) done = true;
    else if (!result.forbidden) return fail(engineRefusal(result));
  }
  if (!done) {
    // Same two rows `clientRejectOffer` writes, guarded by the inquiry version (D-MSG-162).
    const { error: offerErr } = await scoped(l.admin, "inquiry_offers", l.tenantId)
      .update({ status: "rejected", rejection_reason: "other", rejection_reason_text: reasonText })
      .eq("id", offer.id)
      .eq("status", "sent");
    if (offerErr) return fail("unavailable");
    const { data: updated, error: inqErr } = await scoped(l.admin, "inquiries", l.tenantId)
      .update({ status: "coordination", next_action_by: "coordinator", current_offer_id: null, version: Number(inquiry.version) + 1 })
      .eq("id", l.inquiryId)
      .eq("version", Number(inquiry.version))
      .select("id")
      .maybeSingle();
    if (inqErr) return fail("unavailable");
    if (!updated) return fail("conflict");
  }
  await offerStateCard(l, offer, "declined", `Declined offer v${offer.version}`);
  if (reasonText) await clientText(l, reasonText);
  return { ok: true, declined: true };
}

/* ---------- 5. ask for a change (D-MSG-164) ---------- */

export async function messagingClientRequestChange(input: {
  token: string;
  recordKind: string;
  recordId: string;
  text: string;
}): Promise<ActionResult<{ messageId: string }>> {
  const parsed = z
    .object({ token: z.string().min(1), recordKind: z.string().min(1).max(40), recordId: z.string().min(1).max(80), text: z.string().trim().min(1).max(2000) })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const l = await link(parsed.data.token);
  if (isFail(l)) return l;
  const inserted = await insertMessage(l.admin, {
    tenantId: l.tenantId,
    inquiryId: l.inquiryId,
    kind: "change_request",
    body: parsed.data.text,
    payload: {
      state: "sent",
      recordKind: parsed.data.recordKind,
      recordId: parsed.data.recordId,
      requestedAt: new Date().toISOString(),
      hoursBefore: 0,
      freeUntil: null,
      oldWhen: null,
      newWhen: null,
      summary: parsed.data.text,
    },
    senderUserId: null,
  });
  return inserted;
}

/* ---------- 6. rename the client's own name (P5 / F07, D-MSG-217) ---------- */

export async function messagingClientRename(input: { token: string; name: string }): Promise<ActionResult<{ name: string }>> {
  const parsed = z.object({ token: z.string().min(1), name: z.string().trim().min(1).max(80) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const l = await link(parsed.data.token);
  if (isFail(l)) return l;
  const result = await renameClientContact(l.admin, { tenantId: l.tenantId, inquiryId: l.inquiryId, name: parsed.data.name });
  if (!result.ok) return result;
  return { ok: true, name: result.name };
}
