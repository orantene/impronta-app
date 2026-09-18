"use server";

/**
 * L6 (Messages v5, D-MSG-134): the offer-editor writers, split out of
 * `messaging-engine.ts` to keep that file under the repo's `max-lines` ratchet
 * (it was already near the cap). Same pattern as every other action in that
 * file: `staff()` guard (imported from there — it is the identical tenant +
 * service-role guard every Messages action uses), zod-parse the input, call
 * the `lib/inquiry/inquiry-engine-offers.ts` engine, translate its
 * `EngineResult` into the Messages refusal catalogue.
 *
 * `messagingSendOffer` (sending) stays in `messaging-engine.ts` — it shipped
 * there before this lane and nothing about moving it was in scope.
 */

import { z } from "zod";

import { counterOffer, createOffer, reopenOfferForAmendment, updateOfferDraft, type OfferLineDraft } from "@/lib/inquiry/inquiry-engine-offers";
import { loadInquiryOffers, loadOfferForEditor } from "@/lib/messaging/sheets";
import { fail } from "@/lib/messaging/refusals";
import { staff } from "./messaging-engine";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();
const scoped = tenantScopedQuery;

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
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, expectedVersion: version, currencyCode: z.string().length(3).optional() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await createOffer(g.supabase, {
    inquiryId: parsed.data.inquiryId,
    tenantId: g.tenantId,
    actorUserId: g.userId,
    expectedVersion: parsed.data.expectedVersion,
    currencyCode: parsed.data.currencyCode ?? "USD",
  });
  if (!result.success) return offerEngineFail(result);
  return { ok: true as const, offerId: result.data?.offerId ?? "" };
}

/** L6: the full draft (header + lines) for the editor sheet. */
export async function messagingLoadOfferForEditor(input: { inquiryId: string; offerId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, offerId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
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
  const g = await staff();
  if (!g.ok) return g;
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
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, expectedVersion: version, previousOfferId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
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
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const offers = await loadInquiryOffers(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId });
  return { ok: true as const, offers };
}

