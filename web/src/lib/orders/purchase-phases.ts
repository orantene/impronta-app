import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { livePhasePrice } from "@/lib/catalog/price-phases";

/**
 * The live price phase of every purchase line (TUL-1302).
 *
 * The storefront shows `livePhasePrice` and the POS charges it, but the online
 * pipeline priced from the catalog row alone: a customer saw 8000 and the card
 * was charged 10000. Same rule as the counter (`pos/draft.ts`): the phase's
 * price replaces the list price, and its id is stamped on the order line so a
 * later phase never rewrites the price that sold.
 *
 * A phase read that FAILS refuses the purchase. It is a price we do not know,
 * not the base price.
 */
export type LinePhase = { phasePriceCents: number | null; pricePhaseId: string | null };

export async function loadLinePhases(
  admin: SupabaseClient,
  input: { tenantId: string; lines: ReadonlyArray<{ offeringId: string; variantId?: string | null }>; nowIso?: string },
): Promise<{ ok: true; phases: LinePhase[] } | { ok: false }> {
  const cache = new Map<string, Awaited<ReturnType<typeof livePhasePrice>>>();
  const phases: LinePhase[] = [];
  for (const line of input.lines) {
    const key = `${line.offeringId}|${line.variantId ?? ""}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = await livePhasePrice(admin, {
        tenantId: input.tenantId,
        offeringId: line.offeringId,
        variantId: line.variantId ?? null,
        nowIso: input.nowIso,
      });
      cache.set(key, hit);
    }
    if (!hit.ok) return { ok: false };
    phases.push(
      hit.priceCents != null && hit.phaseId
        ? { phasePriceCents: Math.max(0, Math.trunc(hit.priceCents)), pricePhaseId: hit.phaseId }
        : { phasePriceCents: null, pricePhaseId: null },
    );
  }
  return { ok: true, phases };
}
