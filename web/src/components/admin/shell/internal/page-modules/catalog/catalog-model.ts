/**
 * catalog-model.ts — the judgements the Catalog boards (W01 to W07) draw,
 * made once here and tested, so the list, the editor's tabs and the right
 * column all say the same thing about one row.
 *
 * Every function is pure and reads only the offering the editor already
 * holds. What the engine does not record is said as an absence (`null`), never
 * guessed: a preparation station, a per-location price or a dated batch has no
 * column on `talent_offerings`, so the list prints a dash for it and the
 * editor draws the control disabled with its reason.
 */

import { validateOffering, type OfferingKind, type TalentOffering } from "@/lib/talent/offerings-types";
import { SCHEDULING_ENGINE_REFUSALS, SCHEDULING_ENGINE_REFUSAL_CODES } from "@/lib/scheduling/engine-refusals";

/** The type a row is listed as. `custom` is a service priced by quote. */
export type CatalogItemType = OfferingKind | "custom";

export function itemType(o: Pick<TalentOffering, "kind" | "priceDisplay" | "priceType">): CatalogItemType {
  if (o.kind === "service" && (o.priceDisplay === "quote" || o.priceType === "custom")) return "custom";
  return o.kind;
}

/**
 * Where a row can be sold today. Two channels exist in the engine:
 *   website — `published` and not `agency_only` (the storefront's own filter)
 *   pos     — `published` (the counter's `addLine` refuses anything else)
 * Tables, Table QR, the talent profile and a private link are drawn on W06 as
 * controls the engine has no flag for.
 */
export type CatalogChannel = "website" | "pos";

export function itemChannels(o: Pick<TalentOffering, "status" | "visibility">): CatalogChannel[] {
  if (o.status !== "published") return [];
  return o.visibility === "agency_only" ? ["pos"] : ["website", "pos"];
}

/** The availability column and the W05 mode card that is lit. */
export type Availability =
  | { mode: "unlimited" }
  | { mode: "stock"; left: number | null; soldOut: boolean };

export function itemAvailability(o: Pick<TalentOffering, "capacityPoolId" | "inventoryQty">): Availability {
  if (!o.capacityPoolId && o.inventoryQty == null) return { mode: "unlimited" };
  const left = o.inventoryQty;
  return { mode: "stock", left, soldOut: left != null && left <= 0 };
}

/** The status pill: published, draft, or incomplete (a save would refuse). */
export type CatalogStatus = "published" | "draft" | "incomplete";

export function itemStatus(o: TalentOffering): { status: CatalogStatus; problems: string[] } {
  const problems = validateOffering(o);
  if (problems.length > 0) return { status: "incomplete", problems };
  return { status: o.status === "published" ? "published" : "draft", problems };
}

export type ListFilters = {
  type: "all" | CatalogItemType;
  channel: "any" | CatalogChannel;
  incompleteOnly: boolean;
};

export const DEFAULT_FILTERS: ListFilters = { type: "all", channel: "any", incompleteOnly: false };

export function filterItems(items: readonly TalentOffering[], f: ListFilters): TalentOffering[] {
  return items.filter((o) => {
    if (f.type !== "all" && itemType(o) !== f.type) return false;
    if (f.channel !== "any" && !itemChannels(o).includes(f.channel)) return false;
    if (f.incompleteOnly && itemStatus(o).status !== "incomplete") return false;
    return true;
  });
}

/**
 * W07 — the Counter categories column: one row per category the rows carry,
 * in first-seen order, with a count; uncategorised rows are counted under
 * `null` so nothing is hidden by a missing label.
 */
export function categoryCounts(items: readonly TalentOffering[]): { category: string | null; count: number }[] {
  const order: (string | null)[] = [];
  const counts = new Map<string | null, number>();
  for (const o of items) {
    const key = o.category?.trim() || null;
    if (!counts.has(key)) {
      counts.set(key, 0);
      order.push(key);
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return order.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

/**
 * W03's "Before publish" line: what stops a Publish, if anything, as CODES
 * the surface says in the reader's language. The predicates mirror
 * `validateOffering` one for one (the writer refuses on exactly these), and
 * `catalog-model.test.ts` holds the two to the same count over a matrix so
 * they cannot drift apart.
 */
export type PublishBlocker = "title" | "price" | "instant_price" | "deposit_pct" | "identity_reason" | "currency";

export function publishBlockers(o: TalentOffering): PublishBlocker[] {
  const out: PublishBlocker[] = [];
  const quoteOnly = o.priceDisplay === "quote" || o.priceType === "custom";
  if (!o.title.trim()) out.push("title");
  if (!quoteOnly && (o.amountCents == null || o.amountCents < 0)) out.push("price");
  if (o.bookingMode === "instant" && (quoteOnly || o.amountCents == null || o.amountCents < 0 || o.priceDisplay !== "exact")) {
    out.push("instant_price");
  }
  if (o.bookingMode === "instant" && o.reserveMode === "deposit" && (o.depositPct == null || o.depositPct <= 0 || o.depositPct >= 100)) {
    out.push("deposit_pct");
  }
  if (o.requiresIdentity && !o.identityReason) out.push("identity_reason");
  if (!o.currency || o.currency.length < 3) out.push("currency");
  return out;
}

export const PUBLISH_BLOCKER_KEY: Record<PublishBlocker, string> = {
  title: "dashboard.catalog.blocker.title",
  price: "dashboard.catalog.blocker.price",
  instant_price: "dashboard.catalog.blocker.instantPrice",
  deposit_pct: "dashboard.catalog.blocker.depositPct",
  identity_reason: "dashboard.catalog.blocker.identityReason",
  currency: "dashboard.catalog.blocker.currency",
};

/** W03's example totals: base, the first extra, a quantity of two. */
export function exampleTotals(o: Pick<TalentOffering, "amountCents" | "addOns">): {
  baseCents: number | null;
  extraLabel: string | null;
  extraCents: number | null;
  timesTwoCents: number | null;
} {
  const base = o.amountCents;
  const extra = o.addOns?.[0] ?? null;
  if (base == null) return { baseCents: null, extraLabel: extra?.label ?? null, extraCents: extra?.amountCents ?? null, timesTwoCents: null };
  const unit = base + (extra?.amountCents ?? 0);
  return { baseCents: base, extraLabel: extra?.label ?? null, extraCents: extra?.amountCents ?? null, timesTwoCents: unit * 2 };
}

/** The seven editor tabs, in the boards' order. */
export const ITEM_TABS = ["details", "pricing", "options", "availability", "fulfillment", "channels", "policies"] as const;
export type ItemTab = (typeof ITEM_TABS)[number];

export function tabFromQuery(raw: string | null): ItemTab {
  return (ITEM_TABS as readonly string[]).includes(raw ?? "") ? (raw as ItemTab) : "details";
}

/** The catalog's views, one route (`?view=`), as W01's segments list them. */
export const CATALOG_VIEWS = ["items", "packages", "price-lists", "passes", "structure"] as const;
export type CatalogView = (typeof CATALOG_VIEWS)[number];

export function viewFromQuery(raw: string | null): CatalogView {
  return (CATALOG_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as CatalogView) : "items";
}

/**
 * W02 — the nine cards. Three are the engine's own kinds, one is a service
 * priced by quote; the rest are sold by another destination or wait on a
 * product decision, and the card says which.
 */
export type CreateTypeCard = {
  id: "product" | "service" | "class" | "ticket" | "space" | "custom" | "package" | "pass" | "gift";
  /** What Continue creates, or null when the card is not a catalog write. */
  seed: Partial<TalentOffering> | null;
  /** The destination (a `?`-less admin path) the card hands over to, if any. */
  destination: string | null;
};

export const CREATE_TYPE_CARDS: readonly CreateTypeCard[] = [
  { id: "product", seed: { kind: "product", bookingMode: "instant", priceType: "flat_package" }, destination: null },
  { id: "service", seed: { kind: "service", priceType: "per_contact" }, destination: null },
  { id: "class", seed: null, destination: "/admin/appts?view=series" },
  { id: "ticket", seed: null, destination: "/admin/events?compose=new" },
  { id: "space", seed: null, destination: "/admin/spaces" },
  { id: "custom", seed: { kind: "service", priceDisplay: "quote", amountCents: null, bookingMode: "request" }, destination: null },
  { id: "package", seed: { kind: "package", priceType: "flat_package" }, destination: null },
  { id: "pass", seed: null, destination: null },
  { id: "gift", seed: null, destination: null },
];

// ── Package 2: packages and price phases ─────────────────────────────

/** The sentence key for an engine reason; an unknown reason reads as `unavailable`. */
export function engineRefusalKey(reason: string): string {
  return (SCHEDULING_ENGINE_REFUSAL_CODES as readonly string[]).includes(reason)
    ? `dashboard.scheduling.engine.refusal.${reason}`
    : SCHEDULING_ENGINE_REFUSALS.unavailable;
}

/**
 * Proportional value of each component: qty x list price over the sum,
 * the remainder on the last row so the parts sum to the package exactly.
 * Same weights as `packageRefundShare` (`lib/catalog/packages.ts`), so the
 * editor shows what a refund would split. Null when nothing can be weighed.
 */
export function packageAllocation(
  packageCents: number | null,
  rows: ReadonlyArray<{ qty: number; unitCents: number | null }>,
): Array<number | null> {
  const weights = rows.map((r) => Math.max(0, r.qty) * Math.max(0, r.unitCents ?? 0));
  const sum = weights.reduce((n, w) => n + w, 0);
  if (packageCents == null || sum <= 0) return rows.map(() => null);
  let allocated = 0;
  return weights.map((w, i) => {
    const cents = i === weights.length - 1 ? packageCents - allocated : Math.floor((packageCents * w) / sum);
    allocated += cents;
    return cents;
  });
}

export type PhaseState = "live" | "upcoming" | "ended";

export const PHASE_STATE_KEY: Record<PhaseState, string> = {
  live: "dashboard.catalog.phases.state.live",
  upcoming: "dashboard.catalog.phases.state.upcoming",
  ended: "dashboard.catalog.phases.state.ended",
};

/**
 * Mirrors `livePhasePrice`: started and not yet ended is live. Compared as
 * instants, not strings: Postgres returns `+00:00` and the browser `Z`, and
 * a string compare of the two disagrees at the boundary.
 */
export function phaseState(p: { startsAt: string; endsAt: string | null }, nowIso: string): PhaseState {
  const now = Date.parse(nowIso);
  if (Date.parse(p.startsAt) > now) return "upcoming";
  if (p.endsAt && Date.parse(p.endsAt) <= now) return "ended";
  return "live";
}
