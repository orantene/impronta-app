/**
 * W5-T6 — runtime CSS generator for operator-defined custom breakpoint tiers.
 *
 * The built-in tablet (≤1023px) / mobile (≤640px) section overrides live as
 * static rules in `token-presets.css`. Custom tiers can't be static (their
 * thresholds are operator-chosen), so we generate the equivalent `@media`
 * block at runtime from the SAME value vocabulary.
 *
 * Custom tiers use the **intermediate (tablet) value scale** — a single,
 * predictable mapping documented here and in the responsive panel. Each tier
 * matches `data-section-<id>-*` attrs emitted by `presentationDataAttrs`
 * (see `presentation.ts`), mirroring the static tablet rules exactly.
 *
 * Pure + deterministic (no DOM) so it is unit-tested; the thin
 * `<BreakpointStyleEngine>` component renders the result into a <style>.
 */
import type { CustomBreakpoint } from "@/lib/site-admin/sections/shared/presentation";

// Mirrors token-presets.css @media (max-width: 1023px) — the tablet scale.
const BACKGROUND: Record<string, string> = {
  ivory: "background: #f6f1ea;",
  champagne: "background: linear-gradient(180deg, #f1e5d1 0%, #efe7db 100%);",
  espresso: "background: #2d2623; color: #f6f1ea;",
  blush: "background: #ead3ce;",
  sage: "background: #c7cdc0;",
  "muted-surface": "background: var(--token-color-surface-raised, #ffffff);",
};
const PADDING_TOP: Record<string, string> = {
  none: "padding-top: 0 !important;",
  tight: "padding-top: 32px !important;",
  standard: "padding-top: 64px !important;",
  airy: "padding-top: 112px !important;",
  editorial: "padding-top: clamp(56px, 8vw, 112px) !important;",
};
const PADDING_BOTTOM: Record<string, string> = {
  none: "padding-bottom: 0 !important;",
  tight: "padding-bottom: 32px !important;",
  standard: "padding-bottom: 64px !important;",
  airy: "padding-bottom: 112px !important;",
  editorial: "padding-bottom: clamp(56px, 8vw, 112px) !important;",
};
const CONTAINER: Record<string, string> = {
  narrow: "width: 720px !important; max-width: calc(100% - 32px);",
  standard: "width: 880px !important; max-width: calc(100% - 32px);",
  wide: "width: 960px !important; max-width: calc(100% - 32px);",
  editorial: "width: min(960px, 100% - 32px) !important;",
  "full-bleed":
    "width: 100% !important; max-width: 100% !important; padding-inline: 0 !important;",
};
const ALIGN: Record<string, string> = {
  left: "text-align: left;",
  center: "text-align: center;",
  right: "text-align: right;",
};
const DIVIDER: Record<string, string> = {
  none: "border-top: 0; background-image: none;",
  "thin-line": "border-top: 1px solid var(--token-color-line, #e5dcce);",
  "gradient-fade":
    "border-top: 1px solid transparent; background-image: linear-gradient(90deg, transparent, var(--token-color-line, #e5dcce), transparent); background-repeat: no-repeat; background-size: 60% 1px; background-position: top center;",
};

const SLUG = /^[a-z][a-z0-9-]*$/;
const MIN_PX = 360;
const MAX_PX = 2560;

/**
 * Built-in extra tiers shipped today (beyond the static desktop/tablet/mobile):
 *   - `wide`    — small-laptop band (≤1280px); lets operators tune the
 *                 1024–1280 range the base "desktop" couldn't reach.
 *   - `compact` — small phones (≤480px); finer control below the mobile tier.
 * Operator-TYPED thresholds (per-page definitions) are the engine-ready
 * fast-follow — the generator already accepts arbitrary tiers; this constant
 * is simply the zero-persistence default set.
 */
export const BUILTIN_EXTRA_TIERS: ReadonlyArray<CustomBreakpoint> = [
  { id: "wide", label: "Wide", maxWidthPx: 1280 },
  { id: "compact", label: "Compact", maxWidthPx: 480 },
];

/**
 * Built-in tier ids that render via the STATIC stylesheet in `render.tsx`
 * (the `@media (max-width:900px)` / `@media (max-width:640px)` blocks). The
 * runtime generators skip these so they never double-emit / conflict with the
 * static rules — they only ever produce CSS for operator-defined custom tiers.
 */
const BUILTIN_TIER_IDS: ReadonlySet<string> = new Set(["tablet", "mobile"]);

/**
 * Builder 2026 "first-class responsive" — runtime CSS for custom-tier CONTAINER
 * LAYOUT overrides (`BuilderContainerNode.props.responsive[<tierId>]`). Mirrors
 * the static container rules in `render.tsx` byte-for-byte (the
 * `data-builder-<tier>-layout` stack/row/grid rules + the `--bn-<tier>-columns`
 * grid/masonry threading), but for any operator-chosen tier id + threshold.
 *
 * Built-in `tablet`/`mobile` are skipped (the static sheet owns them), so this
 * is purely additive and can never change how an existing design renders.
 */
function containerLayoutRulesFor(id: string): string {
  return [
    `  .site-builder-node--container[data-builder-${id}-layout="stack"]{display:flex;flex-direction:column}`,
    `  .site-builder-node--container[data-builder-${id}-layout="row"]{display:flex;flex-direction:row;flex-wrap:wrap}`,
    `  .site-builder-node--container[data-builder-${id}-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-${id}-columns,var(--bn-columns,2)),minmax(0,1fr))}`,
  ].join("\n");
}

/** Module-level cache: tiers array identity → generated container-layout CSS. */
const containerLayoutCssCache = new WeakMap<object, string>();

/**
 * Build the runtime stylesheet for custom-tier container-layout overrides.
 * Widest threshold first (so a narrower custom tier wins at equal specificity),
 * mirroring {@link generateCustomBreakpointCss}. Invalid / built-in / duplicate
 * tiers are dropped.
 */
export function generateContainerLayoutCss(
  tiers: readonly CustomBreakpoint[] | undefined | null,
): string {
  if (!tiers || tiers.length === 0) return "";
  const cached = containerLayoutCssCache.get(tiers);
  if (cached !== undefined) return cached;
  const seen = new Set<string>();
  const valid = tiers
    .filter(
      (t) =>
        !!t &&
        SLUG.test(t.id) &&
        !BUILTIN_TIER_IDS.has(t.id) &&
        Number.isFinite(t.maxWidthPx) &&
        t.maxWidthPx >= MIN_PX &&
        t.maxWidthPx <= MAX_PX,
    )
    .sort((a, b) => b.maxWidthPx - a.maxWidthPx);
  const blocks: string[] = [];
  for (const t of valid) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    blocks.push(
      `@media (max-width: ${Math.round(t.maxWidthPx)}px) {\n${containerLayoutRulesFor(
        t.id,
      )}\n}`,
    );
  }
  const result = blocks.join("\n\n");
  containerLayoutCssCache.set(tiers, result);
  return result;
}

function rulesFor(id: string): string {
  const lines: string[] = [];
  for (const [v, decl] of Object.entries(BACKGROUND))
    lines.push(`  [data-section-${id}-background="${v}"] { ${decl} }`);
  for (const [v, decl] of Object.entries(PADDING_TOP))
    lines.push(`  [data-section-${id}-padding-top="${v}"] { ${decl} }`);
  for (const [v, decl] of Object.entries(PADDING_BOTTOM))
    lines.push(`  [data-section-${id}-padding-bottom="${v}"] { ${decl} }`);
  for (const [v, decl] of Object.entries(CONTAINER))
    lines.push(
      `  [data-section-${id}-container="${v}"] > * > *[class*="__inner"],\n` +
        `  [data-section-${id}-container="${v}"] > *[class*="__inner"] { ${decl} }`,
    );
  for (const [v, decl] of Object.entries(ALIGN))
    lines.push(`  [data-section-${id}-align="${v}"] { ${decl} }`);
  for (const [v, decl] of Object.entries(DIVIDER))
    lines.push(`  [data-section-${id}-divider-top="${v}"] { ${decl} }`);
  return lines.join("\n");
}

/** Module-level cache: tiers array identity → generated CSS string. */
const generateCustomBreakpointCssCache = new WeakMap<object, string>();

/**
 * Build the runtime stylesheet for all valid custom tiers. Widest threshold
 * first so a narrower custom tier (later in source order) wins at equal
 * specificity when a section sets overrides on overlapping tiers. Invalid
 * tiers (bad slug / out-of-range px) and duplicate ids are dropped.
 */
export function generateCustomBreakpointCss(
  tiers: readonly CustomBreakpoint[] | undefined | null,
): string {
  if (!tiers || tiers.length === 0) return "";
  const cached = generateCustomBreakpointCssCache.get(tiers);
  if (cached !== undefined) return cached;
  const seen = new Set<string>();
  const valid = tiers
    .filter(
      (t) =>
        !!t &&
        SLUG.test(t.id) &&
        !BUILTIN_TIER_IDS.has(t.id) &&
        Number.isFinite(t.maxWidthPx) &&
        t.maxWidthPx >= MIN_PX &&
        t.maxWidthPx <= MAX_PX,
    )
    .sort((a, b) => b.maxWidthPx - a.maxWidthPx);
  const blocks: string[] = [];
  for (const t of valid) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    blocks.push(
      `@media (max-width: ${Math.round(t.maxWidthPx)}px) {\n${rulesFor(t.id)}\n}`,
    );
  }
  const result = blocks.join("\n\n");
  generateCustomBreakpointCssCache.set(tiers, result);
  return result;
}
