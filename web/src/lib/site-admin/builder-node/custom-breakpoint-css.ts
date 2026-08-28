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

/** True for an operator-defined custom tier id the generators will emit. */
export function isCustomBreakpointTierId(id: string): boolean {
  return SLUG.test(id) && !BUILTIN_TIER_IDS.has(id);
}

/**
 * Compose stacked backgroundLayers into a CSS background-image value.
 * Mirrors the desktop inline path in `render.tsx` so a breakpoint lane that
 * stores layers emits the same stack, not a snapped approximation.
 */
export function composeBackgroundLayersCss(
  layers:
    | ReadonlyArray<{ type: "gradient" | "image" | "color"; value: string }>
    | undefined
    | null,
): string | undefined {
  if (!layers || layers.length === 0) return undefined;
  return layers
    .map((layer) =>
      layer.type === "color"
        ? `linear-gradient(${layer.value},${layer.value})`
        : layer.value,
    )
    .join(",");
}

/**
 * Extra responsive lanes that the static tablet/mobile sheet did not ship:
 * line-clamp, stacked backgroundLayers, sticky pin. Interpolated into the
 * static sheet (B8) AND into generated custom-tier CSS (B5).
 */
export function extraResponsiveLaneRules(id: string): string {
  const n = `.site-builder-node`;
  const a = `data-builder-style-${id}-`;
  const offset = `var(--bn-${id}-sticky-offset,0px)`;
  return (
    `${n}[${a}line-clamp]{display:-webkit-box!important;-webkit-box-orient:vertical!important;overflow:hidden!important;-webkit-line-clamp:var(--bn-${id}-line-clamp)!important}` +
    `${n}[${a}bg-layers]{background-image:var(--bn-${id}-bg-layers)!important}` +
    `${n}:is([${a}sticky-anchor="top"],[${a}sticky-anchor="bottom"]):not([${a}position]){position:sticky!important}` +
    `${n}[${a}sticky-anchor="top"]:not([${a}inset-top]){top:${offset}!important}` +
    `${n}[${a}sticky-anchor="bottom"]:not([${a}inset-bottom]){bottom:${offset}!important}`
  );
}

/**
 * BuilderNodeStyle lanes for one custom tier. Mirrors the static tablet
 * `@media (max-width:900px)` block in `render.tsx` (presence attr → CSS var),
 * so a freeform node with `style.responsive.wide.paddingTop = "1.5rem"` emits
 * that exact authored value through `--bn-wide-padding-top`. Curated token
 * maps stay in {@link rulesFor}; this is additive and never snaps raw values
 * to ivory/tight/narrow.
 */
export function freeformStyleRulesFor(id: string): string {
  const sel = (attr: string) =>
    `.site-builder-node[data-builder-style-${id}-${attr}]`;
  const v = (name: string) => `var(--bn-${id}-${name})`;
  const rule = (attr: string, decl: string) => `  ${sel(attr)}{${decl}}`;
  const sizeClamp: Record<string, string> = {
    sm: "clamp(0.9rem,1vw,1rem)",
    md: "clamp(1rem,1.3vw,1.25rem)",
    lg: "clamp(1.35rem,2vw,2.25rem)",
    xl: "clamp(2rem,4vw,4.5rem)",
    display: "clamp(3.5rem,6vw,6rem)",
  };
  const paraClamp: Record<string, string> = {
    lg: "clamp(1.1rem,1.45vw,1.45rem)",
    xl: "clamp(1.25rem,1.8vw,1.8rem)",
    display: "clamp(2rem,4vw,4.5rem)",
  };
  const lines: string[] = [
    rule("align", `text-align:${v("align")}!important`),
    ...Object.entries(sizeClamp).map(
      ([k, css]) =>
        `  .site-builder-node[data-builder-style-${id}-size="${k}"]{font-size:${css}!important}`,
    ),
    ...Object.entries(paraClamp).map(
      ([k, css]) =>
        `  .site-builder-node--paragraph[data-builder-style-${id}-size="${k}"]{font-size:${css}!important}`,
    ),
    rule("tone", `color:${v("color")}!important`),
    rule("width", `max-width:${v("max-width")}!important`),
    rule("margin-top", `margin-top:${v("margin-top")}!important`),
    rule("margin-bottom", `margin-bottom:${v("margin-bottom")}!important`),
    rule(
      "padding-x",
      `padding-left:${v("padding-x")}!important;padding-right:${v("padding-x")}!important`,
    ),
    rule(
      "padding-y",
      `padding-top:${v("padding-y")}!important;padding-bottom:${v("padding-y")}!important`,
    ),
    rule("background", `background:${v("background")}!important`),
    rule("radius", `border-radius:${v("radius")}!important`),
    rule("fit", `object-fit:${v("fit")}!important`),
    rule(
      "object-position",
      `object-position:${v("object-position")}!important`,
    ),
    rule("ratio", `aspect-ratio:${v("ratio")}!important`),
    rule("aspect-free", `aspect-ratio:${v("aspect-free")}!important`),
    rule("hidden", "display:none!important"),
    rule("font-family", `font-family:${v("font-family")}!important`),
    rule("font-size", `font-size:${v("font-size")}!important`),
    rule("font-weight", `font-weight:${v("font-weight")}!important`),
    rule("line-height", `line-height:${v("line-height")}!important`),
    rule("letter-spacing", `letter-spacing:${v("letter-spacing")}!important`),
    rule("text-transform", `text-transform:${v("text-transform")}!important`),
    rule("font-style", `font-style:${v("font-style")}!important`),
    rule("text-decoration", `text-decoration:${v("text-decoration")}!important`),
    rule("text-color", `color:${v("text-color")}!important`),
    rule("bg-color", `background-color:${v("bg-color")}!important`),
    rule("border-color", `border-color:${v("border-color")}!important`),
    rule("border-width", `border-width:${v("border-width")}!important`),
    rule("border-style", `border-style:${v("border-style")}!important`),
    rule("free-width", `width:${v("free-width")}!important`),
    rule("height", `height:${v("height")}!important`),
    rule("min-height", `min-height:${v("min-height")}!important`),
    rule("min-width", `min-width:${v("min-width")}!important`),
    rule("max-width-free", `max-width:${v("max-width-free")}!important`),
    rule("max-height", `max-height:${v("max-height")}!important`),
    rule("padding-top", `padding-top:${v("padding-top")}!important`),
    rule("padding-right", `padding-right:${v("padding-right")}!important`),
    rule("padding-bottom", `padding-bottom:${v("padding-bottom")}!important`),
    rule("padding-left", `padding-left:${v("padding-left")}!important`),
    rule("margin-top-free", `margin-top:${v("margin-top-free")}!important`),
    rule("margin-right-free", `margin-right:${v("margin-right-free")}!important`),
    rule(
      "margin-bottom-free",
      `margin-bottom:${v("margin-bottom-free")}!important`,
    ),
    rule("margin-left-free", `margin-left:${v("margin-left-free")}!important`),
    rule("shadow", `box-shadow:${v("shadow")}!important`),
    rule("text-shadow", `text-shadow:${v("text-shadow")}!important`),
    rule("bg-image", `background-image:${v("bg-image")}!important`),
    rule("bg-size", `background-size:${v("bg-size")}!important`),
    rule("bg-position", `background-position:${v("bg-position")}!important`),
    rule("bg-repeat", `background-repeat:${v("bg-repeat")}!important`),
    rule("opacity", `opacity:${v("opacity")}!important`),
    rule("radius-free", `border-radius:${v("radius-free")}!important`),
    rule("gap-free", `--bn-gap:${v("gap-free")}!important`),
    rule("position", `position:${v("position")}!important`),
    rule("inset-top", `top:${v("inset-top")}!important`),
    rule("inset-right", `right:${v("inset-right")}!important`),
    rule("inset-bottom", `bottom:${v("inset-bottom")}!important`),
    rule("inset-left", `left:${v("inset-left")}!important`),
    rule("z-index", `z-index:${v("z-index")}!important`),
    rule("overflow", `overflow:${v("overflow")}!important`),
    rule("rotate", `rotate:${v("rotate")}!important`),
    rule("scale", `scale:${v("scale")}!important`),
    rule("translate", `translate:${v("translate")}!important`),
    rule("transform-origin", `transform-origin:${v("transform-origin")}!important`),
    rule("align-self", `align-self:${v("align-self")}!important`),
    rule("flex-grow", `flex-grow:${v("flex-grow")}!important`),
    rule("flex-shrink", `flex-shrink:${v("flex-shrink")}!important`),
    rule("flex-basis", `flex-basis:${v("flex-basis")}!important`),
    rule("grid-column", `grid-column:${v("grid-column")}!important`),
    rule("grid-row", `grid-row:${v("grid-row")}!important`),
    rule("order", `order:${v("order")}!important`),
    rule("filter", `filter:${v("filter")}!important`),
    rule(
      "backdrop-filter",
      `backdrop-filter:${v("backdrop-filter")}!important;-webkit-backdrop-filter:${v("backdrop-filter")}!important`,
    ),
    rule("mix-blend-mode", `mix-blend-mode:${v("mix-blend-mode")}!important`),
    rule("justify-content", `justify-content:${v("justify-content")}!important`),
    rule("align-items", `align-items:${v("align-items")}!important`),
    rule("flex-wrap", `flex-wrap:${v("flex-wrap")}!important`),
    rule(
      "grid-template-columns",
      `grid-template-columns:${v("grid-template-columns")}!important`,
    ),
    rule(
      "grid-template-rows",
      `grid-template-rows:${v("grid-template-rows")}!important`,
    ),
    rule("grid-auto-flow", `grid-auto-flow:${v("grid-auto-flow")}!important`),
    rule(
      "clip-path",
      `clip-path:${v("clip-path")}!important;-webkit-clip-path:${v("clip-path")}!important`,
    ),
    rule(
      "mask-image",
      `mask-image:${v("mask-image")}!important;-webkit-mask-image:${v("mask-image")}!important`,
    ),
    rule("text-stroke", `-webkit-text-stroke:${v("text-stroke")}!important`),
    rule("cursor", `cursor:${v("cursor")}!important`),
    rule(
      "user-select",
      `user-select:${v("user-select")}!important;-webkit-user-select:${v("user-select")}!important`,
    ),
    rule("pointer-events", `pointer-events:${v("pointer-events")}!important`),
    rule(
      "scroll-snap-type",
      `scroll-snap-type:${v("scroll-snap-type")}!important`,
    ),
    rule(
      "scroll-snap-align",
      `scroll-snap-align:${v("scroll-snap-align")}!important`,
    ),
    rule("outline", `outline:${v("outline")}!important`),
    rule("outline-offset", `outline-offset:${v("outline-offset")}!important`),
    rule("accent-color", `accent-color:${v("accent-color")}!important`),
    rule("caret-color", `caret-color:${v("caret-color")}!important`),
    rule(
      "transition",
      `transition-property:var(--bn-${id}-transition-property,var(--bn-transition-property,all))!important;transition-duration:var(--bn-${id}-transition-duration,var(--bn-transition-duration,.2s))!important;transition-timing-function:var(--bn-${id}-transition-timing-function,var(--bn-transition-timing-function,ease))!important;transition-delay:var(--bn-${id}-transition-delay,var(--bn-transition-delay,0s))!important`,
    ),
    extraResponsiveLaneRules(id),
  ];
  return lines.join("\n");
}

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
  lines.push(freeformStyleRulesFor(id));
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
