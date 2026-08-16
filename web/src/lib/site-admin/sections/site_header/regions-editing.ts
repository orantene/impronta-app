/**
 * WF-6 — the pure editing model behind the header REGIONS editor.
 *
 * The renderer for `regions` shipped in WF-5 (`Component.tsx`, the
 * `data-variant="freeform"` branch) but nothing ever WROTE the value. This
 * module is the write side's brain: seeding, add / remove / reorder / move,
 * and the per-kind defaults. It is deliberately React-free and Supabase-free
 * so the operations that must never lose an item are testable as plain
 * functions (`regions-editing.test.ts`) rather than only through a drawer.
 *
 * Two hard rules the callers rely on:
 *
 *   1. EVERY OPERATION IS PURE. Nothing mutates its input; each returns a
 *      fresh `HeaderRegions`. The inspector keeps an optimistic copy in React
 *      state and posts the same value to the server, so a shared mutation
 *      would desync the canvas from the save payload.
 *   2. NO OPERATION INVENTS OR DROPS CONTENT. Items are PLACEMENTS: they
 *      reference the existing header config (navItems / socialLinks /
 *      contactLinks / brand / primaryCta). Removing a `nav` item removes it
 *      from the bar, never from the tenant's navigation.
 */

import type { HeaderItem, SiteHeaderV1 } from "./schema";

/** The three placement zones, in visual order. */
export const HEADER_ZONES = ["left", "center", "right"] as const;
export type HeaderZone = (typeof HEADER_ZONES)[number];

/** The stored value: one item list per zone. */
export type HeaderRegions = NonNullable<SiteHeaderV1["regions"]>;

/** Schema ceiling (`schema.ts`: `z.array(headerItemSchema).max(8)`). */
export const MAX_ITEMS_PER_ZONE = 8;

/** Every item kind the schema accepts, in palette order. */
export const HEADER_ITEM_KINDS = [
  "logo",
  "wordmark",
  "nav",
  "cta",
  "inquiry",
  "saved",
  "social",
  "phone",
  "language",
  "spacer",
] as const;
export type HeaderItemKind = (typeof HEADER_ITEM_KINDS)[number];

/**
 * Overflow priority defaults. Lower collapses into the menu first, so the
 * brand (100) survives longest and a decorative spacer (0) goes first. These
 * are the same relative ranking the classic variants express through CSS
 * `display:none` breakpoints, written down as numbers.
 */
const DEFAULT_PRIORITY: Record<HeaderItemKind, number> = {
  logo: 100,
  wordmark: 95,
  nav: 80,
  cta: 70,
  inquiry: 65,
  saved: 55,
  phone: 50,
  social: 40,
  language: 30,
  spacer: 0,
};

/** A fresh item of `kind`, carrying only its default priority. */
export function defaultItemForKind(kind: HeaderItemKind): HeaderItem {
  return { type: kind, priority: DEFAULT_PRIORITY[kind] } as HeaderItem;
}

/** An empty regions value (all three zones present, all empty). */
export function emptyRegions(): HeaderRegions {
  return { left: [], center: [], right: [] };
}

function cloneRegions(regions: HeaderRegions): HeaderRegions {
  return {
    left: [...regions.left],
    center: [...regions.center],
    right: [...regions.right],
  };
}

/** Total item count across all three zones. */
export function countItems(regions: HeaderRegions): number {
  return regions.left.length + regions.center.length + regions.right.length;
}

/** True when `zone` is already at the schema's 8-item ceiling. */
export function zoneIsFull(regions: HeaderRegions, zone: HeaderZone): boolean {
  return regions[zone].length >= MAX_ITEMS_PER_ZONE;
}

/**
 * Append a new item of `kind` to `zone`. Returns the input unchanged when the
 * zone is already full, so the caller can keep its "add" affordance disabled
 * rather than silently dropping the click.
 */
export function addItem(
  regions: HeaderRegions,
  zone: HeaderZone,
  kind: HeaderItemKind,
): HeaderRegions {
  if (zoneIsFull(regions, zone)) return regions;
  const next = cloneRegions(regions);
  next[zone] = [...next[zone], defaultItemForKind(kind)];
  return next;
}

/** Drop the item at `index` in `zone`. Out-of-range index is a no-op. */
export function removeItem(
  regions: HeaderRegions,
  zone: HeaderZone,
  index: number,
): HeaderRegions {
  if (index < 0 || index >= regions[zone].length) return regions;
  const next = cloneRegions(regions);
  next[zone] = next[zone].filter((_, i) => i !== index);
  return next;
}

/** Replace the item at `index` in `zone`. Out-of-range index is a no-op. */
export function updateItem(
  regions: HeaderRegions,
  zone: HeaderZone,
  index: number,
  item: HeaderItem,
): HeaderRegions {
  if (index < 0 || index >= regions[zone].length) return regions;
  const next = cloneRegions(regions);
  next[zone] = next[zone].map((it, i) => (i === index ? item : it));
  return next;
}

/**
 * Move one item to an arbitrary (zone, index) slot. This is the single
 * primitive behind BOTH gestures the editor offers:
 *
 *   - reorder inside a zone  → `fromZone === toZone`
 *   - move across zones      → `fromZone !== toZone`
 *
 * `toIndex` is an INSERTION index computed against the list AFTER the item has
 * been lifted out, which is what a drop indicator between two rows means. It
 * is clamped, so "move down" past the end parks the item last instead of
 * losing it. A move into a full destination zone is refused (input returned
 * unchanged) rather than silently truncated by the schema on save.
 */
export function moveItem(
  regions: HeaderRegions,
  from: { zone: HeaderZone; index: number },
  to: { zone: HeaderZone; index: number },
): HeaderRegions {
  if (from.index < 0 || from.index >= regions[from.zone].length) return regions;
  if (from.zone !== to.zone && zoneIsFull(regions, to.zone)) return regions;

  const next = cloneRegions(regions);
  const source = [...next[from.zone]];
  const [moved] = source.splice(from.index, 1);
  if (!moved) return regions;
  next[from.zone] = source;

  const target = from.zone === to.zone ? source : [...next[to.zone]];
  const at = Math.max(0, Math.min(to.index, target.length));
  target.splice(at, 0, moved);
  next[to.zone] = target;
  return next;
}

/** Nudge an item one slot up/down inside its zone (the keyboard fallback). */
export function nudgeItem(
  regions: HeaderRegions,
  zone: HeaderZone,
  index: number,
  direction: -1 | 1,
): HeaderRegions {
  const target = index + direction;
  if (target < 0 || target >= regions[zone].length) return regions;
  return moveItem(regions, { zone, index }, { zone, index: target });
}

// ── Seeding from the classic variant ────────────────────────────────────────

/**
 * What the tenant's header currently CONTAINS. Everything here is derived from
 * config the operator already has; the seeder never invents an item for
 * content that does not exist (a tenant with no social links gets no `social`
 * item, exactly like the classic renderer shows no cluster).
 */
export interface HeaderSeedFacts {
  variant: string;
  /** `image` | `text` | `image-and-text`. */
  brandDisplay: string;
  /** A brand logo actually resolves for this tenant. */
  hasLogo: boolean;
  /** `brand.label` is set. */
  hasWordmark: boolean;
  navItemCount: number;
  hasPrimaryCta: boolean;
  socialCount: number;
  hasPhone: boolean;
  /** The locale switcher would render (more than one active locale). */
  showLanguage: boolean;
}

function brandItems(facts: HeaderSeedFacts): HeaderItem[] {
  const wantsImage =
    facts.brandDisplay === "image" || facts.brandDisplay === "image-and-text";
  const wantsText =
    facts.brandDisplay === "text" || facts.brandDisplay === "image-and-text";
  const out: HeaderItem[] = [];
  if (wantsImage && facts.hasLogo) out.push(defaultItemForKind("logo"));
  if (wantsText && facts.hasWordmark) out.push(defaultItemForKind("wordmark"));
  return out;
}

function leadClusterItems(facts: HeaderSeedFacts): HeaderItem[] {
  const out: HeaderItem[] = [];
  if (facts.socialCount > 0) out.push(defaultItemForKind("social"));
  if (facts.hasPhone) out.push(defaultItemForKind("phone"));
  return out;
}

function utilityItems(facts: HeaderSeedFacts): HeaderItem[] {
  return facts.showLanguage ? [defaultItemForKind("language")] : [];
}

/**
 * Variants whose classic layout uses a SECOND ROW (a centred brand stacked
 * over a centred nav, or a column). `regions` renders exactly one row, so
 * seeding from one of these folds that second row into the single row. The
 * editor tells the operator this BEFORE they seed instead of letting them
 * discover it on the canvas.
 */
export const STACKED_VARIANTS: ReadonlySet<string> = new Set([
  "minimal",
  "editorial",
  "editorial-split",
]);

/**
 * Build a `regions` value that mirrors what the tenant's CURRENT variant
 * renders, so turning the custom layout on is a starting point rather than a
 * blank header.
 *
 * The mapping follows the classic renderer's own DOM order (lead cluster →
 * brand → nav → actions) and each variant's CSS:
 *
 *   standard         flex space-between, brand left / nav right
 *   split            `grid-template-columns: 1fr auto 1fr`, brand centred
 *   minimal          column, everything centred
 *   editorial        column, centred wordmark with the nav on its own row
 *   editorial-split  cluster left, centred brand, utilities right, nav row
 *                    beneath, and NO inline CTA (the renderer suppresses it)
 *
 * The three stacked variants cannot keep their second row in a one-row
 * layout; their items land in the centre zone in the same reading order.
 */
export function seedRegionsFromVariant(facts: HeaderSeedFacts): HeaderRegions {
  const brand = brandItems(facts);
  const cluster = leadClusterItems(facts);
  const utilities = utilityItems(facts);
  const nav =
    facts.navItemCount > 0 ? [defaultItemForKind("nav")] : ([] as HeaderItem[]);
  const cta = facts.hasPrimaryCta
    ? [defaultItemForKind("cta")]
    : ([] as HeaderItem[]);

  switch (facts.variant) {
    case "split":
      return {
        left: cluster,
        center: brand,
        right: [...nav, ...cta, ...utilities],
      };
    case "minimal":
    case "editorial":
      return {
        left: [],
        center: [...cluster, ...brand, ...nav, ...cta, ...utilities],
        right: [],
      };
    case "editorial-split":
      // The renderer suppresses the inline CTA for this variant, so seeding
      // one would ADD a button the operator never had.
      return {
        left: cluster,
        center: brand,
        right: [...nav, ...utilities],
      };
    case "standard":
    default:
      return {
        left: [...cluster, ...brand],
        center: [],
        right: [...nav, ...cta, ...utilities],
      };
  }
}
