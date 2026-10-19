import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { PricedAddon } from "@/lib/orders/purchase-pricing";

/**
 * Shared extras (`talent_addon_groups`) priced at checkout.
 *
 * The booking sheet shows a group extra as an add-on carrying the GROUP id, but
 * `loadCatalog` only read `talent_offering_addons`, so `pricePurchase` refused
 * every group id with `addon_not_on_offering` and instant booking died for any
 * service with a shared extra (Services Phase 0 item 5c).
 *
 * A group extra is priced from the group row, on the server, and is valid ONLY
 * for an offering it is attached to AND whose owner is the group's owner.
 */

export type GroupExtraRow = {
  id: string;
  talentProfileId: string | null;
  name: string | null;
  amountCents: unknown;
};
export type GroupAttachment = { groupId: string; offeringId: string };

/** Pure: groups + attachments + the offering owners -> priced add-ons. */
export function groupExtrasToPricedAddons(
  groups: readonly GroupExtraRow[],
  attachments: readonly GroupAttachment[],
  offeringTalent: ReadonlyMap<string, string | null>,
): PricedAddon[] {
  const out: PricedAddon[] = [];
  for (const g of groups) {
    if (typeof g.amountCents !== "number" || !Number.isFinite(g.amountCents) || g.amountCents < 0) continue;
    if (!g.talentProfileId) continue;
    const valid = attachments
      .filter((a) => a.groupId === g.id && offeringTalent.get(a.offeringId) === g.talentProfileId)
      .map((a) => a.offeringId);
    if (valid.length === 0) continue;
    out.push({
      addonId: g.id,
      offeringId: valid[0]!,
      offeringIds: new Set(valid),
      label: (g.name ?? "").trim(),
      amountCents: Math.round(g.amountCents),
    });
  }
  return out;
}

/** Loads the shared extras attached to these offerings. A failed read refuses (never prices without them). */
export async function loadGroupExtras(
  admin: SupabaseClient,
  offeringTalent: ReadonlyMap<string, string | null>,
): Promise<{ ok: true; addons: PricedAddon[] } | { ok: false }> {
  const offeringIds = [...offeringTalent.keys()];
  if (offeringIds.length === 0) return { ok: true, addons: [] };
  const att = await admin
    .from("talent_addon_group_attachments")
    .select("addon_group_id, offering_id")
    .in("offering_id", offeringIds);
  if (att.error) {
    logServerError("orders.loadCatalog/groupAttachments", att.error);
    return { ok: false };
  }
  const attachments = ((att.data ?? []) as { addon_group_id: string; offering_id: string }[]).map((r) => ({
    groupId: r.addon_group_id,
    offeringId: r.offering_id,
  }));
  const groupIds = [...new Set(attachments.map((a) => a.groupId))];
  if (groupIds.length === 0) return { ok: true, addons: [] };
  const grp = await admin
    .from("talent_addon_groups")
    .select("id, talent_profile_id, name, amount_cents")
    .in("id", groupIds);
  if (grp.error) {
    logServerError("orders.loadCatalog/groups", grp.error);
    return { ok: false };
  }
  const groups = ((grp.data ?? []) as { id: string; talent_profile_id: string | null; name: string | null; amount_cents: unknown }[]).map(
    (g) => ({ id: g.id, talentProfileId: g.talent_profile_id, name: g.name, amountCents: g.amount_cents }),
  );
  return { ok: true, addons: groupExtrasToPricedAddons(groups, attachments, offeringTalent) };
}
