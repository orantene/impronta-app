/**
 * Pure merge of talent_addon_groups into per-offering addOns.
 * Kept free of server-only so unit tests can import it.
 */

import type { OfferingAddOn } from "./offerings-types";

export type AddonGroupAttachmentRow = {
  id: string;
  name: string;
  amountCents: number;
  durationMinutes: number | null;
  offeringIds: string[];
};

/** Attach groups onto per-offering addOns without duplicating ids. */
export function mergeAddonGroupsIntoAddOns(
  byOffering: Map<string, OfferingAddOn[]>,
  groups: AddonGroupAttachmentRow[],
): Map<string, OfferingAddOn[]> {
  const out = new Map<string, OfferingAddOn[]>();
  for (const [offeringId, list] of byOffering) {
    out.set(offeringId, [...list]);
  }
  for (const group of groups) {
    if (!group.name.trim()) continue;
    if (!(group.amountCents >= 0)) continue;
    const addOn: OfferingAddOn = {
      id: group.id,
      label: group.name.trim(),
      amountCents: Math.round(group.amountCents),
      durationMinutes:
        typeof group.durationMinutes === "number" && group.durationMinutes > 0
          ? Math.round(group.durationMinutes)
          : null,
    };
    for (const offeringId of group.offeringIds) {
      const list = out.get(offeringId) ?? [];
      if (list.some((a) => a.id === addOn.id)) {
        out.set(offeringId, list);
        continue;
      }
      out.set(offeringId, [...list, addOn]);
    }
  }
  return out;
}
