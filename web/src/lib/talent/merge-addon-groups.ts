import "server-only";

/**
 * Load talent_addon_groups attached to offerings and merge into addOns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  mergeAddonGroupsIntoAddOns,
  type AddonGroupAttachmentRow,
} from "./merge-addon-groups-pure";

export { mergeAddonGroupsIntoAddOns, type AddonGroupAttachmentRow };

export async function loadAddonGroupsForOfferings(
  db: SupabaseClient,
  talentProfileId: string,
  offeringIds: string[],
): Promise<AddonGroupAttachmentRow[]> {
  if (offeringIds.length === 0) return [];
  try {
    const { data: attachments, error: aErr } = await db
      .from("talent_addon_group_attachments")
      .select("addon_group_id, offering_id")
      .in("offering_id", offeringIds);
    if (aErr) {
      logServerError("offerings.addonGroups.attachments", aErr);
      return [];
    }
    const groupIds = Array.from(
      new Set((attachments ?? []).map((r) => r.addon_group_id as string).filter(Boolean)),
    );
    if (groupIds.length === 0) return [];

    const { data: groups, error: gErr } = await db
      .from("talent_addon_groups")
      .select("id, name, amount_cents, duration_minutes")
      .eq("talent_profile_id", talentProfileId)
      .in("id", groupIds);
    if (gErr) {
      logServerError("offerings.addonGroups.groups", gErr);
      return [];
    }

    const offeringIdsByGroup = new Map<string, string[]>();
    for (const row of attachments ?? []) {
      const gid = row.addon_group_id as string;
      const oid = row.offering_id as string;
      if (!offeringIds.includes(oid)) continue;
      const list = offeringIdsByGroup.get(gid) ?? [];
      list.push(oid);
      offeringIdsByGroup.set(gid, list);
    }

    return (groups ?? []).map((g) => ({
      id: g.id as string,
      name: (g.name as string) ?? "",
      amountCents: typeof g.amount_cents === "number" ? g.amount_cents : 0,
      durationMinutes: typeof g.duration_minutes === "number" ? g.duration_minutes : null,
      offeringIds: offeringIdsByGroup.get(g.id as string) ?? [],
    }));
  } catch (err) {
    logServerError("offerings.addonGroups", err);
    return [];
  }
}
