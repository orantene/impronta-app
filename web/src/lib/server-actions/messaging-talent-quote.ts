"use server";

import { z } from "zod";

import { createOffer, sendOffer, updateOfferDraft } from "@/lib/inquiry/inquiry-engine-offers";
import { insertMessage } from "@/lib/messaging/insert-message";
import { fail } from "@/lib/messaging/refusals";
import { loadTalentActor } from "@/lib/messaging/talent-actor";
import type { MessagingRefusal } from "@/lib/messaging/types";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";

import { messagingTalentStartConversation } from "./messaging-talent-writes";

/**
 * Send quote (talent dashboard), in two steps so the panel can show real
 * progress and a failure after step 1 is honest about what exists:
 *   1. `messagingTalentQuoteStart`: her own conversation through the inquiry funnel.
 *   2. `messagingTalentQuoteSend`: create, price and SEND the offer so the client
 *      receives it. The offer verbs are admitted only on her own talent_self
 *      inquiry (inquiry-permissions.ts, talentOwnOfferAllowed).
 */
export type TalentQuoteStartResult = { ok: true; inquiryId: string } | { ok: false; reason: MessagingRefusal };
export type TalentQuoteSendResult = { ok: true; offerId: string } | { ok: false; reason: MessagingRefusal | "no_price" };

export async function messagingTalentQuoteStart(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  offeringId: string;
  note?: string | null;
}): Promise<TalentQuoteStartResult> {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().nullable().optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      offeringId: z.string().uuid(),
      note: z.string().trim().max(2000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  // The offering is checked against her own published catalog inside the funnel writer.
  const started = await messagingTalentStartConversation({
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    channel: "counter",
    quoteOfferingId: parsed.data.offeringId,
    quoteNote: parsed.data.note ?? null,
  });
  if (!started.ok) return started;
  return { ok: true, inquiryId: started.inquiryId };
}

export async function messagingTalentQuoteSend(input: {
  inquiryId: string;
  offeringId: string;
  amountCents: number;
  note?: string | null;
}): Promise<TalentQuoteSendResult> {
  const parsed = z
    .object({
      inquiryId: z.string().uuid(),
      offeringId: z.string().uuid(),
      amountCents: z.number().int().max(100_000_000),
      note: z.string().trim().max(2000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.amountCents <= 0) return { ok: false, reason: "no_price" };

  const actor = await loadTalentActor();
  if (!actor.ok) return actor;
  const [hub, own] = await Promise.all([getPlatformHubTenant(), loadTalentOfferingsForEditor(actor.talentProfileId)]);
  if (!hub?.tenantId) return fail("unavailable");
  const tenantId = hub.tenantId;
  const offering = own.ok ? own.items.find((o) => o.id === parsed.data.offeringId && o.status === "published") : undefined;
  if (!offering) return fail("not_found");

  const { inquiryId } = parsed.data;
  const admin = actor.admin;
  const versionOf = async (table: "inquiries" | "inquiry_offers", id: string) => {
    const { data } = await tenantScopedQuery(admin, table, tenantId).select("version").eq("id", id).maybeSingle();
    return Number((data as { version?: number } | null)?.version ?? 1);
  };

  // Reuse this conversation's open draft (a stuck earlier attempt, or one the
  // offer drawer opened) instead of stacking another version and order on it.
  const { data: draftRow } = await tenantScopedQuery(admin, "inquiry_offers", tenantId)
    .select("id")
    .eq("inquiry_id", inquiryId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let offerId = (draftRow as { id?: string } | null)?.id ?? null;
  if (!offerId) {
    const created = await createOffer(admin, {
      inquiryId,
      tenantId,
      actorUserId: actor.userId,
      expectedVersion: await versionOf("inquiries", inquiryId),
      currencyCode: offering.currency,
    });
    if (!created.success || !created.data?.offerId) return fail(created.success || !created.forbidden ? "unavailable" : "not_allowed");
    offerId = created.data.offerId;
  }

  const total = parsed.data.amountCents / 100;
  const [inquiryVersion, offerVersionBefore] = await Promise.all([versionOf("inquiries", inquiryId), versionOf("inquiry_offers", offerId)]);
  const updated = await updateOfferDraft(admin, {
    inquiryId,
    tenantId,
    offerId,
    actorUserId: actor.userId,
    inquiryExpectedVersion: inquiryVersion,
    offerExpectedVersion: offerVersionBefore,
    total_client_price: total,
    coordinator_fee: 0,
    currency_code: offering.currency,
    notes: parsed.data.note ?? null,
    lineItems: [
      {
        talent_profile_id: actor.talentProfileId,
        label: offering.title,
        pricing_unit: offering.priceType,
        units: 1,
        unit_price: total,
        total_price: total,
        talent_cost: total,
        notes: null,
        sort_order: 0,
        proposed_by: "staff",
      },
    ],
  });
  if (!updated.success) return fail(updated.forbidden ? "not_allowed" : "unavailable");

  const [inquiryVersionNow, offerVersion] = await Promise.all([versionOf("inquiries", inquiryId), versionOf("inquiry_offers", offerId)]);
  const sent = await sendOffer(admin, {
    inquiryId,
    tenantId,
    offerId,
    actorUserId: actor.userId,
    inquiryExpectedVersion: inquiryVersionNow,
    offerExpectedVersion: offerVersion,
  });
  if (!sent.success) return fail(sent.forbidden ? "not_allowed" : "unavailable");

  // The offer card the client link renders (Accept / Ask for changes / Decline).
  // The body is a neutral key-free line; the reader localises the card and
  // never shows the internal version (F101).
  await insertMessage(admin, {
    tenantId,
    inquiryId,
    kind: "offer_review",
    body: "Offer sent",
    payload: {
      state: "sent",
      offerId,
      version: offerVersion,
      totalCents: parsed.data.amountCents,
      currency: offering.currency,
      validUntil: null,
    },
    senderUserId: actor.userId,
  });
  return { ok: true, offerId };
}
