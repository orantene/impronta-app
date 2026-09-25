"use server";

/**
 * L6 (Messages v5, D-MSG-134): the offer-editor writers, split out of
 * `messaging-engine.ts` to keep that file under the repo's `max-lines` ratchet
 * (it was already near the cap). Same pattern as shared-draft / catalog:
 * `messagingInquiryManager` (staff OR active coordinator) so talent inbox
 * Continue→Send is not refused with `not_allowed`, zod-parse the input, call
 * the `lib/inquiry/inquiry-engine-offers.ts` engine, translate its
 * `EngineResult` into the Messages refusal catalogue.
 *
 * `messagingSendOffer` (sending) stays in `messaging-engine.ts` — it shipped
 * there before this lane and nothing about moving it was in scope. It uses
 * the same inquiry-manager gate.
 */

import { z } from "zod";

import { counterOffer, createOffer, reopenOfferForAmendment, updateOfferDraft, type OfferLineDraft } from "@/lib/inquiry/inquiry-engine-offers";
import { loadInquiryOffers, loadOfferForEditor } from "@/lib/messaging/sheets";
import { linkRecordToConversation } from "@/lib/messaging/link-record";
import { fail } from "@/lib/messaging/refusals";
import { messagingInquiryManager } from "@/lib/messaging/staff-guard";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();
const scoped = tenantScopedQuery;

type OfferGuardOk = Extract<Awaited<ReturnType<typeof messagingInquiryManager>>, { ok: true }>;

/**
 * L6 (Messages v5, D-MSG-134): translate an `inquiry-engine-offers.ts`
 * `EngineResult` failure into the Messages refusal catalogue. `conflict` /
 * `version_conflict` map to `version_stale` — the sheet's three-way choose
 * reads that code, never `conflict` (which the rest of Messages uses for
 * conversation-row optimistic-lock misses, a different surface).
 */
function offerEngineFail(result: { success: false; forbidden?: boolean; conflict?: boolean; rateLimited?: boolean; error?: string; reason?: string }) {
  if (result.rateLimited) return fail("rate_limited");
  if (result.forbidden) return fail("not_allowed");
  if (result.conflict || result.error === "version_conflict") return fail("version_stale");
  if (result.error === "offer_not_found") return fail("not_found");
  if (result.error === "empty_offer" || result.error === "invalid_pricing_unit" || result.error === "line_item_talent_required") return fail("invalid");
  if (
    result.error === "not_amendable" ||
    result.error === "offer_not_editable" ||
    result.reason === "post_booking_immutable" ||
    result.reason === "inquiry_frozen" ||
    result.error === "legacy_inquiry"
  ) {
    return fail("not_allowed");
  }
  return fail("unavailable");
}

/** L6: start (or re-fetch an existing draft for) offer v1 on this inquiry. */
export async function messagingCreateOffer(input: { inquiryId: string; expectedVersion: number; currencyCode?: string }) {
  const parsed = z.object({ inquiryId: uuid, expectedVersion: version, currencyCode: z.string().length(3).optional() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  // Creating the draft is the operator's own move on a thread they are
  // looking at: the version guard reads the row now instead of trusting a
  // number the sheet captured before the picker linked the shared draft.
  const { data: fresh } = await scoped(g.admin, "inquiries", g.tenantId).select("version").eq("id", parsed.data.inquiryId).maybeSingle();
  const currentVersion = Number((fresh as { version?: number } | null)?.version ?? parsed.data.expectedVersion);
  const result = await createOffer(g.supabase, {
    inquiryId: parsed.data.inquiryId,
    tenantId: g.tenantId,
    actorUserId: g.userId,
    expectedVersion: currentVersion,
    currencyCode: parsed.data.currencyCode ?? "USD",
  });
  if (!result.success) return offerEngineFail(result);
  const offerId = result.data?.offerId ?? "";
  if (offerId) {
    await seedOfferFromSharedDraft(g, parsed.data.inquiryId, offerId);
    await linkRecordToConversation(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId, kind: "offer", recordId: offerId, linkedBy: g.userId });
  }
  return { ok: true as const, offerId };
}

/**
 * A new offer starts from the conversation's shared draft (the lines the
 * picker / the client link added to the `messages` draft order), so
 * "Add items → Continue to offer" opens an editor that already prices them.
 * Nothing to copy, or a failed copy, leaves the empty offer as before.
 */
async function seedOfferFromSharedDraft(g: OfferGuardOk, inquiryId: string, offerId: string) {
  const { data: order } = await scoped(g.admin, "orders", g.tenantId)
    .select("id, currency")
    .eq("inquiry_id", inquiryId)
    .eq("status", "draft")
    .eq("source_channel", "messages")
    .maybeSingle();
  const o = order as { id: string; currency: string | null } | null;
  if (!o) return;
  const { data: rows } = await scoped(g.admin, "order_lines", g.tenantId).select("label, units, unit_cents, talent_profile_id").eq("order_id", o.id);
  const lines = ((rows ?? []) as Array<{ label: string | null; units: number | null; unit_cents: number | null; talent_profile_id: string | null }>).filter((l) => (l.units ?? 0) > 0);
  if (lines.length === 0) return;
  const { data: inquiry } = await scoped(g.admin, "inquiries", g.tenantId).select("version").eq("id", inquiryId).maybeSingle();
  const draft = await loadOfferForEditor(g.admin, { tenantId: g.tenantId, inquiryId, offerId, inquiryExpectedVersion: Number((inquiry as { version?: number } | null)?.version ?? 1) });
  if (!draft || draft.lines.length > 0) return;
  const lineItems: OfferLineDraft[] = lines.map((l, i) => {
    const units = Number(l.units ?? 1);
    const unit = Number(l.unit_cents ?? 0) / 100;
    return { talent_profile_id: l.talent_profile_id, owner_tenant_id: l.talent_profile_id ? null : g.tenantId, label: l.label ?? "Item", pricing_unit: "custom", units, unit_price: unit, total_price: unit * units, talent_cost: 0, notes: null, sort_order: i, proposed_by: "staff" };
  });
  const total = lineItems.reduce((sum, l) => sum + l.total_price, 0);
  await updateOfferDraft(g.supabase, {
    inquiryId,
    tenantId: g.tenantId,
    offerId,
    actorUserId: g.userId,
    inquiryExpectedVersion: draft.inquiryExpectedVersion,
    offerExpectedVersion: draft.version,
    total_client_price: total,
    coordinator_fee: 0,
    // The lines were priced in the ORDER's currency, so the offer must be in
    // it too. A new offer defaults to USD; preferring that default copied
    // 950 MXN into a US$950 offer.
    currency_code: o.currency || draft.currencyCode || "USD",
    notes: null,
    lineItems,
  });
}

/** L6: the full draft (header + lines) for the editor sheet. */
export async function messagingLoadOfferForEditor(input: { inquiryId: string; offerId: string }) {
  const parsed = z.object({ inquiryId: uuid, offerId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  const { data: inquiry } = await scoped(g.admin, "inquiries", g.tenantId).select("version").eq("id", parsed.data.inquiryId).maybeSingle();
  const draft = await loadOfferForEditor(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    offerId: parsed.data.offerId,
    inquiryExpectedVersion: Number((inquiry as { version?: number } | null)?.version ?? 1),
  });
  if (!draft) return fail("not_found");
  return { ok: true as const, draft };
}

/** L6: replace the draft's line items + terms (coordinator/staff only; draft status required by the engine). */
export async function messagingUpdateOfferDraft(input: {
  inquiryId: string;
  offerId: string;
  inquiryExpectedVersion: number;
  offerExpectedVersion: number;
  totalClientPriceCents: number;
  coordinatorFeeCents: number;
  currencyCode: string;
  notes: string | null;
  lineItems: OfferLineDraft[];
  terms?: { depositPct?: number | null } | null;
}) {
  const parsed = z
    .object({
      inquiryId: uuid,
      offerId: uuid,
      inquiryExpectedVersion: version,
      offerExpectedVersion: version,
      totalClientPriceCents: z.number().int().nonnegative(),
      coordinatorFeeCents: z.number().int().nonnegative(),
      currencyCode: z.string().length(3),
      notes: z.string().nullable(),
    })
    .safeParse({ ...input, lineItems: undefined, terms: undefined });
  if (!parsed.success) return fail("invalid");
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  const result = await updateOfferDraft(g.supabase, {
    inquiryId: input.inquiryId,
    tenantId: g.tenantId,
    offerId: input.offerId,
    actorUserId: g.userId,
    inquiryExpectedVersion: input.inquiryExpectedVersion,
    offerExpectedVersion: input.offerExpectedVersion,
    total_client_price: input.totalClientPriceCents / 100,
    coordinator_fee: input.coordinatorFeeCents / 100,
    currency_code: input.currencyCode,
    notes: input.notes,
    lineItems: input.lineItems,
    terms: input.terms ?? undefined,
  });
  if (!result.success) return offerEngineFail(result);
  return { ok: true as const };
}

/** L6: an accepted/sent offer -> a new draft version (never edits an accepted version — owner ruling 2). */
export async function messagingReopenOfferForAmendment(input: { inquiryId: string; offerId: string; expectedVersion: number }) {
  const parsed = z.object({ inquiryId: uuid, offerId: uuid, expectedVersion: version }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  const result = await reopenOfferForAmendment(g.supabase, {
    inquiryId: parsed.data.inquiryId,
    tenantId: g.tenantId,
    offerId: parsed.data.offerId,
    actorUserId: g.userId,
    expectedVersion: parsed.data.expectedVersion,
  });
  if (!result.success) return offerEngineFail(result);
  return { ok: true as const };
}

/**
 * L6: a currently-accepted / declined / expired offer cannot be reopened
 * (`reopenOfferForAmendment` only takes a SENT offer — engine guard
 * `not_amendable`). Revise on one of those instead opens the next version
 * the way the old workspace Offer tab's "Counter" did: a fresh draft offer
 * via `counterOffer` (which itself calls `createOffer`), pre-filled with the
 * same currency. The caller still populates lines with `updateOfferDraft`.
 */
export async function messagingCounterOffer(input: { inquiryId: string; expectedVersion: number; previousOfferId: string }) {
  const parsed = z.object({ inquiryId: uuid, expectedVersion: version, previousOfferId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  const result = await counterOffer(g.supabase, {
    inquiryId: parsed.data.inquiryId,
    tenantId: g.tenantId,
    actorUserId: g.userId,
    expectedVersion: parsed.data.expectedVersion,
    previousOfferId: parsed.data.previousOfferId,
  });
  if (!result.success) return offerEngineFail(result);
  return { ok: true as const, offerId: result.data?.offerId ?? "" };
}

/** L6: the offer's version history (for the version chips and the Compare picker). */
export async function messagingListOffers(input: { inquiryId: string }) {
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  const offers = await loadInquiryOffers(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId });
  return { ok: true as const, offers };
}
