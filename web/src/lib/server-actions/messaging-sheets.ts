"use server";

/**
 * The Messages sheets' own readers and writers (audit E / D-116, 2026-09-15):
 * hand over, delivery, recover, offer, diff, change. Split from
 * `messaging-engine.ts` (800-line cap); same guard, same refusal codes.
 */

import { z } from "zod";

import { reopenOfferForAmendment } from "@/lib/inquiry/inquiry-engine-offers";
import { retryDeliveryRow, type DeliveryRetryRow } from "@/lib/messaging/delivery-retry";
import { fail } from "@/lib/messaging/refusals";
import {
  loadBasketDiff,
  loadCheckoutSnapshots,
  loadHandOverTargets,
  loadInquiryOffers,
  loadThreadDelivery,
} from "@/lib/messaging/sheets";
import { messagingStaff } from "@/lib/messaging/staff-guard";
import { refreshThreadToken } from "@/lib/messaging/thread-token";
import { cancelPaymentLink } from "@/lib/payments/links";
import { cancelBookingSet } from "@/lib/scheduling/cancel-booking";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const staff = messagingStaff;

/** Hand over: who can take this thread. */
export async function messagingLoadHandOverTargets() {
  const g = await staff();
  if (!g.ok) return g;
  return { ok: true as const, targets: await loadHandOverTargets(g.admin, { tenantId: g.tenantId, excludeUserId: g.userId }) };
}

/** Delivery: every attempt on this thread's messages. */
export async function messagingLoadDelivery(input: { inquiryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return { ok: true as const, rows: await loadThreadDelivery(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId }) };
}

/** Delivery › Retry: the cron's own resend, for one failed row, now. */
export async function messagingRetryDelivery(input: { deliveryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ deliveryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { data, error } = await tenantScopedQuery(g.admin, "message_delivery", g.tenantId)
    .select("id, message_id, tenant_id, channel, state, attempts, provider_ref")
    .eq("id", parsed.data.deliveryId)
    .maybeSingle();
  if (error) return fail("unavailable");
  if (!data) return fail("not_found");
  const result = await retryDeliveryRow(g.admin, data as DeliveryRetryRow);
  if (!result.ok) return fail(result.reason);
  return { ok: true as const, state: result.state };
}

/** Recover: the saved checkouts this thread can be recovered from. */
export async function messagingLoadSnapshots(input: { inquiryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return { ok: true as const, snapshots: await loadCheckoutSnapshots(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId }) };
}

/** Offer: the inquiry's offers, so the sheet acts on a real offer id. */
export async function messagingLoadOffers(input: { inquiryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return { ok: true as const, offers: await loadInquiryOffers(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId }) };
}

/**
 * Offer › Revise: package-2 `reopenOfferForAmendment` puts a sent offer back
 * in draft so the builder (`/admin/messages/<inquiry>`, Offer pill) can
 * change it. Withdraw has no engine (D-POS-121) and is not here.
 */
export async function messagingReviseOffer(input: { inquiryId: string; offerId: string; expectedVersion: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, offerId: uuid, expectedVersion: version }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await reopenOfferForAmendment(g.supabase, {
    inquiryId: parsed.data.inquiryId,
    tenantId: g.tenantId,
    offerId: parsed.data.offerId,
    actorUserId: g.userId,
    expectedVersion: parsed.data.expectedVersion,
  });
  if (!result.success) {
    if (result.rateLimited) return fail("rate_limited");
    if (result.forbidden) return fail("not_allowed");
    return fail(result.conflict ? "conflict" : "unavailable");
  }
  return { ok: true as const };
}

/** Diff: the open payment page and what moved under it. */
export async function messagingLoadBasketDiff(input: { inquiryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const diff = await loadBasketDiff(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId });
  if (!diff) return fail("not_found");
  return { ok: true as const, diff };
}

/** Diff › Take theirs: the open page comes down so the new basket can be requested. */
export async function messagingCancelPaymentLink(input: { linkId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ linkId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await cancelPaymentLink(g.admin, { tenantId: g.tenantId, linkId: parsed.data.linkId });
  if (!result.ok) return fail(result.reason);
  return { ok: true as const, already: result.already };
}

/**
 * Change › Cancel: package-2 `cancelBookingSet` with its policy check. The
 * engine answers `policy_keeps` / `not_cancellable` as a sentence; nothing
 * is refunded by itself. Reschedule needs a slot and lives on Appointments.
 */
export async function messagingCancelBooking(input: { inquiryId: string; bookingId: string; reason: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, bookingId: uuid, reason: z.string().trim().max(200) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await cancelBookingSet(g.admin, {
    tenantId: g.tenantId,
    bookingId: parsed.data.bookingId,
    operationKey: `msg-cancel-${parsed.data.inquiryId}-${parsed.data.bookingId}`,
    reason: parsed.data.reason,
    by: "staff",
  });
  if (!result.ok) return { ok: false as const, reason: result.reason };
  return { ok: true as const, refundableCents: result.refundableCents, already: result.already === true };
}

/**
 * L2 (Messages v5 shell): the client's own thread link for an EXISTING
 * conversation. `messagingStartConversation` mints one only at creation and
 * nothing kept it (D-145), so "Copy client link" had no reader. Pure read:
 * a signed token whose expiry follows the latest linked record (D-MSG-6),
 * built on `refreshThreadToken`; no row is written. The inquiry must belong
 * to the caller's tenant.
 */
export async function messagingThreadLink(input: { inquiryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { data, error } = await tenantScopedQuery(g.admin, "inquiries", g.tenantId)
    .select("id")
    .eq("id", parsed.data.inquiryId)
    .maybeSingle();
  if (error) return fail("unavailable");
  if (!data) return fail("not_found");
  const token = await refreshThreadToken(g.admin, parsed.data.inquiryId, g.tenantId);
  if (!token) return fail("unavailable");
  return { ok: true as const, token };
}

/**
 * Context panel › Items + Money (D-MSG-111 closed): the conversation's shared
 * draft order (`orders.inquiry_id`, source_channel messages) is the one POS
 * record Messages writes lines into, so its lines ARE the items on the table
 * and its totals the money. No shared draft → nulls, the panel draws its
 * empty state. Read-only; formatting happens in the shell (USD).
 */
export async function messagingLoadContextLines(input: { inquiryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { data: order } = await tenantScopedQuery(g.admin, "orders", g.tenantId)
    .select("id, status, currency, total_cents")
    .eq("inquiry_id", parsed.data.inquiryId)
    .eq("source_channel", "messages")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const o = order as { id: string; status: string; currency: string | null; total_cents: number | string | null } | null;
  if (!o) return { ok: true as const, lines: null, money: null };
  const { data: rows } = await tenantScopedQuery(g.admin, "order_lines", g.tenantId)
    .select("id, label, units, unit_cents, proposed_by, confirmed_at")
    .eq("order_id", o.id)
    .order("created_at", { ascending: true });
  const lines = ((rows ?? []) as Array<{ id: string; label: string | null; units: number | null; unit_cents: number | null; proposed_by: string | null; confirmed_at: string | null }>).map((l) => ({
    id: l.id,
    label: l.label ?? "Item",
    units: Number(l.units ?? 1),
    unitCents: Number(l.unit_cents ?? 0),
    proposedBy: l.proposed_by === "client" || l.proposed_by === "staff" ? l.proposed_by : null,
    confirmed: l.confirmed_at !== null,
  }));
  const totalCents = Number(o.total_cents ?? 0) || lines.reduce((sum, l) => sum + l.units * l.unitCents, 0);
  const paidCents = o.status === "paid" || o.status === "fulfilled" || o.status === "partially_refunded" ? totalCents : 0;
  return { ok: true as const, lines, money: { totalCents, paidCents, balanceCents: Math.max(0, totalCents - paidCents), currency: o.currency ?? "USD" } };
}
