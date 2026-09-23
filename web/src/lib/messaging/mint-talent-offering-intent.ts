"use server";

import { z } from "zod";

import { signTalentOfferingIntent, type TalentOfferingIntentKind } from "@/lib/messaging/talent-offering-intent";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();

/**
 * Mints a signed service choice after checking the offering belongs to this
 * talent. The client sends ids. Prices and the tenant id are not accepted.
 */
export async function mintTalentOfferingIntent(input: {
  talentProfileId: string;
  offeringId: string;
  variantId?: string | null;
  addonIds?: string[];
  intent: TalentOfferingIntentKind;
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const parsed = z
    .object({
      talentProfileId: uuid,
      offeringId: uuid,
      variantId: uuid.nullable().optional(),
      addonIds: z.array(uuid).max(20).optional(),
      intent: z.enum(["ask", "reserve"]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That service is not available." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "That service is not available." };

  const { data: offering, error: offeringErr } = await admin
    .from("talent_offerings")
    .select("id, talent_profile_id, status")
    .eq("id", parsed.data.offeringId)
    .maybeSingle();
  if (offeringErr) return { ok: false, error: "That service is not available." };
  const off = offering as { talent_profile_id?: string | null; status?: string | null } | null;
  if (!off || off.talent_profile_id !== parsed.data.talentProfileId || off.status !== "published") {
    return { ok: false, error: "That service is not available." };
  }

  if (parsed.data.variantId) {
    const { data: variant, error: variantErr } = await admin
      .from("talent_offering_variants")
      .select("id, offering_id")
      .eq("id", parsed.data.variantId)
      .maybeSingle();
    if (variantErr) return { ok: false, error: "That option is not on this service." };
    if (!variant || (variant as { offering_id?: string }).offering_id !== parsed.data.offeringId) {
      return { ok: false, error: "That option is not on this service." };
    }
  }

  const addonIds = parsed.data.addonIds ?? [];
  if (addonIds.length > 0) {
    const { data: addons, error: addonErr } = await admin.from("talent_offering_addons").select("id, offering_id").in("id", addonIds);
    if (addonErr) return { ok: false, error: "That extra is not on this service." };
    const rows = (addons ?? []) as { id: string; offering_id: string | null }[];
    const ok = new Set(rows.filter((row) => row.offering_id === parsed.data.offeringId).map((row) => row.id));
    if (addonIds.some((id) => !ok.has(id))) return { ok: false, error: "That extra is not on this service." };
  }

  const token = signTalentOfferingIntent({
    profileId: parsed.data.talentProfileId,
    offeringId: parsed.data.offeringId,
    variantId: parsed.data.variantId,
    addonIds,
    intent: parsed.data.intent,
  });
  if (!token) return { ok: false, error: "That service is not available." };
  return { ok: true, token };
}
