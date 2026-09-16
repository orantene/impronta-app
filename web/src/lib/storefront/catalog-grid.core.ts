/**
 * catalog_grid — the engine seam (read only).
 *
 * `talent_offerings` rows the way the menu board and the /book page read
 * them (published, approved, public), mapped through `rowToOffering` so the
 * locale-aware title/description rules are the catalog's own. Live prices
 * come from `livePhasePrice`, the same function the POS reads before it
 * adds a line (D-138). Options, extras and package components are read in
 * one query each and attached. Collections are the offerings' categories.
 */

import { rowToOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";

import type { StorefrontAdmin } from "./admin";
import type { CatalogAddon, CatalogCollection, CatalogGridData, CatalogGridProps, CatalogItem, CatalogOption } from "./catalog-grid.types";

export type CatalogGridDeps = {
  admin: StorefrontAdmin;
  locale: "en" | "es";
  now?: () => Date;
  livePrice: (
    admin: StorefrontAdmin,
    input: { tenantId: string; offeringId: string; variantId?: string | null; nowIso?: string },
  ) => Promise<{ ok: true; priceCents: number | null; phaseId: string | null } | { ok: false; reason: "unavailable" }>;
  /** offeringId → hero-first image urls. Cosmetic; a failure is an empty map. */
  loadImages: (admin: StorefrontAdmin, offeringIds: string[]) => Promise<Map<string, string[]>>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 120;

export async function readCatalogGridCore(
  deps: CatalogGridDeps,
  tenantId: string,
  props: CatalogGridProps,
): Promise<{ ok: true; data: CatalogGridData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  const now = (deps.now ?? (() => new Date()))();
  try {
    let q = deps.admin
      .from("talent_offerings")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .eq("moderation_state", "approved")
      .eq("visibility", "public");
    if (Array.isArray(props.offeringIds) && props.offeringIds.length > 0) q = q.in("id", props.offeringIds);
    const { data: rows, error } = await q.order("sort_order", { ascending: true }).limit(MAX_ITEMS);
    if (error) return { ok: false, reason: "unavailable" };
    const offerings = ((rows ?? []) as TalentOfferingRow[]).map((r) => ({
      row: r,
      offering: rowToOffering(r, deps.locale, []),
    }));
    const wanted = Array.isArray(props.collections) ? new Set(props.collections) : null;
    const kept = offerings.filter(({ offering }) => (wanted ? wanted.has(offering.category ?? "") : true));
    const ids = kept.map((k) => k.offering.id);

    const variants = new Map<string, CatalogOption[]>();
    const addons = new Map<string, CatalogAddon[]>();
    const components = new Map<string, Array<{ offeringId: string; title: string; qty: number; required: boolean }>>();
    let images = new Map<string, string[]>();
    if (ids.length > 0) {
      const [{ data: vRows }, { data: aRows }, { data: cRows }] = await Promise.all([
        deps.admin.from("talent_offering_variants").select("id, offering_id, label, amount_cents, sort_order").in("offering_id", ids).order("sort_order", { ascending: true }),
        deps.admin.from("talent_offering_addons").select("id, offering_id, label, amount_cents, sort_order").in("offering_id", ids).order("sort_order", { ascending: true }),
        deps.admin.from("offering_components").select("offering_id, component_offering_id, qty, required").eq("tenant_id", tenantId).in("offering_id", ids),
      ]);
      for (const v of (vRows ?? []) as Array<Record<string, unknown>>) {
        const list = variants.get(String(v.offering_id)) ?? [];
        list.push({ id: String(v.id), label: String(v.label), amountCents: v.amount_cents == null ? null : Number(v.amount_cents) });
        variants.set(String(v.offering_id), list);
      }
      for (const a of (aRows ?? []) as Array<Record<string, unknown>>) {
        const list = addons.get(String(a.offering_id)) ?? [];
        list.push({ id: String(a.id), label: String(a.label), amountCents: Number(a.amount_cents ?? 0) });
        addons.set(String(a.offering_id), list);
      }
      const componentIds = [...new Set(((cRows ?? []) as Array<Record<string, unknown>>).map((c) => String(c.component_offering_id)))];
      const titles = new Map<string, string>();
      for (const { offering } of offerings) titles.set(offering.id, offering.title);
      const missing = componentIds.filter((id) => !titles.has(id));
      if (missing.length > 0) {
        const { data: extra } = await deps.admin.from("talent_offerings").select("id, title").in("id", missing);
        for (const e of (extra ?? []) as Array<Record<string, unknown>>) titles.set(String(e.id), String(e.title ?? ""));
      }
      for (const c of (cRows ?? []) as Array<Record<string, unknown>>) {
        const list = components.get(String(c.offering_id)) ?? [];
        list.push({
          offeringId: String(c.component_offering_id),
          title: titles.get(String(c.component_offering_id)) ?? "",
          qty: Number(c.qty ?? 1),
          required: c.required !== false,
        });
        components.set(String(c.offering_id), list);
      }
      if (props.showPhotos !== false) {
        try {
          images = await deps.loadImages(deps.admin, ids);
        } catch {
          images = new Map();
        }
      }
    }

    const phaseLabels = new Map<string, string>();
    const items: CatalogItem[] = [];
    for (const { offering } of kept) {
      let livePriceCents = offering.amountCents;
      let phaseId: string | null = null;
      if (props.showPhases !== false) {
        const live = await deps.livePrice(deps.admin, { tenantId, offeringId: offering.id, nowIso: now.toISOString() });
        // A failed phase read is NOT the base price: it is a price we do not know.
        if (!live.ok) return { ok: false, reason: "unavailable" };
        if (live.phaseId) {
          phaseId = live.phaseId;
          livePriceCents = live.priceCents;
        }
      }
      items.push({
        id: offering.id,
        title: offering.title,
        description: offering.description,
        kind: offering.kind,
        category: offering.category,
        amountCents: offering.amountCents,
        livePriceCents,
        phase: phaseId ? { id: phaseId, label: "" } : null,
        currency: offering.currency,
        priceDisplay: offering.priceDisplay,
        imageUrl: images.get(offering.id)?.[0] ?? null,
        unitsLeft: offering.inventoryQty,
        allowPayInPerson: offering.allowPayInPerson,
        requiresIdentity: offering.requiresIdentity,
        options: variants.get(offering.id) ?? [],
        addons: addons.get(offering.id) ?? [],
        components: offering.kind === "package" ? components.get(offering.id) ?? [] : null,
        sortOrder: 0,
      });
    }
    items.forEach((it, i) => {
      it.sortOrder = i;
    });

    const phaseIds = items.map((i) => i.phase?.id).filter((x): x is string => !!x);
    if (phaseIds.length > 0) {
      const { data: phases } = await deps.admin.from("offering_price_phases").select("id, label").in("id", phaseIds);
      for (const p of (phases ?? []) as Array<Record<string, unknown>>) phaseLabels.set(String(p.id), String(p.label ?? ""));
      for (const it of items) if (it.phase) it.phase.label = phaseLabels.get(it.phase.id) ?? "";
    }

    const collections: CatalogCollection[] = [];
    const byKey = new Map<string, CatalogCollection>();
    for (const it of items) {
      const key = it.category ?? "";
      let c = byKey.get(key);
      if (!c) {
        c = { key, label: key, itemIds: [] };
        byKey.set(key, c);
        collections.push(c);
      }
      c.itemIds.push(it.id);
    }

    return {
      ok: true,
      data: { collections, items, currency: items[0]?.currency ?? "USD", promotions: [] },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
