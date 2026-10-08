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
import { i18nPair, readI18n, toI18nMap } from "@/lib/i18n/i18n-columns";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";
import { isPostgrestMissingColumnError } from "@/lib/server/safe-error";
import { selectWithI18nFallback } from "@/lib/i18n/i18n-select-fallback";

const MAX_LABEL = 80;
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
 */
export async function loadOfferingChildren(
  db: SupabaseClient,
  offeringIds: string[],
  opts: { locale?: string; chain?: readonly string[] } = {},
): Promise<{ variants: Map<string, OfferingVariant[]>; addOns: Map<string, OfferingAddOn[]> }> {
  const variants = new Map<string, OfferingVariant[]>();
  const addOns = new Map<string, OfferingAddOn[]>();
  if (offeringIds.length === 0) return { variants, addOns };

  try {
    // label_i18n is read on a graceful path until migration 20261231299520 lands.
    const [{ data: vRows, error: vErr }, { data: aRows, error: aErr }] = await Promise.all([
      selectWithI18nFallback((withI18n) =>
        db
          .from("talent_offering_variants")
          .select(withI18n ? "id, offering_id, label, amount_cents, sort_order, label_i18n" : "id, offering_id, label, amount_cents, sort_order")
          .in("offering_id", offeringIds)
          .order("sort_order", { ascending: true }),
      ),
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

export type OfferingChildrenInput = {
  variants: { label: string; amountCents: number | null; labelI18n?: LocalizedMap }[];
  addOns: { label: string; amountCents: number; labelI18n?: LocalizedMap }[];
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
  primaryLocale = "en",
): Promise<OfferingChildrenSaved> {
  // PR 7: the plain label is the primary language; `label_i18n` keeps every
  // language (replace-all used to drop the translations on every save).
  const pair = (map: LocalizedMap | undefined, label: string) => {
    const m = i18nPair(map, label, primaryLocale);
    return Object.keys(m).length > 0 ? m : {};
  };
  const variants = (input.variants ?? [])
    .map((v) => ({
      label_i18n: pair(v.labelI18n, (v.label ?? "").trim().slice(0, MAX_LABEL)),
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
      label_i18n: pair(a.labelI18n, (a.label ?? "").trim().slice(0, MAX_LABEL)),
      label: (a.label ?? "").trim().slice(0, MAX_LABEL),
      amount_cents:
        typeof a.amountCents === "number" && Number.isFinite(a.amountCents) && a.amountCents >= 0
          ? Math.round(a.amountCents)
          : null,
    }))
    .filter(
      (a): a is { label_i18n: Record<string, string>; label: string; amount_cents: number } =>
        Boolean(a.label) && a.amount_cents != null,
    )
    .slice(0, MAX_OPTIONS_PER_OFFERING);

  const { error: delV } = await db.from("talent_offering_variants").delete().eq("offering_id", offeringId);
  const { error: delA } = await db.from("talent_offering_addons").delete().eq("offering_id", offeringId);
  if (delV || delA) {
    logServerError(`${logScope}.optionsClear`, delV ?? delA);
    return { ok: false, error: "Failed to save options." };
  }
  let savedVariants: { id: string; label: string; amount_cents: number | null; label_i18n?: unknown }[] = [];
  let savedAddOns: { id: string; label: string; amount_cents: number; label_i18n?: unknown }[] = [];
  // Tolerates a database without the label_i18n column (pre-migration).
  const insertRows = async (
    table: "talent_offering_variants" | "talent_offering_addons",
    rows: Record<string, unknown>[],
  ) => {
    const first = await db.from(table).insert(rows).select("id, label, amount_cents, label_i18n");
    if (!first.error || !isPostgrestMissingColumnError(first.error)) return first;
    return db
      .from(table)
      .insert(rows.map(({ label_i18n: _drop, ...rest }) => rest))
      .select("id, label, amount_cents");
  };
  if (variants.length > 0) {
    const { data, error } = await insertRows(
      "talent_offering_variants",
      variants.map((v, i) => ({ offering_id: offeringId, label: v.label, label_i18n: v.label_i18n, amount_cents: v.amount_cents, sort_order: i })),
    );
    if (error) {
      logServerError(`${logScope}.variantsSet`, error);
      return { ok: false, error: "Failed to save options." };
    }
    savedVariants = (data ?? []) as typeof savedVariants;
  }
  if (addOns.length > 0) {
    const { data, error } = await insertRows(
      "talent_offering_addons",
      addOns.map((a, i) => ({ offering_id: offeringId, label: a.label, label_i18n: a.label_i18n, amount_cents: a.amount_cents, sort_order: i })),
    );
    if (error) {
      logServerError(`${logScope}.addonsSet`, error);
      return { ok: false, error: "Failed to save extras." };
    }
    savedAddOns = (data ?? []) as typeof savedAddOns;
  }
  return {
    ok: true,
    variants: savedVariants.map((v) => ({ id: v.id, label: v.label, amountCents: v.amount_cents, ...mapOfSaved(v.label_i18n) })),
    addOns: savedAddOns.map((a) => ({ id: a.id, label: a.label, amountCents: a.amount_cents, ...mapOfSaved(a.label_i18n) })),
  };
}

function mapOfSaved(raw: unknown): { labelI18n?: Record<string, string> } {
  const m = toI18nMap(raw);
  return Object.keys(m).length > 0 ? { labelI18n: m } : {};
}
