import "server-only";

/**
 * Load talent_addon_groups attached to offerings and merge into addOns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { readI18n } from "@/lib/i18n/i18n-columns";
import { selectWithI18nFallback } from "@/lib/i18n/i18n-select-fallback";
import {
  mergeAddonGroupsIntoAddOns,
  type AddonGroupAttachmentRow,
} from "./merge-addon-groups-pure";

export { mergeAddonGroupsIntoAddOns, type AddonGroupAttachmentRow };

/**
 * `opts.locale` (optional): group names read through `readI18n(name_i18n, name,
 * locale, chain)`; without it the plain name comes back as before.
 */
export async function loadAddonGroupsForOfferings(
  db: SupabaseClient,
  talentProfileId: string,
  offeringIds: string[],
  opts: { locale?: string; chain?: readonly string[] } = {},
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

    // name_i18n is read on a graceful path until migration 20261231299520 lands.
    const { data: groupData, error: gErr } = await selectWithI18nFallback((withI18n) =>
      db
        .from("talent_addon_groups")
        .select(withI18n ? "id, name, amount_cents, duration_minutes, name_i18n" : "id, name, amount_cents, duration_minutes")
        .eq("talent_profile_id", talentProfileId)
        .in("id", groupIds),
    );
    const groups = (groupData ?? []) as unknown as {
      id: string;
      name: string | null;
      amount_cents: unknown;
      duration_minutes: unknown;
      name_i18n?: unknown;
    }[];
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

    return groups.map((g) => ({
      id: g.id,
      name: opts.locale
        ? readI18n(g.name_i18n, g.name, opts.locale, opts.chain ?? [opts.locale])
        : (g.name ?? ""),
      amountCents: typeof g.amount_cents === "number" ? g.amount_cents : 0,
      durationMinutes: typeof g.duration_minutes === "number" ? g.duration_minutes : null,
      offeringIds: offeringIdsByGroup.get(g.id) ?? [],
    }));
  } catch (err) {
    logServerError("offerings.addonGroups", err);
    return [];
  }
}
