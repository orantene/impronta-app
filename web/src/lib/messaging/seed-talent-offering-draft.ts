import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { linkRecordToConversation } from "@/lib/messaging/link-record";
import { verifyTalentOfferingIntent, type TalentOfferingIntentKind } from "@/lib/messaging/talent-offering-intent";
import { addLine, createDraftOrder } from "@/lib/pos/draft";
import { composeTalentOfferingLabel } from "@/lib/talent/offering-line-label";
import { logServerError } from "@/lib/server/safe-error";

export type SeedTalentOfferingResult =
  | { ok: true; label: string; intent: TalentOfferingIntentKind; talentUserId: string }
  | { ok: false; reason: "invalid" | "mismatch" | "no_actor" | "unavailable" };

/**
 * Puts a signed service choice on the conversation's shared draft.
 * Prices come from the catalog, never from the token.
 */
export async function seedTalentOfferingDraft(
  admin: SupabaseClient,
  input: { token: string; tenantId: string; inquiryId: string; talentProfileId: string },
): Promise<SeedTalentOfferingResult> {
  const verified = verifyTalentOfferingIntent(input.token);
  if (!verified.ok) return { ok: false, reason: "invalid" };
  const choice = verified.payload;
  if (choice.profile !== input.talentProfileId) return { ok: false, reason: "mismatch" };

  const { data: offering, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, title, currency, talent_profile_id, tenant_id, status")
    .eq("id", choice.offering)
    .maybeSingle();
  if (offErr || !offering) return { ok: false, reason: "invalid" };
  const off = offering as {
    id: string;
    title: string | null;
    currency: string | null;
    talent_profile_id: string | null;
    tenant_id: string | null;
    status: string | null;
  };
  if (off.tenant_id !== input.tenantId || off.talent_profile_id !== input.talentProfileId || off.status !== "published") {
    return { ok: false, reason: "mismatch" };
  }

  let variantLabel: string | null = null;
  if (choice.variant) {
    const { data: variant } = await admin
      .from("talent_offering_variants")
      .select("id, label, offering_id")
      .eq("id", choice.variant)
      .maybeSingle();
    const row = variant as { label?: string; offering_id?: string } | null;
    if (!row || row.offering_id !== off.id) return { ok: false, reason: "invalid" };
    variantLabel = row.label ?? null;
  }

  const addonLabels: string[] = [];
  if (choice.addons.length > 0) {
    const { data: addons } = await admin
      .from("talent_offering_addons")
      .select("id, label, offering_id")
      .in("id", choice.addons);
    const rows = (addons ?? []) as { id: string; label: string | null; offering_id: string | null }[];
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of choice.addons) {
      const row = byId.get(id);
      if (!row || row.offering_id !== off.id) return { ok: false, reason: "invalid" };
      if (row.label) addonLabels.push(row.label);
    }
  }

  const { data: talent } = await admin.from("talent_profiles").select("user_id").eq("id", input.talentProfileId).maybeSingle();
  const talentUserId = (talent as { user_id?: string | null } | null)?.user_id ?? null;
  if (!talentUserId) return { ok: false, reason: "no_actor" };

  const label = composeTalentOfferingLabel({
    title: off.title?.trim() || "Item",
    variantLabel,
    addonLabels,
  });
  const created = await createDraftOrder(admin, {
    tenantId: input.tenantId,
    actorUserId: talentUserId,
    currency: off.currency || "USD",
    context: "messages",
    sourceChannel: "messages",
  });
  if (!created.ok) return { ok: false, reason: "unavailable" };

  const { error: linkErr } = await admin
    .from("orders")
    .update({ inquiry_id: input.inquiryId, source_channel: "messages" })
    .eq("id", created.orderId)
    .eq("tenant_id", input.tenantId);
  if (linkErr) {
    logServerError("messages.seedTalentOffering/order", linkErr);
    return { ok: false, reason: "unavailable" };
  }

  const added = await addLine(admin, {
    tenantId: input.tenantId,
    orderId: created.orderId,
    proposedBy: "client",
    line: {
      offeringId: off.id,
      units: 1,
      variantId: choice.variant,
      addonIds: choice.addons,
    },
  });
  if (!added.ok) return { ok: false, reason: added.reason === "invalid" ? "invalid" : "unavailable" };

  await linkRecordToConversation(admin, {
    tenantId: input.tenantId,
    inquiryId: input.inquiryId,
    kind: "order",
    recordId: created.orderId,
    linkedBy: talentUserId,
  });

  return { ok: true, label, intent: choice.intent, talentUserId };
}
