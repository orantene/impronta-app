/**
 * AI builder generator — coercion for the two NATIVE, server-data-bound kinds
 * (`hero_search`, `talent_type_grid`), split out of `generate-nodes.ts` to keep
 * that file inside the 800-line budget.
 *
 * THE ONE RULE THIS FILE ENFORCES: on a native data block the model contributes
 * COPY ONLY.
 *
 * Both coercers are ALLOW-LIST shaped — they build a fresh props object key by
 * key and never spread the model's object — so an unknown prop cannot survive by
 * default; it has to be named here to exist at all. On top of that,
 * `NATIVE_DATA_BLOCK_FORBIDDEN_PROPS` names, and a test asserts, the specific
 * props that a human operator legitimately sets in the inspector but the model
 * must never contribute:
 *
 *  - `selectedTermIds` / `items[].taxonomyTermId` — real `taxonomy_terms` ids.
 *    `selectedTermIds` is threaded into `fetchTenantTalentDisciplines`
 *    (components/home/homepage-cms-data-sources.ts) and narrows the resolved set
 *    again in the renderer. A model cannot know a real id, so anything it emits
 *    is a hallucination that silently empties the grid, or a guess at some other
 *    tenant's taxonomy. Dropping them means NO model-supplied value ever reaches
 *    a tenant data query: the only inputs the resolver still takes from the node
 *    are `mode` and `maxItems`, both clamped to a fixed enum / 1..18 integer.
 *
 *  - every href (`searchActionHref`, the two CTA hrefs, `chips[].href`,
 *    `seeAllHref`, `items[].href`) and `items[].imageUrl` / `imageAlt` /
 *    `imagePosition`. The renderer already defaults every href to the
 *    tenant-prefixed `/directory` and renders `imageUrl` as a raw `<img src>`,
 *    so dropping them costs nothing and removes the outbound-URL surface
 *    entirely — the same reason `IMAGE_ROLE_TO_PHOTO` discards a model-supplied
 *    image `src`.
 *
 * The tenant scope itself is never in the node at all: it is resolved
 * server-side by `lib/site-admin/server/native-data-block-sources.ts` from the
 * caller's own tenant id, and the renderer only reads the resolved values off
 * `dataSources`. There is no field on either node for a tenant.
 */

import {
  HERO_SEARCH_LAYOUTS,
  HERO_SEARCH_STAT_SOURCES,
  TALENT_TYPE_GRID_CARD_RATIOS,
  TALENT_TYPE_GRID_MODES,
  TALENT_TYPE_GRID_TEXT_POSITIONS,
} from "./generation-allowed-kinds";

/** Trim + length-clamp a model string; empty/non-string → null. */
export function clampString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

/** Keep a model string only when it is one of a fixed enum (no guessing, no repair). */
export function pickEnum<T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
): T | undefined {
  return typeof value === "string" && (allowed as ReadonlyArray<string>).includes(value)
    ? (value as T)
    : undefined;
}

/** Keep a model number only when it is an integer inside an inclusive range. */
export function pickInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n >= min && n <= max ? n : undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Coerce a model-emitted `hero_search` into guaranteed-schema-valid props, or
 * null to drop the node. Max lengths mirror `heroSearchPropsSchema`.
 */
export function coerceHeroSearchProps(
  rawProps: Record<string, unknown>,
  style: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  // A search hero with no headline is an empty band; drop it and let the
  // repaired tree keep the rest of the page.
  const headline = clampString(rawProps.headline, 200);
  if (!headline) return null;

  const props: Record<string, unknown> = { headline };
  if (style) props.style = style;

  const eyebrow = clampString(rawProps.eyebrow, 60);
  if (eyebrow) props.eyebrow = eyebrow;
  const highlight = clampString(rawProps.highlight, 120);
  if (highlight) props.highlight = highlight;
  const subheadline = clampString(rawProps.subheadline, 320);
  if (subheadline) props.subheadline = subheadline;

  // The search form is the whole point of this block, so it stays ON unless the
  // model explicitly turns it off. `searchActionHref` is NOT read: the renderer
  // resolves the tenant-prefixed `/directory` route itself.
  if (rawProps.searchEnabled === false) props.searchEnabled = false;
  const searchPlaceholder = clampString(rawProps.searchPlaceholder, 120);
  if (searchPlaceholder) props.searchPlaceholder = searchPlaceholder;
  const searchSubmitLabel = clampString(rawProps.searchSubmitLabel, 40);
  if (searchSubmitLabel) props.searchSubmitLabel = searchSubmitLabel;

  // CTA LABELS only. Both hrefs default to `/directory` in the renderer.
  const primaryCtaLabel = clampString(rawProps.primaryCtaLabel, 60);
  if (primaryCtaLabel) props.primaryCtaLabel = primaryCtaLabel;
  const secondaryCtaLabel = clampString(rawProps.secondaryCtaLabel, 60);
  if (secondaryCtaLabel) props.secondaryCtaLabel = secondaryCtaLabel;

  // Quick-filter chips: LABELS only. A model-invented `?tax=<id>` chip href
  // would be a filter that matches nothing, so every chip links to the
  // unfiltered directory instead.
  const rawChips = Array.isArray(rawProps.chips) ? rawProps.chips : [];
  const chips: Array<{ label: string }> = [];
  for (const raw of rawChips.slice(0, 12)) {
    const label = clampString(asObject(raw)?.label, 60);
    if (label) chips.push({ label });
  }
  if (chips.length > 0) props.chips = chips;

  // The stat line is EITHER the roster-derived count (resolved server-side from
  // the caller's own tenant) OR manual copy — never both.
  const statSource = pickEnum(rawProps.statSource, HERO_SEARCH_STAT_SOURCES);
  if (statSource === "tenant_talent_count") {
    props.statSource = "tenant_talent_count";
    const statCountLabel = clampString(rawProps.statCountLabel, 80);
    if (statCountLabel) props.statCountLabel = statCountLabel;
  } else {
    const rawStats = Array.isArray(rawProps.statItems) ? rawProps.statItems : [];
    const statItems: Array<{ value: string; label: string }> = [];
    for (const raw of rawStats.slice(0, 4)) {
      const item = asObject(raw);
      const value = clampString(item?.value, 24);
      const label = clampString(item?.label, 60);
      if (value && label) statItems.push({ value, label });
    }
    if (statItems.length > 0) {
      props.statSource = "manual";
      props.statItems = statItems;
    }
  }

  const layout = pickEnum(rawProps.layout, HERO_SEARCH_LAYOUTS);
  if (layout) props.layout = layout;

  return props;
}

/**
 * Coerce a model-emitted `talent_type_grid` into guaranteed-schema-valid props,
 * or null to drop the node. Max lengths mirror `talentTypeGridPropsSchema`.
 */
export function coerceTalentTypeGridProps(
  rawProps: Record<string, unknown>,
  style: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const headline = clampString(rawProps.headline, 200);
  if (!headline) return null;

  const props: Record<string, unknown> = { headline };
  if (style) props.style = style;

  const eyebrow = clampString(rawProps.eyebrow, 60);
  if (eyebrow) props.eyebrow = eyebrow;
  const subheadline = clampString(rawProps.subheadline, 320);
  if (subheadline) props.subheadline = subheadline;

  // Manual cards: LABEL + DESCRIPTION only. `taxonomyTermId`, `href`, and the
  // three image props are dropped — see the file header.
  const rawItems = Array.isArray(rawProps.items) ? rawProps.items : [];
  const items: Array<Record<string, unknown>> = [];
  for (const raw of rawItems.slice(0, 18)) {
    const item = asObject(raw);
    const label = clampString(item?.label, 80);
    if (!label) continue;
    const card: Record<string, unknown> = { label };
    const description = clampString(item?.description, 200);
    if (description) card.description = description;
    if (item?.featured === true) card.featured = true;
    items.push(card);
  }

  // `dynamic` is the mode that shows the agency's REAL roster, so it is the
  // default and the fallback: a manual grid the model gave no usable cards for
  // becomes a dynamic one rather than an empty band.
  const mode = pickEnum(rawProps.mode, TALENT_TYPE_GRID_MODES);
  if (mode === "manual" && items.length > 0) {
    props.mode = "manual";
    props.items = items;
  } else {
    props.mode = "dynamic";
    // `parentCategoryMode` rolls child talent types up to their parent category.
    // It is a pure boolean shape switch with no id in it, so the model may set it.
    if (rawProps.parentCategoryMode === true) props.parentCategoryMode = true;
  }

  // `maxItems` DOES reach the server resolver — as a clamped 1..18 integer, the
  // one and only model-influenced value the query sees, and a bounded page-size
  // cap rather than a selector. `selectedTermIds` (the actual selector) is not
  // read here at all.
  const maxItems = pickInt(rawProps.maxItems, 1, 18);
  if (maxItems !== undefined) props.maxItems = maxItems;
  const columns = pickInt(rawProps.columns, 1, 6);
  if (columns !== undefined) props.columns = columns;

  if (typeof rawProps.showCount === "boolean") props.showCount = rawProps.showCount;
  if (typeof rawProps.showDescriptions === "boolean") {
    props.showDescriptions = rawProps.showDescriptions;
  }
  // Images can only come from a dropped `imageUrl`, so a generated grid is
  // always text-first. Say so explicitly instead of leaving empty media slots.
  props.showImages = false;

  const cardRatio = pickEnum(rawProps.cardRatio, TALENT_TYPE_GRID_CARD_RATIOS);
  if (cardRatio) props.cardRatio = cardRatio;
  const textPosition = pickEnum(rawProps.textPosition, TALENT_TYPE_GRID_TEXT_POSITIONS);
  if (textPosition) props.textPosition = textPosition;

  // "See all" LABEL only; the renderer points it at `/directory`.
  const seeAllLabel = clampString(rawProps.seeAllLabel, 40);
  if (seeAllLabel) props.seeAllLabel = seeAllLabel;
  const emptyStateText = clampString(rawProps.emptyStateText, 240);
  if (emptyStateText) props.emptyStateText = emptyStateText;

  return props;
}
