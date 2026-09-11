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

export type OfferingChildrenInput = {
  variants: { label: string; amountCents: number | null }[];
  addOns: { label: string; amountCents: number }[];
};

export type OfferingChildrenSaved =
  | { ok: true; variants: OfferingVariant[]; addOns: OfferingAddOn[] }
  | { ok: false; error: string };

/**
 * Replace an offering's OPTIONS (variants) and EXTRAS (add-ons). Array order IS
 * the display order. Labels are required; a variant without a price falls back
 * to the offering's base price; an add-on must carry one. Replace-all, the same
 * semantics as the photos writer, so the caller re-syncs from the fresh ids.
 *
 * The caller has already proven the offering is its own (talent or workspace);
 * this only writes the child rows.
 */
export async function replaceOfferingChildren(
  db: SupabaseClient,
  offeringId: string,
  input: OfferingChildrenInput,
  logScope: string,
): Promise<OfferingChildrenSaved> {
  const variants = (input.variants ?? [])
    .map((v) => ({
      label: (v.label ?? "").trim().slice(0, MAX_LABEL),
      amount_cents:
        typeof v.amountCents === "number" && Number.isFinite(v.amountCents) && v.amountCents >= 0
          ? Math.round(v.amountCents)
          : null,
    }))
    .filter((v) => v.label)
    .slice(0, MAX_OPTIONS_PER_OFFERING);
  const addOns = (input.addOns ?? [])
    .map((a) => ({
      label: (a.label ?? "").trim().slice(0, MAX_LABEL),
      amount_cents:
        typeof a.amountCents === "number" && Number.isFinite(a.amountCents) && a.amountCents >= 0
          ? Math.round(a.amountCents)
          : null,
    }))
    .filter((a): a is { label: string; amount_cents: number } => Boolean(a.label) && a.amount_cents != null)
    .slice(0, MAX_OPTIONS_PER_OFFERING);

  const { error: delV } = await db.from("talent_offering_variants").delete().eq("offering_id", offeringId);
  const { error: delA } = await db.from("talent_offering_addons").delete().eq("offering_id", offeringId);
  if (delV || delA) {
    logServerError(`${logScope}.optionsClear`, delV ?? delA);
    return { ok: false, error: "Failed to save options." };
  }
  let savedVariants: { id: string; label: string; amount_cents: number | null }[] = [];
  let savedAddOns: { id: string; label: string; amount_cents: number }[] = [];
  if (variants.length > 0) {
    const { data, error } = await db
      .from("talent_offering_variants")
      .insert(variants.map((v, i) => ({ offering_id: offeringId, label: v.label, amount_cents: v.amount_cents, sort_order: i })))
      .select("id, label, amount_cents");
    if (error) {
      logServerError(`${logScope}.variantsSet`, error);
      return { ok: false, error: "Failed to save options." };
    }
    savedVariants = (data ?? []) as typeof savedVariants;
  }
  if (addOns.length > 0) {
    const { data, error } = await db
      .from("talent_offering_addons")
      .insert(addOns.map((a, i) => ({ offering_id: offeringId, label: a.label, amount_cents: a.amount_cents, sort_order: i })))
      .select("id, label, amount_cents");
    if (error) {
      logServerError(`${logScope}.addonsSet`, error);
      return { ok: false, error: "Failed to save extras." };
    }
    savedAddOns = (data ?? []) as typeof savedAddOns;
  }
  return {
    ok: true,
    variants: savedVariants.map((v) => ({ id: v.id, label: v.label, amountCents: v.amount_cents })),
    addOns: savedAddOns.map((a) => ({ id: a.id, label: a.label, amountCents: a.amount_cents })),
  };
}
