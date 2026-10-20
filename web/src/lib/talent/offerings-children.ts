import "server-only";

/**
 * Offering child rows (variants + add-ons) — one shared loader used by the
 * public profile loader and the editor loader, so both surfaces see the same
 * normalized shapes. Rows come from talent_offering_variants /
 * talent_offering_addons (Lane D4), ordered by sort_order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError, isPostgrestMissingColumnError } from "@/lib/server/safe-error";
import type { OfferingVariant, OfferingAddOn } from "./offerings-types";
import { i18nPair, toI18nMap } from "@/lib/i18n/i18n-columns";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";
import { MAX_LABEL, MAX_OPTIONS_PER_OFFERING } from "./offerings-children-read";

// The read side lives in offerings-children-read.ts (no "server-only", so render-level tests can load it).
export { loadOfferingChildren, MAX_OPTIONS_PER_OFFERING } from "./offerings-children-read";

export type OfferingChildrenInput = {
  variants: { label: string; amountCents: number | null; labelI18n?: LocalizedMap }[];
  addOns: { label: string; amountCents: number; labelI18n?: LocalizedMap; durationMinutes?: number | null }[];
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
  /**
   * `variants`: replace ONLY the options and leave the extras untouched. A
   * caller that holds an item whose `addOns` were merged with shared extra
   * groups (the talent editor) must not write those back as its own rows.
   */
  opts: { only?: "variants" } = {},
): Promise<OfferingChildrenSaved> {
  const variantsOnly = opts.only === "variants";
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
      // Minutes the extra adds to the slot. Dropping it here lost the time on
      // every Options save and every Duplicate (Services Phase 0 item 5e).
      duration_minutes:
        typeof a.durationMinutes === "number" && Number.isFinite(a.durationMinutes) && a.durationMinutes > 0
          ? Math.round(a.durationMinutes)
          : null,
    }))
    .filter(
      (a): a is { label_i18n: Record<string, string>; label: string; amount_cents: number; duration_minutes: number | null } =>
        Boolean(a.label) && a.amount_cents != null,
    )
    .slice(0, MAX_OPTIONS_PER_OFFERING);

  const { error: delV } = await db.from("talent_offering_variants").delete().eq("offering_id", offeringId);
  const { error: delA } = variantsOnly
    ? { error: null }
    : await db.from("talent_offering_addons").delete().eq("offering_id", offeringId);
  if (delV || delA) {
    logServerError(`${logScope}.optionsClear`, delV ?? delA);
    return { ok: false, error: "Failed to save options." };
  }
  let savedVariants: { id: string; label: string; amount_cents: number | null; label_i18n?: unknown }[] = [];
  let savedAddOns: { id: string; label: string; amount_cents: number; duration_minutes?: number | null; label_i18n?: unknown }[] = [];
  // Tolerates a database without the label_i18n column (pre-migration).
  const insertRows = async (
    table: "talent_offering_variants" | "talent_offering_addons",
    rows: Record<string, unknown>[],
  ) => {
    const extra = table === "talent_offering_addons" ? ", duration_minutes" : "";
    const first = await db.from(table).insert(rows).select(`id, label, amount_cents${extra}, label_i18n`);
    if (!first.error || !isPostgrestMissingColumnError(first.error)) return first;
    return db
      .from(table)
      .insert(rows.map(({ label_i18n: _drop, ...rest }) => rest))
      .select(`id, label, amount_cents${extra}`);
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
    savedVariants = (data ?? []) as unknown as typeof savedVariants;
  }
  if (!variantsOnly && addOns.length > 0) {
    const { data, error } = await insertRows(
      "talent_offering_addons",
      addOns.map((a, i) => ({ offering_id: offeringId, label: a.label, label_i18n: a.label_i18n, amount_cents: a.amount_cents, duration_minutes: a.duration_minutes, sort_order: i })),
    );
    if (error) {
      logServerError(`${logScope}.addonsSet`, error);
      return { ok: false, error: "Failed to save extras." };
    }
    savedAddOns = (data ?? []) as unknown as typeof savedAddOns;
  }
  return {
    ok: true,
    variants: savedVariants.map((v) => ({ id: v.id, label: v.label, amountCents: v.amount_cents, ...mapOfSaved(v.label_i18n) })),
    addOns: savedAddOns.map((a) => ({
      id: a.id,
      label: a.label,
      amountCents: a.amount_cents,
      durationMinutes: typeof a.duration_minutes === "number" && a.duration_minutes > 0 ? a.duration_minutes : null,
      ...mapOfSaved(a.label_i18n),
    })),
  };
}

function mapOfSaved(raw: unknown): { labelI18n?: Record<string, string> } {
  const m = toI18nMap(raw);
  return Object.keys(m).length > 0 ? { labelI18n: m } : {};
}
