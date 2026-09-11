import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { Catalog } from "@/lib/orders/purchase-catalog";
import type { PurchaseRefusalReason } from "@/lib/orders/purchase-types";

/**
 * C34 — a provisional / unclaimed talent profile cannot take money.
 * Agency-owned offerings (no talent_profile_id) are unaffected.
 */
export async function refuseUnclaimedSellers(
  admin: SupabaseClient,
  catalog: Extract<Catalog, { ok: true }>,
): Promise<{ ok: true } | { ok: false; reason: PurchaseRefusalReason; offeringId: string; error: string }> {
  const talentIds = [
    ...new Set(
      [...catalog.offerings.values()]
        .map((o) => o.talentProfileId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (talentIds.length === 0) return { ok: true };

  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, user_id, claimed_at")
    .in("id", talentIds);
  if (error) {
    logServerError("orders.refuseUnclaimedSellers", error);
    return {
      ok: false,
      reason: "engine_error",
      offeringId: talentIds[0]!,
      error: "Could not verify the seller.",
    };
  }

  const claimed = new Map(
    ((data ?? []) as Array<{ id: string; user_id: string | null; claimed_at: string | null }>).map(
      (row) => [row.id, Boolean(row.user_id || row.claimed_at)],
    ),
  );

  for (const [offeringId, offering] of catalog.offerings) {
    const talentId = offering.talentProfileId;
    if (!talentId) continue;
    if (claimed.get(talentId) === true) continue;
    return {
      ok: false,
      reason: "unclaimed_seller",
      offeringId,
      error: "This profile cannot take money until it is claimed.",
    };
  }
  return { ok: true };
}

export async function profileMayPublishTerms(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id, claimed_at")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as { user_id: string | null; claimed_at: string | null };
  return Boolean(row.user_id || row.claimed_at);
}
