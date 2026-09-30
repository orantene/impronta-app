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
 * Send quote (talent dashboard): start her own conversation through the inquiry
 * funnel, then create, price and SEND the offer so the client receives it.
 * The offer verbs are admitted only on her own talent_self inquiry
 * (inquiry-permissions.ts, talentOwnOfferAllowed). If the conversation exists
 * but a later step fails, `inquiryId` comes back so the panel can say so
 * honestly and open the thread.
 */
export type TalentQuoteResult =
  | { ok: true; inquiryId: string; offerId: string }
  | { ok: false; reason: MessagingRefusal | "no_price"; inquiryId?: string };

export async function messagingTalentSendQuote(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  offeringId: string;
  amountCents: number;
  note?: string | null;
}): Promise<TalentQuoteResult> {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().nullable().optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      offeringId: z.string().uuid(),
      amountCents: z.number().int().max(100_000_000),
      note: z.string().trim().max(2000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.amountCents <= 0) return { ok: false, reason: "no_price" };

  const actor = await loadTalentActor();
  if (!actor.ok) return actor;
  const hub = await getPlatformHubTenant();
  if (!hub?.tenantId) return fail("unavailable");
  const tenantId = hub.tenantId;

  // Her own published offering: title and currency come from the catalog row.
  const own = await loadTalentOfferingsForEditor(actor.talentProfileId);
  const offering = own.ok ? own.items.find((o) => o.id === parsed.data.offeringId && o.status === "published") : undefined;
  if (!offering) return fail("not_found");

  const started = await messagingTalentStartConversation({
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    channel: "counter",
    quoteOfferingId: offering.id,
    quoteNote: parsed.data.note ?? null,
  });
  if (!started.ok) return started;
  const inquiryId = started.inquiryId;
  const partial = (reason: MessagingRefusal): TalentQuoteResult => ({ ok: false, reason, inquiryId });

  const admin = actor.admin;
  const versionOf = async (table: "inquiries" | "inquiry_offers", id: string) => {
    const { data } = await tenantScopedQuery(admin, table, tenantId).select("version").eq("id", id).maybeSingle();
    return Number((data as { version?: number } | null)?.version ?? 1);
  };

  const created = await createOffer(admin, {
    inquiryId,
    tenantId,
    actorUserId: actor.userId,
    expectedVersion: await versionOf("inquiries", inquiryId),
    currencyCode: offering.currency,
  });
  if (!created.success || !created.data?.offerId) return partial(created.success ? "unavailable" : created.forbidden ? "not_allowed" : "unavailable");
  const offerId = created.data.offerId;

  const total = parsed.data.amountCents / 100;
  const updated = await updateOfferDraft(admin, {
    inquiryId,
    tenantId,
    offerId,
    actorUserId: actor.userId,
    inquiryExpectedVersion: await versionOf("inquiries", inquiryId),
    offerExpectedVersion: await versionOf("inquiry_offers", offerId),
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
  if (!updated.success) return partial(updated.forbidden ? "not_allowed" : "unavailable");

  const offerVersion = await versionOf("inquiry_offers", offerId);
  const sent = await sendOffer(admin, {
    inquiryId,
    tenantId,
    offerId,
    actorUserId: actor.userId,
    inquiryExpectedVersion: await versionOf("inquiries", inquiryId),
    offerExpectedVersion: offerVersion,
  });
  if (!sent.success) return partial(sent.forbidden ? "not_allowed" : "unavailable");

  // The offer card the client link renders (Accept / Ask for changes / Decline).
  await insertMessage(admin, {
    tenantId,
    inquiryId,
    kind: "offer_review",
    body: `Offer v${offerVersion} sent`,
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
  return { ok: true, inquiryId, offerId };
}
