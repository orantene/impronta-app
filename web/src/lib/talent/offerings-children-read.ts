/**
 * Offering child rows (variants + add-ons): the READ side. No "server-only" on purpose, so pure
 * and render-level tests that load the public data sources can import it; every caller is
 * server-side already (the writer in offerings-children.ts keeps "server-only").
 * `offerings-children.ts` re-exports these names, so existing imports are unchanged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { OfferingVariant, OfferingAddOn } from "./offerings-types";
import { readI18n, toI18nMap } from "@/lib/i18n/i18n-columns";
import { selectWithI18nFallback } from "@/lib/i18n/i18n-select-fallback";

export const MAX_LABEL = 80;
/** Per-offering cap mirrors the legacy services-menu MAX_SUB. */
export const MAX_OPTIONS_PER_OFFERING = 30;

function cleanLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, MAX_LABEL) : null;
}

/**
 * `opts.locale` (optional): labels read through `readI18n(label_i18n, label,
 * locale, chain)`. Without it the plain labels come back as before. Either way
 * the map rides along as `labelI18n` when the column exists.
 *
 * `opts.publicOnly`: every guest-facing caller sets it. A hidden / comp ticket tier is unlocked by
 * its variant id, so that id must never reach a public payload; the owner editors leave it unset.
 */
export async function loadOfferingChildren(
  db: SupabaseClient,
  offeringIds: string[],
  opts: { locale?: string; chain?: readonly string[]; publicOnly?: boolean } = {},
): Promise<{ variants: Map<string, OfferingVariant[]>; addOns: Map<string, OfferingAddOn[]> }> {
  const variants = new Map<string, OfferingVariant[]>();
  const addOns = new Map<string, OfferingAddOn[]>();
  if (offeringIds.length === 0) return { variants, addOns };

  try {
    // label_i18n is read on a graceful path until migration 20261231299520 lands.
    const [{ data: vRows, error: vErr }, { data: aRows, error: aErr }] = await Promise.all([
      selectWithI18nFallback((withI18n) => {
        const q = db
          .from("talent_offering_variants")
          .select(withI18n ? "id, offering_id, label, amount_cents, sort_order, label_i18n" : "id, offering_id, label, amount_cents, sort_order")
          .in("offering_id", offeringIds);
        return (opts.publicOnly ? q.neq("is_hidden", true) : q).order("sort_order", { ascending: true });
      }),
      selectWithI18nFallback((withI18n) =>
        db
          .from("talent_offering_addons")
          // BUF: duration_minutes must reach CatalogBookingSheet so extras
          // lengthen the slots query (duration=) after Continuar.
          .select(withI18n ? "id, offering_id, label, amount_cents, duration_minutes, sort_order, label_i18n" : "id, offering_id, label, amount_cents, duration_minutes, sort_order")
          .in("offering_id", offeringIds)
          .order("sort_order", { ascending: true }),
      ),
    ]);
    const labelOf = (map: unknown, plain: string): string | null =>
      cleanLabel(opts.locale ? readI18n(map, plain, opts.locale, opts.chain ?? [opts.locale]) : plain);
    const mapOf = (map: unknown) => {
      const m = toI18nMap(map);
      return Object.keys(m).length > 0 ? { labelI18n: m } : {};
    };
    if (vErr) logServerError("offerings.children/variants", vErr);
    if (aErr) logServerError("offerings.children/addons", aErr);

    for (const r of (vRows ?? []) as unknown as {
      id: string;
      offering_id: string;
      label: string;
      amount_cents: number | null;
      label_i18n?: unknown;
    }[]) {
      const label = labelOf(r.label_i18n, r.label);
      if (!label) continue;
      const list = variants.get(r.offering_id) ?? [];
      list.push({
        id: r.id,
        label,
        amountCents:
          typeof r.amount_cents === "number" && Number.isFinite(r.amount_cents) && r.amount_cents >= 0
            ? Math.round(r.amount_cents)
            : null,
        ...mapOf(r.label_i18n),
      });
      variants.set(r.offering_id, list);
    }
    for (const r of (aRows ?? []) as unknown as {
      id: string;
      offering_id: string;
      label: string;
      amount_cents: number | null;
      duration_minutes: number | null;
      label_i18n?: unknown;
    }[]) {
      const label = labelOf(r.label_i18n, r.label);
      if (!label) continue;
      const cents =
        typeof r.amount_cents === "number" && Number.isFinite(r.amount_cents) && r.amount_cents >= 0
          ? Math.round(r.amount_cents)
          : null;
      if (cents == null) continue; // add-ons always carry a concrete price
      const durationMinutes =
        typeof r.duration_minutes === "number" &&
        Number.isFinite(r.duration_minutes) &&
        r.duration_minutes > 0
          ? Math.round(r.duration_minutes)
          : null;
      const list = addOns.get(r.offering_id) ?? [];
      list.push({ id: r.id, label, amountCents: cents, durationMinutes, ...mapOf(r.label_i18n) });
      addOns.set(r.offering_id, list);
    }
  } catch (err) {
    logServerError("offerings.children", err);
  }
  return { variants, addOns };
}
