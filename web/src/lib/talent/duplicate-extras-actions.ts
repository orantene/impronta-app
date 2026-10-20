/**
 * TUL-1337 — copy a workspace item's components (package parts) and live/upcoming price phases to
 * its duplicate, plus its photos (links to the same library assets). Client-side orchestration over the same server actions the Catalog tabs use, so the
 * engine's own checks (cycle, tenant, staff) apply. Returns the first refusal, never throws.
 */
import { loadOfferingComponentsAction, loadOfferingPricePhasesAction } from "@/lib/server-actions/catalog-engine-reads";
import { setOfferingComponentsAction, setOfferingPricePhaseAction } from "@/lib/server-actions/scheduling-engine";
import { setWorkspaceItemPhotos } from "@/lib/talent/menu-offerings-actions";
import type { OfferingVariant } from "@/lib/talent/offerings-types";
import { remapPhases } from "./duplicate-extras";

export async function copyCatalogExtras(input: {
  sourceId: string;
  copyId: string;
  sourceVariants: readonly OfferingVariant[];
  copyVariants: readonly OfferingVariant[];
  nowIso: string;
  /** The workspace the copy belongs to, and the original's photo (media asset) ids, cover first. */
  tenantId: string;
  sourcePhotoIds: readonly string[];
}): Promise<{ ok: true; assets?: { id: string; url: string; alt?: string | null }[] } | { ok: false; error: string }> {
  try {
    const comps = await loadOfferingComponentsAction(input.sourceId);
    if (comps.ok && comps.components.length > 0) {
      const set = await setOfferingComponentsAction({ offeringId: input.copyId, components: comps.components });
      if (!set.ok) return { ok: false, error: "The copy was made, but its package parts could not be copied." };
    }
    const phases = await loadOfferingPricePhasesAction(input.sourceId);
    if (phases.ok && phases.phases.length > 0) {
      const variantMap = new Map<string, string>();
      input.sourceVariants.forEach((v, i) => {
        const copied = input.copyVariants[i];
        if (copied) variantMap.set(v.id, copied.id);
      });
      for (const p of remapPhases(phases.phases, variantMap, input.nowIso)) {
        const res = await setOfferingPricePhaseAction({
          offeringId: input.copyId,
          variantId: p.variantId,
          label: p.label,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          priceCents: p.priceCents,
        });
        if (!res.ok) return { ok: false, error: "The copy was made, but its price phases could not be copied." };
      }
    }
    // The same library photos, linked to the copy (no new files): cover first, as on the original.
    if (input.sourcePhotoIds.length > 0) {
      const photos = await setWorkspaceItemPhotos(input.tenantId, input.copyId, [...input.sourcePhotoIds]);
      if (!photos.ok) return { ok: false, error: "The copy was made, but its photos could not be copied." };
      return { ok: true, assets: photos.assets };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "The copy was made, but its extras could not be copied." };
  }
}
