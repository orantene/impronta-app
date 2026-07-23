import "server-only";

/**
 * Offering child rows (variants + add-ons) — one shared loader used by the
 * public profile loader and the editor loader, so both surfaces see the same
 * normalized shapes. Rows come from talent_offering_variants /
 * talent_offering_addons (Lane D4), ordered by sort_order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { OfferingVariant, OfferingAddOn } from "./offerings-types";

const MAX_LABEL = 80;
/** Per-offering cap mirrors the legacy services-menu MAX_SUB. */
export const MAX_OPTIONS_PER_OFFERING = 30;

function cleanLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, MAX_LABEL) : null;
}

export async function loadOfferingChildren(
  db: SupabaseClient,
  offeringIds: string[],
): Promise<{ variants: Map<string, OfferingVariant[]>; addOns: Map<string, OfferingAddOn[]> }> {
  const variants = new Map<string, OfferingVariant[]>();
  const addOns = new Map<string, OfferingAddOn[]>();
  if (offeringIds.length === 0) return { variants, addOns };

  try {
    const [{ data: vRows, error: vErr }, { data: aRows, error: aErr }] = await Promise.all([
      db
        .from("talent_offering_variants")
        .select("id, offering_id, label, amount_cents, sort_order")
        .in("offering_id", offeringIds)
        .order("sort_order", { ascending: true }),
      db
        .from("talent_offering_addons")
        .select("id, offering_id, label, amount_cents, sort_order")
        .in("offering_id", offeringIds)
        .order("sort_order", { ascending: true }),
    ]);
    if (vErr) logServerError("offerings.children/variants", vErr);
    if (aErr) logServerError("offerings.children/addons", aErr);

    for (const r of (vRows ?? []) as { id: string; offering_id: string; label: string; amount_cents: number | null }[]) {
      const label = cleanLabel(r.label);
      if (!label) continue;
      const list = variants.get(r.offering_id) ?? [];
      list.push({
        id: r.id,
        label,
        amountCents:
          typeof r.amount_cents === "number" && Number.isFinite(r.amount_cents) && r.amount_cents >= 0
            ? Math.round(r.amount_cents)
            : null,
      });
      variants.set(r.offering_id, list);
    }
    for (const r of (aRows ?? []) as { id: string; offering_id: string; label: string; amount_cents: number | null }[]) {
      const label = cleanLabel(r.label);
      if (!label) continue;
      const cents =
        typeof r.amount_cents === "number" && Number.isFinite(r.amount_cents) && r.amount_cents >= 0
          ? Math.round(r.amount_cents)
          : null;
      if (cents == null) continue; // add-ons always carry a concrete price
      const list = addOns.get(r.offering_id) ?? [];
      list.push({ id: r.id, label, amountCents: cents });
      addOns.set(r.offering_id, list);
    }
  } catch (err) {
    logServerError("offerings.children", err);
  }
  return { variants, addOns };
}
