import type { CSSProperties, ReactNode } from "react";

import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { FeaturedTalentCard } from "@/lib/site-admin/sections/featured_talent/FeaturedTalentCard";
import type { FeaturedTalentCardDTO } from "@/lib/site-admin/sections/featured_talent/fetch";
import {
  isSafeRichTextHref,
  renderInlineRich,
} from "@/lib/site-admin/sections/shared/rich-text";

import { BuilderNodeCarouselTrack } from "./carousel";
import { resolveBuilderNodeRole } from "./role-bindings";
import {
  resolveInstanceChildren,
  type ComponentDefinitions,
} from "./component-instances";
import {
  buildGoogleFontsHrefForFamilies,
  collectBuilderNodeFontFamilies,
} from "./fonts-registry";
import { getBuilderIconDefinition } from "./icon-registry";
import {
  getBuilderNodeDataBinding,
  isBuilderDataBindingRepeater,
  isSafeBuilderBoundImageSrc,
  resolveBuilderDataBindingCollection,
  resolveBuilderFieldBindingValue,
  type BuilderDataSourceRecord,
  type BuilderRepeatItem,
  type BuilderFieldBindingProp,
} from "./data-bindings";
import type { BuilderNode, BuilderNodeStyle, BuilderNodeStyleValue } from "./types";

export interface BuilderNodeRenderDataSources {
  collections?: Readonly<Record<string, ReadonlyArray<BuilderDataSourceRecord>>>;
  featuredTalentProfiles?: ReadonlyArray<FeaturedTalentCardDTO>;
  talentLocations?: ReadonlyArray<{
    id: string;
    citySlug: string;
    displayName: string;
    talentCount: number;
  }>;
  directoryShortcuts?: ReadonlyArray<{
    id: string;
    slug: string;
    name: string;
  }>;
}

export interface BuilderNodeRenderOptions {
  publicPathPrefix?: string;
  mode?: "all" | "freeform";
  dataSources?: BuilderNodeRenderDataSources;
  includeRendererStyles?: boolean;
  includeFontLinks?: boolean;
  // Phase 3 — saved component definitions (componentId → master subtree root).
  // When provided, linked instances (containers tagged props.instanceOf) render
  // the master subtree LIVE with per-instance overrides. When absent or the
  // component is missing, instances fall back to their own stored children.
  components?: ComponentDefinitions;
}

type NormalizedBuilderNodeRenderOptions = Required<BuilderNodeRenderOptions> & {
  repeatItem: BuilderRepeatItem | null;
  repeatDepth: number;
};

const MAX_REPEAT_RENDER_DEPTH = 1;

const GAP_BY_SIZE = {
  s: "0.75rem",
  m: "1.25rem",
  l: "2rem",
} as const;

const SPACER_BY_SIZE = {
  s: "1rem",
  m: "2rem",
  l: "3rem",
} as const;

const ICON_SIZE = {
  sm: "1.25rem",
  md: "2rem",
  lg: "3rem",
  xl: "4.5rem",
} as const;

const NODE_SPACING = {
  none: "0",
  s: "0.75rem",
  m: "1.5rem",
  l: "3rem",
} as const;

const NODE_MAX_WIDTH = {
  narrow: "420px",
  reading: "680px",
  wide: "960px",
  full: "100%",
} as const;

const NODE_RADIUS = {
  none: "0",
  sm: "4px",
  md: "8px",
  lg: "16px",
  pill: "999px",
} as const;

const NODE_ASPECT_RATIO = {
  auto: undefined,
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
  "21:9": "21 / 9",
} as const;

const CONTAINER_QUERY_STYLE_RULES: ReadonlyArray<{
  attr: string;
  css: (prefix: string) => string;
}> = [
  { attr: "align", css: (p) => `text-align:var(--bn-${p}-align)!important` },
  { attr: "tone", css: (p) => `color:var(--bn-${p}-color)!important` },
  { attr: "width", css: (p) => `max-width:var(--bn-${p}-max-width)!important` },
  { attr: "margin-top", css: (p) => `margin-top:var(--bn-${p}-margin-top)!important` },
  { attr: "margin-bottom", css: (p) => `margin-bottom:var(--bn-${p}-margin-bottom)!important` },
  { attr: "padding-x", css: (p) => `padding-left:var(--bn-${p}-padding-x)!important;padding-right:var(--bn-${p}-padding-x)!important` },
  { attr: "padding-y", css: (p) => `padding-top:var(--bn-${p}-padding-y)!important;padding-bottom:var(--bn-${p}-padding-y)!important` },
  { attr: "background", css: (p) => `background:var(--bn-${p}-background)!important` },
  { attr: "radius", css: (p) => `border-radius:var(--bn-${p}-radius)!important` },
  { attr: "fit", css: (p) => `object-fit:var(--bn-${p}-fit)!important` },
  { attr: "object-position", css: (p) => `object-position:var(--bn-${p}-object-position)!important` },
  { attr: "ratio", css: (p) => `aspect-ratio:var(--bn-${p}-ratio)!important` },
  { attr: "aspect-free", css: (p) => `aspect-ratio:var(--bn-${p}-aspect-free)!important` },
  { attr: "hidden", css: () => "display:none!important" },
  { attr: "font-family", css: (p) => `font-family:var(--bn-${p}-font-family)!important` },
  { attr: "font-size", css: (p) => `font-size:var(--bn-${p}-font-size)!important` },
  { attr: "font-weight", css: (p) => `font-weight:var(--bn-${p}-font-weight)!important` },
  { attr: "line-height", css: (p) => `line-height:var(--bn-${p}-line-height)!important` },
  { attr: "letter-spacing", css: (p) => `letter-spacing:var(--bn-${p}-letter-spacing)!important` },
  { attr: "text-transform", css: (p) => `text-transform:var(--bn-${p}-text-transform)!important` },
  { attr: "font-style", css: (p) => `font-style:var(--bn-${p}-font-style)!important` },
  { attr: "text-decoration", css: (p) => `text-decoration:var(--bn-${p}-text-decoration)!important` },
  { attr: "text-color", css: (p) => `color:var(--bn-${p}-text-color)!important` },
  { attr: "bg-color", css: (p) => `background-color:var(--bn-${p}-bg-color)!important` },
  { attr: "border-color", css: (p) => `border-color:var(--bn-${p}-border-color)!important` },
  { attr: "border-width", css: (p) => `border-width:var(--bn-${p}-border-width)!important` },
  { attr: "border-style", css: (p) => `border-style:var(--bn-${p}-border-style)!important` },
  { attr: "free-width", css: (p) => `width:var(--bn-${p}-free-width)!important` },
  { attr: "height", css: (p) => `height:var(--bn-${p}-height)!important` },
  { attr: "min-height", css: (p) => `min-height:var(--bn-${p}-min-height)!important` },
  { attr: "min-width", css: (p) => `min-width:var(--bn-${p}-min-width)!important` },
  { attr: "max-width-free", css: (p) => `max-width:var(--bn-${p}-max-width-free)!important` },
  { attr: "max-height", css: (p) => `max-height:var(--bn-${p}-max-height)!important` },
  { attr: "padding-top", css: (p) => `padding-top:var(--bn-${p}-padding-top)!important` },
  { attr: "padding-right", css: (p) => `padding-right:var(--bn-${p}-padding-right)!important` },
  { attr: "padding-bottom", css: (p) => `padding-bottom:var(--bn-${p}-padding-bottom)!important` },
  { attr: "padding-left", css: (p) => `padding-left:var(--bn-${p}-padding-left)!important` },
  { attr: "margin-top-free", css: (p) => `margin-top:var(--bn-${p}-margin-top-free)!important` },
  { attr: "margin-right-free", css: (p) => `margin-right:var(--bn-${p}-margin-right-free)!important` },
  { attr: "margin-bottom-free", css: (p) => `margin-bottom:var(--bn-${p}-margin-bottom-free)!important` },
  { attr: "margin-left-free", css: (p) => `margin-left:var(--bn-${p}-margin-left-free)!important` },
  { attr: "shadow", css: (p) => `box-shadow:var(--bn-${p}-shadow)!important` },
  { attr: "text-shadow", css: (p) => `text-shadow:var(--bn-${p}-text-shadow)!important` },
  { attr: "bg-image", css: (p) => `background-image:var(--bn-${p}-bg-image)!important` },
  { attr: "opacity", css: (p) => `opacity:var(--bn-${p}-opacity)!important` },
  { attr: "radius-free", css: (p) => `border-radius:var(--bn-${p}-radius-free)!important` },
  { attr: "gap-free", css: (p) => `--bn-gap:var(--bn-${p}-gap-free)!important` },
  { attr: "container-type", css: (p) => `container-type:var(--bn-${p}-container-type)!important` },
  { attr: "container-name", css: (p) => `container-name:var(--bn-${p}-container-name)!important` },
  { attr: "position", css: (p) => `position:var(--bn-${p}-position)!important` },
  { attr: "inset-top", css: (p) => `top:var(--bn-${p}-inset-top)!important` },
  { attr: "inset-right", css: (p) => `right:var(--bn-${p}-inset-right)!important` },
  { attr: "inset-bottom", css: (p) => `bottom:var(--bn-${p}-inset-bottom)!important` },
  { attr: "inset-left", css: (p) => `left:var(--bn-${p}-inset-left)!important` },
  { attr: "z-index", css: (p) => `z-index:var(--bn-${p}-z-index)!important` },
  { attr: "overflow", css: (p) => `overflow:var(--bn-${p}-overflow)!important` },
  { attr: "rotate", css: (p) => `rotate:var(--bn-${p}-rotate)!important` },
  { attr: "scale", css: (p) => `scale:var(--bn-${p}-scale)!important` },
  { attr: "translate", css: (p) => `translate:var(--bn-${p}-translate)!important` },
  { attr: "transform-origin", css: (p) => `transform-origin:var(--bn-${p}-transform-origin)!important` },
  { attr: "transition", css: (p) => `transition-property:var(--bn-${p}-transition-property,var(--bn-transition-property,all))!important;transition-duration:var(--bn-${p}-transition-duration,var(--bn-transition-duration,.2s))!important;transition-timing-function:var(--bn-${p}-transition-timing-function,var(--bn-transition-timing-function,ease))!important;transition-delay:var(--bn-${p}-transition-delay,var(--bn-transition-delay,0s))!important` },
  { attr: "align-self", css: (p) => `align-self:var(--bn-${p}-align-self)!important` },
  { attr: "flex-grow", css: (p) => `flex-grow:var(--bn-${p}-flex-grow)!important` },
  { attr: "flex-shrink", css: (p) => `flex-shrink:var(--bn-${p}-flex-shrink)!important` },
  { attr: "flex-basis", css: (p) => `flex-basis:var(--bn-${p}-flex-basis)!important` },
  { attr: "grid-column", css: (p) => `grid-column:var(--bn-${p}-grid-column)!important` },
  { attr: "grid-row", css: (p) => `grid-row:var(--bn-${p}-grid-row)!important` },
  { attr: "filter", css: (p) => `filter:var(--bn-${p}-filter)!important` },
  { attr: "backdrop-filter", css: (p) => `backdrop-filter:var(--bn-${p}-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-${p}-backdrop-filter)!important` },
  { attr: "mix-blend-mode", css: (p) => `mix-blend-mode:var(--bn-${p}-mix-blend-mode)!important` },
  { attr: "justify-content", css: (p) => `justify-content:var(--bn-${p}-justify-content)!important` },
  { attr: "align-items", css: (p) => `align-items:var(--bn-${p}-align-items)!important` },
  { attr: "flex-wrap", css: (p) => `flex-wrap:var(--bn-${p}-flex-wrap)!important` },
  { attr: "grid-template-columns", css: (p) => `grid-template-columns:var(--bn-${p}-grid-template-columns)!important` },
  { attr: "grid-template-rows", css: (p) => `grid-template-rows:var(--bn-${p}-grid-template-rows)!important` },
  { attr: "grid-auto-flow", css: (p) => `grid-auto-flow:var(--bn-${p}-grid-auto-flow)!important` },
  { attr: "clip-path", css: (p) => `clip-path:var(--bn-${p}-clip-path)!important;-webkit-clip-path:var(--bn-${p}-clip-path)!important` },
  { attr: "mask-image", css: (p) => `mask-image:var(--bn-${p}-mask-image)!important;-webkit-mask-image:var(--bn-${p}-mask-image)!important` },
  { attr: "text-stroke", css: (p) => `-webkit-text-stroke:var(--bn-${p}-text-stroke)!important` },
  { attr: "cursor", css: (p) => `cursor:var(--bn-${p}-cursor)!important` },
  { attr: "user-select", css: (p) => `user-select:var(--bn-${p}-user-select)!important;-webkit-user-select:var(--bn-${p}-user-select)!important` },
  { attr: "pointer-events", css: (p) => `pointer-events:var(--bn-${p}-pointer-events)!important` },
  { attr: "scroll-snap-type", css: (p) => `scroll-snap-type:var(--bn-${p}-scroll-snap-type)!important` },
  { attr: "scroll-snap-align", css: (p) => `scroll-snap-align:var(--bn-${p}-scroll-snap-align)!important` },
  { attr: "outline", css: (p) => `outline:var(--bn-${p}-outline)!important` },
  { attr: "outline-offset", css: (p) => `outline-offset:var(--bn-${p}-outline-offset)!important` },
  { attr: "accent-color", css: (p) => `accent-color:var(--bn-${p}-accent-color)!important` },
  { attr: "caret-color", css: (p) => `caret-color:var(--bn-${p}-caret-color)!important` },
];

function builderNodeContainerQueryCss(breakpoint: "tablet" | "mobile", maxWidth: string) {
  const prefix = `cq-${breakpoint}`;
  const attr = `data-builder-style-${prefix}`;
  const rules = CONTAINER_QUERY_STYLE_RULES.map(
    (rule) => `  .site-builder-node[${attr}-${rule.attr}]{${rule.css(prefix)}}`,
  ).join("\n");
  return `@container (max-width:${maxWidth}){\n${[
    `  .site-builder-node[${attr}-size="sm"]{font-size:clamp(0.9rem,1vw,1rem)!important}`,
    `  .site-builder-node[${attr}-size="md"]{font-size:clamp(1rem,1.3vw,1.25rem)!important}`,
    `  .site-builder-node[${attr}-size="lg"]{font-size:clamp(1.35rem,2vw,2.25rem)!important}`,
    `  .site-builder-node[${attr}-size="xl"]{font-size:clamp(2rem,4vw,4.5rem)!important}`,
    `  .site-builder-node--paragraph[${attr}-size="lg"]{font-size:clamp(1.1rem,1.45vw,1.45rem)!important}`,
    `  .site-builder-node--paragraph[${attr}-size="xl"]{font-size:clamp(1.25rem,1.8vw,1.8rem)!important}`,
    rules,
  ].join("\n")}\n}`;
}

const BUILDER_NODE_CONTAINER_QUERY_CSS = `${builderNodeContainerQueryCss(
  "tablet",
  "900px",
)}
${builderNodeContainerQueryCss("mobile", "640px")}`;

const CONTAINER_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "1120px",
  margin: "0 auto",
};

const BUILDER_NODE_RENDERER_CSS = `
@keyframes bn-anim-fade-in{from{opacity:0}to{opacity:1}}
@keyframes bn-anim-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes bn-anim-fall{from{opacity:0;transform:translateY(-24px)}to{opacity:1;transform:translateY(0)}}
@keyframes bn-anim-zoom-in{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
@keyframes bn-anim-slide-left{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
@keyframes bn-anim-slide-right{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}
@keyframes bn-anim-blur-in{from{opacity:0;filter:blur(12px)}to{opacity:1;filter:blur(0)}}
@keyframes bn-anim-flip-in{from{opacity:0;transform:perspective(800px) rotateX(35deg)}to{opacity:1;transform:perspective(800px) rotateX(0)}}
@keyframes bn-anim-bounce-in{0%{opacity:0;transform:scale(0.8)}60%{opacity:1;transform:scale(1.04)}100%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.site-builder-node[style*="animation"]{animation:none!important}}
.site-builder-node{box-sizing:border-box}
.site-builder-node[data-builder-style-container-type]{container-type:var(--bn-container-type)}
.site-builder-node[data-builder-style-container-name]{container-name:var(--bn-container-name)}
.site-builder-node--container{width:100%;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:var(--bn-gap,1.25rem);align-items:var(--bn-align,stretch)}
.site-builder-node--container[data-builder-layout="row"]{flex-direction:row;flex-wrap:wrap}
.site-builder-node--container[data-builder-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-columns,2),minmax(0,1fr))}
.site-builder-node--split{width:100%;max-width:1120px;margin:0 auto;display:grid;grid-template-columns:var(--bn-split-left,1fr) var(--bn-split-right,1fr);gap:var(--bn-gap,1.25rem);align-items:center}
.site-builder-node--carousel{width:100%;max-width:1120px;min-width:0;margin:0 auto;display:grid;gap:0.75rem}
.site-builder-node--carousel-track{width:100%;min-width:0;display:flex;gap:var(--bn-gap,1.25rem);overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:thin}
.site-builder-node--carousel-slide{min-width:0;flex:0 0 var(--bn-slide-width,50%);scroll-snap-align:start}
.site-builder-node--carousel-controls{display:flex;justify-content:flex-end;gap:0.5rem}
.site-builder-node--carousel-arrow{display:inline-flex;height:2rem;width:2rem;align-items:center;justify-content:center;border:1px solid rgba(18,18,18,0.16);border-radius:999px;background:#fff;color:#111;font-weight:700;text-decoration:none}
.site-builder-node--carousel-dots{display:flex;justify-content:center;gap:0.4rem}
.site-builder-node--carousel-dot{height:0.45rem;width:0.45rem;border:0;border-radius:999px;background:rgba(18,18,18,0.28);padding:0;cursor:pointer}
.site-builder-node--divider{border:0;margin:1rem 0;height:1px;background:rgba(18,18,18,0.16);width:100%}
.site-builder-node--divider[data-builder-divider-tone="muted"]{background:rgba(18,18,18,0.09)}
.site-builder-node--masonry{width:100%;max-width:1120px;margin:0 auto;column-count:var(--bn-columns,3);column-gap:var(--bn-gap,1.25rem)}
.site-builder-node--masonry>*{break-inside:avoid;margin-bottom:var(--bn-gap,1.25rem)}
.site-builder-node--card{width:100%;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:var(--bn-gap,1.25rem);padding:1.25rem;box-sizing:border-box}
.site-builder-node--card[data-builder-card-variant="elevated"]{background:rgba(255,255,255,0.96);box-shadow:0 10px 28px rgba(18,18,18,0.08)}
.site-builder-node--card[data-builder-card-variant="outline"]{background:#fff;border:1px solid rgba(18,18,18,0.14)}
.site-builder-node--card[data-builder-card-variant="ghost"]{background:rgba(246,241,232,0.55)}
.site-builder-node--cta-group{width:100%;max-width:1120px;margin:0 auto;display:flex;flex-wrap:wrap;gap:var(--bn-gap,1rem);box-sizing:border-box}
.site-builder-node--cta-group[data-builder-cta-layout="stack"]{flex-direction:column;align-items:stretch}
.site-builder-node--live-talent-grid{display:grid;grid-template-columns:repeat(var(--bn-live-columns,4),minmax(0,1fr));gap:var(--bn-gap,1.25rem);width:100%}
.site-builder-node--live-chip-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:0.75rem;width:100%}
.site-builder-node--live-chip{display:inline-flex;align-items:center;gap:0.5rem;border:1px solid rgba(18,18,18,0.16);background:#fff;color:#111;padding:0.75rem 1rem;text-decoration:none}
.site-builder-node--live-chip strong{font-weight:700}
.site-builder-node--live-chip span{color:rgba(18,18,18,0.58);font-size:0.82rem}
.site-builder-node--live-search-shell{display:flex;width:min(100%,680px);align-items:center;justify-content:space-between;gap:1rem;border:1px solid rgba(18,18,18,0.16);background:#fff;padding:0.75rem 0.75rem 0.75rem 1rem}
.site-builder-node--live-search-shell span{color:rgba(18,18,18,0.58)}
.site-builder-node--button{display:inline-flex;width:fit-content;align-items:center;justify-content:center;border:1px solid rgba(18,18,18,0.18);border-radius:999px;padding:0.8rem 1.2rem;font-weight:700;text-decoration:none;transition:background-color .16s ease,color .16s ease,border-color .16s ease,transform .16s ease}
.site-builder-node--button[data-builder-button-tone="primary"]{background:var(--token-color-primary,#111);color:var(--token-color-surface-raised,#fff)}
.site-builder-node--button[data-builder-button-tone="secondary"]{background:transparent;color:var(--token-color-primary,#111)}
.site-builder-node--button[data-builder-button-hover-tone="primary"]:hover,.site-builder-node--button[data-builder-button-focus-tone="primary"]:focus-visible,.site-builder-node--button[data-builder-button-active-tone="primary"]:active{background:var(--token-color-primary,#111)!important;color:var(--token-color-surface-raised,#fff)!important;border-color:var(--token-color-primary,#111)!important}
.site-builder-node--button[data-builder-button-hover-tone="secondary"]:hover,.site-builder-node--button[data-builder-button-focus-tone="secondary"]:focus-visible,.site-builder-node--button[data-builder-button-active-tone="secondary"]:active{background:transparent!important;color:var(--token-color-primary,#111)!important;border-color:rgba(18,18,18,0.28)!important}
.site-builder-node--button[data-builder-button-disabled-tone="secondary"][aria-disabled="true"]{background:transparent;color:rgba(18,18,18,0.42);border-color:rgba(18,18,18,0.16);pointer-events:none}
.site-builder-node--button[data-builder-button-disabled-tone="primary"][aria-disabled="true"]{background:rgba(18,18,18,0.35);color:#fff;border-color:rgba(18,18,18,0.08);pointer-events:none}
.site-builder-node--heading{font-family:var(--site-heading-font,inherit);color:var(--token-color-ink,inherit)}
.site-builder-node--paragraph{font-family:var(--site-body-font,inherit)}
.site-builder-node--video{display:block;width:100%;max-width:100%;background:#000}
.site-builder-node--embed{display:block;width:100%;max-width:100%;border:0;background:#000}
.site-builder-node--icon{display:inline-flex;align-items:center;justify-content:center;color:currentColor;line-height:1}
.site-builder-node--pricing-table{width:100%;max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(var(--bn-pricing-columns,3),minmax(0,1fr));gap:var(--bn-gap,1.25rem);align-items:stretch}
.site-builder-node--pricing-tier{display:flex;min-width:0;flex-direction:column;gap:1rem;border:1px solid rgba(18,18,18,0.14);background:#fff;padding:1.25rem}
.site-builder-node--pricing-tier[data-builder-pricing-highlighted="true"]{border-color:var(--token-color-primary,#111);box-shadow:0 14px 36px rgba(18,18,18,0.12)}
.site-builder-node--pricing-tier-header{display:grid;gap:0.4rem}
.site-builder-node--pricing-tier-title{margin:0;font-size:1rem;font-weight:800;line-height:1.15;color:var(--token-color-ink,#111)}
.site-builder-node--pricing-tier-description{margin:0;color:rgba(18,18,18,0.66);font-size:0.92rem;line-height:1.5}
.site-builder-node--pricing-price{display:flex;align-items:baseline;gap:0.35rem;color:var(--token-color-ink,#111)}
.site-builder-node--pricing-price strong{font-size:clamp(2rem,4vw,3.2rem);line-height:0.95}
.site-builder-node--pricing-period{color:rgba(18,18,18,0.58);font-size:0.9rem}
.site-builder-node--pricing-features{display:grid;gap:0.6rem;margin:0;padding:0;list-style:none}
.site-builder-node--pricing-feature{display:grid;grid-template-columns:1.2rem minmax(0,1fr);gap:0.55rem;align-items:start;color:rgba(18,18,18,0.78);font-size:0.92rem;line-height:1.45}
.site-builder-node--pricing-feature[data-builder-feature-included="false"]{color:rgba(18,18,18,0.42)}
.site-builder-node--pricing-feature-mark{font-weight:800;color:var(--token-color-primary,#111)}
.site-builder-node--pricing-feature[data-builder-feature-included="false"] .site-builder-node--pricing-feature-mark{color:rgba(18,18,18,0.34)}
.site-builder-node--pricing-cta{margin-top:auto;display:inline-flex;width:100%;align-items:center;justify-content:center;border:1px solid var(--token-color-primary,#111);border-radius:999px;background:var(--token-color-primary,#111);color:var(--token-color-surface-raised,#fff);padding:0.8rem 1rem;font-weight:800;text-align:center;text-decoration:none}
.site-builder-node--rich-text{width:100%;max-width:100%;font-family:var(--site-body-font,inherit)}
.site-builder-node--rich-text .site-link{color:inherit;text-decoration:underline;text-underline-offset:0.16em}
.site-builder-node[data-builder-style-size="sm"]{font-size:clamp(0.9rem,1vw,1rem)}
.site-builder-node[data-builder-style-size="md"]{font-size:clamp(1rem,1.3vw,1.25rem)}
.site-builder-node[data-builder-style-size="lg"]{font-size:clamp(1.35rem,2vw,2.25rem)}
.site-builder-node[data-builder-style-size="xl"]{font-size:clamp(2rem,4vw,4.5rem)}
.site-builder-node--paragraph[data-builder-style-size="lg"]{font-size:clamp(1.1rem,1.45vw,1.45rem)}
.site-builder-node--paragraph[data-builder-style-size="xl"]{font-size:clamp(1.25rem,1.8vw,1.8rem)}
.site-builder-node[data-builder-style-transition]{transition-property:var(--bn-transition-property,all);transition-duration:var(--bn-transition-duration,.2s);transition-timing-function:var(--bn-transition-timing-function,ease);transition-delay:var(--bn-transition-delay,0s)}
.site-builder-node[data-builder-style-hover-bg]:hover,.site-builder-node[data-builder-style-hover-bg]:focus-visible{background-color:var(--bn-hover-bg)!important}
.site-builder-node[data-builder-style-hover-color]:hover,.site-builder-node[data-builder-style-hover-color]:focus-visible{color:var(--bn-hover-color)!important}
.site-builder-node[data-builder-style-hover-border-color]:hover,.site-builder-node[data-builder-style-hover-border-color]:focus-visible{border-color:var(--bn-hover-border-color)!important}
.site-builder-node[data-builder-style-hover-shadow]:hover,.site-builder-node[data-builder-style-hover-shadow]:focus-visible{box-shadow:var(--bn-hover-shadow)!important}
.site-builder-node[data-builder-style-hover-scale]:hover,.site-builder-node[data-builder-style-hover-scale]:focus-visible{scale:var(--bn-hover-scale)!important}
.site-builder-node[data-builder-style-hover-translate]:hover,.site-builder-node[data-builder-style-hover-translate]:focus-visible{translate:var(--bn-hover-translate)!important}
.site-builder-node[data-builder-style-hover-opacity]:hover,.site-builder-node[data-builder-style-hover-opacity]:focus-visible{opacity:var(--bn-hover-opacity)!important}
@media (max-width:900px){
  .site-builder-node[data-builder-style-tablet-align]{text-align:var(--bn-tablet-align)!important}
  .site-builder-node[data-builder-style-tablet-size="sm"]{font-size:clamp(0.9rem,1vw,1rem)!important}
  .site-builder-node[data-builder-style-tablet-size="md"]{font-size:clamp(1rem,1.3vw,1.25rem)!important}
  .site-builder-node[data-builder-style-tablet-size="lg"]{font-size:clamp(1.35rem,2vw,2.25rem)!important}
  .site-builder-node[data-builder-style-tablet-size="xl"]{font-size:clamp(2rem,4vw,4.5rem)!important}
  .site-builder-node--paragraph[data-builder-style-tablet-size="lg"]{font-size:clamp(1.1rem,1.45vw,1.45rem)!important}
  .site-builder-node--paragraph[data-builder-style-tablet-size="xl"]{font-size:clamp(1.25rem,1.8vw,1.8rem)!important}
  .site-builder-node[data-builder-style-tablet-tone]{color:var(--bn-tablet-color)!important}
  .site-builder-node[data-builder-style-tablet-width]{max-width:var(--bn-tablet-max-width)!important}
  .site-builder-node[data-builder-style-tablet-margin-top]{margin-top:var(--bn-tablet-margin-top)!important}
  .site-builder-node[data-builder-style-tablet-margin-bottom]{margin-bottom:var(--bn-tablet-margin-bottom)!important}
  .site-builder-node[data-builder-style-tablet-padding-x]{padding-left:var(--bn-tablet-padding-x)!important;padding-right:var(--bn-tablet-padding-x)!important}
  .site-builder-node[data-builder-style-tablet-padding-y]{padding-top:var(--bn-tablet-padding-y)!important;padding-bottom:var(--bn-tablet-padding-y)!important}
  .site-builder-node[data-builder-style-tablet-background]{background:var(--bn-tablet-background)!important}
  .site-builder-node[data-builder-style-tablet-radius]{border-radius:var(--bn-tablet-radius)!important}
  .site-builder-node[data-builder-style-tablet-fit]{object-fit:var(--bn-tablet-fit)!important}
  .site-builder-node[data-builder-style-tablet-object-position]{object-position:var(--bn-tablet-object-position)!important}
  .site-builder-node[data-builder-style-tablet-ratio]{aspect-ratio:var(--bn-tablet-ratio)!important}
  .site-builder-node[data-builder-style-tablet-aspect-free]{aspect-ratio:var(--bn-tablet-aspect-free)!important}
  .site-builder-node[data-builder-style-tablet-hidden]{display:none!important}
  .site-builder-node[data-builder-style-tablet-font-family]{font-family:var(--bn-tablet-font-family)!important}
  .site-builder-node[data-builder-style-tablet-font-size]{font-size:var(--bn-tablet-font-size)!important}
  .site-builder-node[data-builder-style-tablet-font-weight]{font-weight:var(--bn-tablet-font-weight)!important}
  .site-builder-node[data-builder-style-tablet-line-height]{line-height:var(--bn-tablet-line-height)!important}
  .site-builder-node[data-builder-style-tablet-letter-spacing]{letter-spacing:var(--bn-tablet-letter-spacing)!important}
  .site-builder-node[data-builder-style-tablet-text-transform]{text-transform:var(--bn-tablet-text-transform)!important}
  .site-builder-node[data-builder-style-tablet-font-style]{font-style:var(--bn-tablet-font-style)!important}
  .site-builder-node[data-builder-style-tablet-text-decoration]{text-decoration:var(--bn-tablet-text-decoration)!important}
  .site-builder-node[data-builder-style-tablet-text-color]{color:var(--bn-tablet-text-color)!important}
  .site-builder-node[data-builder-style-tablet-bg-color]{background-color:var(--bn-tablet-bg-color)!important}
  .site-builder-node[data-builder-style-tablet-border-color]{border-color:var(--bn-tablet-border-color)!important}
  .site-builder-node[data-builder-style-tablet-border-width]{border-width:var(--bn-tablet-border-width)!important}
  .site-builder-node[data-builder-style-tablet-border-style]{border-style:var(--bn-tablet-border-style)!important}
  .site-builder-node[data-builder-style-tablet-free-width]{width:var(--bn-tablet-free-width)!important}
  .site-builder-node[data-builder-style-tablet-height]{height:var(--bn-tablet-height)!important}
  .site-builder-node[data-builder-style-tablet-min-height]{min-height:var(--bn-tablet-min-height)!important}
  .site-builder-node[data-builder-style-tablet-min-width]{min-width:var(--bn-tablet-min-width)!important}
  .site-builder-node[data-builder-style-tablet-max-width-free]{max-width:var(--bn-tablet-max-width-free)!important}
  .site-builder-node[data-builder-style-tablet-max-height]{max-height:var(--bn-tablet-max-height)!important}
  .site-builder-node[data-builder-style-tablet-padding-top]{padding-top:var(--bn-tablet-padding-top)!important}
  .site-builder-node[data-builder-style-tablet-padding-right]{padding-right:var(--bn-tablet-padding-right)!important}
  .site-builder-node[data-builder-style-tablet-padding-bottom]{padding-bottom:var(--bn-tablet-padding-bottom)!important}
  .site-builder-node[data-builder-style-tablet-padding-left]{padding-left:var(--bn-tablet-padding-left)!important}
  .site-builder-node[data-builder-style-tablet-margin-top-free]{margin-top:var(--bn-tablet-margin-top-free)!important}
  .site-builder-node[data-builder-style-tablet-margin-right-free]{margin-right:var(--bn-tablet-margin-right-free)!important}
  .site-builder-node[data-builder-style-tablet-margin-bottom-free]{margin-bottom:var(--bn-tablet-margin-bottom-free)!important}
  .site-builder-node[data-builder-style-tablet-margin-left-free]{margin-left:var(--bn-tablet-margin-left-free)!important}
  .site-builder-node[data-builder-style-tablet-shadow]{box-shadow:var(--bn-tablet-shadow)!important}
  .site-builder-node[data-builder-style-tablet-text-shadow]{text-shadow:var(--bn-tablet-text-shadow)!important}
  .site-builder-node[data-builder-style-tablet-bg-image]{background-image:var(--bn-tablet-bg-image)!important}
  .site-builder-node[data-builder-style-tablet-opacity]{opacity:var(--bn-tablet-opacity)!important}
  .site-builder-node[data-builder-style-tablet-radius-free]{border-radius:var(--bn-tablet-radius-free)!important}
  .site-builder-node[data-builder-style-tablet-gap-free]{--bn-gap:var(--bn-tablet-gap-free)!important}
  .site-builder-node[data-builder-style-tablet-position]{position:var(--bn-tablet-position)!important}
  .site-builder-node[data-builder-style-tablet-inset-top]{top:var(--bn-tablet-inset-top)!important}
  .site-builder-node[data-builder-style-tablet-inset-right]{right:var(--bn-tablet-inset-right)!important}
  .site-builder-node[data-builder-style-tablet-inset-bottom]{bottom:var(--bn-tablet-inset-bottom)!important}
  .site-builder-node[data-builder-style-tablet-inset-left]{left:var(--bn-tablet-inset-left)!important}
  .site-builder-node[data-builder-style-tablet-z-index]{z-index:var(--bn-tablet-z-index)!important}
  .site-builder-node[data-builder-style-tablet-overflow]{overflow:var(--bn-tablet-overflow)!important}
  .site-builder-node[data-builder-style-tablet-rotate]{rotate:var(--bn-tablet-rotate)!important}
  .site-builder-node[data-builder-style-tablet-scale]{scale:var(--bn-tablet-scale)!important}
  .site-builder-node[data-builder-style-tablet-translate]{translate:var(--bn-tablet-translate)!important}
  .site-builder-node[data-builder-style-tablet-transform-origin]{transform-origin:var(--bn-tablet-transform-origin)!important}
  .site-builder-node[data-builder-style-tablet-align-self]{align-self:var(--bn-tablet-align-self)!important}
  .site-builder-node[data-builder-style-tablet-flex-grow]{flex-grow:var(--bn-tablet-flex-grow)!important}
  .site-builder-node[data-builder-style-tablet-flex-shrink]{flex-shrink:var(--bn-tablet-flex-shrink)!important}
  .site-builder-node[data-builder-style-tablet-flex-basis]{flex-basis:var(--bn-tablet-flex-basis)!important}
  .site-builder-node[data-builder-style-tablet-grid-column]{grid-column:var(--bn-tablet-grid-column)!important}
  .site-builder-node[data-builder-style-tablet-grid-row]{grid-row:var(--bn-tablet-grid-row)!important}
  .site-builder-node[data-builder-style-tablet-filter]{filter:var(--bn-tablet-filter)!important}
  .site-builder-node[data-builder-style-tablet-backdrop-filter]{backdrop-filter:var(--bn-tablet-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-tablet-backdrop-filter)!important}
  .site-builder-node[data-builder-style-tablet-mix-blend-mode]{mix-blend-mode:var(--bn-tablet-mix-blend-mode)!important}
  .site-builder-node[data-builder-style-tablet-justify-content]{justify-content:var(--bn-tablet-justify-content)!important}
  .site-builder-node[data-builder-style-tablet-align-items]{align-items:var(--bn-tablet-align-items)!important}
  .site-builder-node[data-builder-style-tablet-flex-wrap]{flex-wrap:var(--bn-tablet-flex-wrap)!important}
  .site-builder-node[data-builder-style-tablet-grid-template-columns]{grid-template-columns:var(--bn-tablet-grid-template-columns)!important}
  .site-builder-node[data-builder-style-tablet-grid-template-rows]{grid-template-rows:var(--bn-tablet-grid-template-rows)!important}
  .site-builder-node[data-builder-style-tablet-grid-auto-flow]{grid-auto-flow:var(--bn-tablet-grid-auto-flow)!important}
  .site-builder-node[data-builder-style-tablet-clip-path]{clip-path:var(--bn-tablet-clip-path)!important;-webkit-clip-path:var(--bn-tablet-clip-path)!important}
  .site-builder-node[data-builder-style-tablet-mask-image]{mask-image:var(--bn-tablet-mask-image)!important;-webkit-mask-image:var(--bn-tablet-mask-image)!important}
  .site-builder-node[data-builder-style-tablet-text-stroke]{-webkit-text-stroke:var(--bn-tablet-text-stroke)!important}
  .site-builder-node[data-builder-style-tablet-cursor]{cursor:var(--bn-tablet-cursor)!important}
  .site-builder-node[data-builder-style-tablet-user-select]{user-select:var(--bn-tablet-user-select)!important;-webkit-user-select:var(--bn-tablet-user-select)!important}
  .site-builder-node[data-builder-style-tablet-pointer-events]{pointer-events:var(--bn-tablet-pointer-events)!important}
  .site-builder-node[data-builder-style-tablet-scroll-snap-type]{scroll-snap-type:var(--bn-tablet-scroll-snap-type)!important}
  .site-builder-node[data-builder-style-tablet-scroll-snap-align]{scroll-snap-align:var(--bn-tablet-scroll-snap-align)!important}
  .site-builder-node[data-builder-style-tablet-outline]{outline:var(--bn-tablet-outline)!important}
  .site-builder-node[data-builder-style-tablet-outline-offset]{outline-offset:var(--bn-tablet-outline-offset)!important}
  .site-builder-node[data-builder-style-tablet-accent-color]{accent-color:var(--bn-tablet-accent-color)!important}
  .site-builder-node[data-builder-style-tablet-caret-color]{caret-color:var(--bn-tablet-caret-color)!important}
  .site-builder-node[data-builder-style-tablet-transition]{transition-property:var(--bn-tablet-transition-property,var(--bn-transition-property,all))!important;transition-duration:var(--bn-tablet-transition-duration,var(--bn-transition-duration,.2s))!important;transition-timing-function:var(--bn-tablet-transition-timing-function,var(--bn-transition-timing-function,ease))!important;transition-delay:var(--bn-tablet-transition-delay,var(--bn-transition-delay,0s))!important}
  .site-builder-node--container[data-builder-tablet-layout="stack"]{display:flex;flex-direction:column}
  .site-builder-node--container[data-builder-tablet-layout="row"]{display:flex;flex-direction:row;flex-wrap:wrap}
  .site-builder-node--container[data-builder-tablet-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-tablet-columns,var(--bn-columns,2)),minmax(0,1fr))}
  .site-builder-node--live-talent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .site-builder-node--carousel-slide{flex-basis:calc(100% / var(--bn-tablet-slides,2))}
  .site-builder-node--masonry{column-count:var(--bn-tablet-columns,2)}
}
@media (max-width:640px){
  .site-builder-node[data-builder-style-mobile-align]{text-align:var(--bn-mobile-align)!important}
  .site-builder-node[data-builder-style-mobile-size="sm"]{font-size:clamp(0.9rem,1vw,1rem)!important}
  .site-builder-node[data-builder-style-mobile-size="md"]{font-size:clamp(1rem,1.3vw,1.25rem)!important}
  .site-builder-node[data-builder-style-mobile-size="lg"]{font-size:clamp(1.35rem,2vw,2.25rem)!important}
  .site-builder-node[data-builder-style-mobile-size="xl"]{font-size:clamp(2rem,4vw,4.5rem)!important}
  .site-builder-node--paragraph[data-builder-style-mobile-size="lg"]{font-size:clamp(1.1rem,1.45vw,1.45rem)!important}
  .site-builder-node--paragraph[data-builder-style-mobile-size="xl"]{font-size:clamp(1.25rem,1.8vw,1.8rem)!important}
  .site-builder-node[data-builder-style-mobile-tone]{color:var(--bn-mobile-color)!important}
  .site-builder-node[data-builder-style-mobile-width]{max-width:var(--bn-mobile-max-width)!important}
  .site-builder-node[data-builder-style-mobile-margin-top]{margin-top:var(--bn-mobile-margin-top)!important}
  .site-builder-node[data-builder-style-mobile-margin-bottom]{margin-bottom:var(--bn-mobile-margin-bottom)!important}
  .site-builder-node[data-builder-style-mobile-padding-x]{padding-left:var(--bn-mobile-padding-x)!important;padding-right:var(--bn-mobile-padding-x)!important}
  .site-builder-node[data-builder-style-mobile-padding-y]{padding-top:var(--bn-mobile-padding-y)!important;padding-bottom:var(--bn-mobile-padding-y)!important}
  .site-builder-node[data-builder-style-mobile-background]{background:var(--bn-mobile-background)!important}
  .site-builder-node[data-builder-style-mobile-radius]{border-radius:var(--bn-mobile-radius)!important}
  .site-builder-node[data-builder-style-mobile-fit]{object-fit:var(--bn-mobile-fit)!important}
  .site-builder-node[data-builder-style-mobile-object-position]{object-position:var(--bn-mobile-object-position)!important}
  .site-builder-node[data-builder-style-mobile-ratio]{aspect-ratio:var(--bn-mobile-ratio)!important}
  .site-builder-node[data-builder-style-mobile-aspect-free]{aspect-ratio:var(--bn-mobile-aspect-free)!important}
  .site-builder-node[data-builder-style-mobile-hidden]{display:none!important}
  .site-builder-node[data-builder-style-mobile-font-family]{font-family:var(--bn-mobile-font-family)!important}
  .site-builder-node[data-builder-style-mobile-font-size]{font-size:var(--bn-mobile-font-size)!important}
  .site-builder-node[data-builder-style-mobile-font-weight]{font-weight:var(--bn-mobile-font-weight)!important}
  .site-builder-node[data-builder-style-mobile-line-height]{line-height:var(--bn-mobile-line-height)!important}
  .site-builder-node[data-builder-style-mobile-letter-spacing]{letter-spacing:var(--bn-mobile-letter-spacing)!important}
  .site-builder-node[data-builder-style-mobile-text-transform]{text-transform:var(--bn-mobile-text-transform)!important}
  .site-builder-node[data-builder-style-mobile-font-style]{font-style:var(--bn-mobile-font-style)!important}
  .site-builder-node[data-builder-style-mobile-text-decoration]{text-decoration:var(--bn-mobile-text-decoration)!important}
  .site-builder-node[data-builder-style-mobile-text-color]{color:var(--bn-mobile-text-color)!important}
  .site-builder-node[data-builder-style-mobile-bg-color]{background-color:var(--bn-mobile-bg-color)!important}
  .site-builder-node[data-builder-style-mobile-border-color]{border-color:var(--bn-mobile-border-color)!important}
  .site-builder-node[data-builder-style-mobile-border-width]{border-width:var(--bn-mobile-border-width)!important}
  .site-builder-node[data-builder-style-mobile-border-style]{border-style:var(--bn-mobile-border-style)!important}
  .site-builder-node[data-builder-style-mobile-free-width]{width:var(--bn-mobile-free-width)!important}
  .site-builder-node[data-builder-style-mobile-height]{height:var(--bn-mobile-height)!important}
  .site-builder-node[data-builder-style-mobile-min-height]{min-height:var(--bn-mobile-min-height)!important}
  .site-builder-node[data-builder-style-mobile-min-width]{min-width:var(--bn-mobile-min-width)!important}
  .site-builder-node[data-builder-style-mobile-max-width-free]{max-width:var(--bn-mobile-max-width-free)!important}
  .site-builder-node[data-builder-style-mobile-max-height]{max-height:var(--bn-mobile-max-height)!important}
  .site-builder-node[data-builder-style-mobile-padding-top]{padding-top:var(--bn-mobile-padding-top)!important}
  .site-builder-node[data-builder-style-mobile-padding-right]{padding-right:var(--bn-mobile-padding-right)!important}
  .site-builder-node[data-builder-style-mobile-padding-bottom]{padding-bottom:var(--bn-mobile-padding-bottom)!important}
  .site-builder-node[data-builder-style-mobile-padding-left]{padding-left:var(--bn-mobile-padding-left)!important}
  .site-builder-node[data-builder-style-mobile-margin-top-free]{margin-top:var(--bn-mobile-margin-top-free)!important}
  .site-builder-node[data-builder-style-mobile-margin-right-free]{margin-right:var(--bn-mobile-margin-right-free)!important}
  .site-builder-node[data-builder-style-mobile-margin-bottom-free]{margin-bottom:var(--bn-mobile-margin-bottom-free)!important}
  .site-builder-node[data-builder-style-mobile-margin-left-free]{margin-left:var(--bn-mobile-margin-left-free)!important}
  .site-builder-node[data-builder-style-mobile-shadow]{box-shadow:var(--bn-mobile-shadow)!important}
  .site-builder-node[data-builder-style-mobile-text-shadow]{text-shadow:var(--bn-mobile-text-shadow)!important}
  .site-builder-node[data-builder-style-mobile-bg-image]{background-image:var(--bn-mobile-bg-image)!important}
  .site-builder-node[data-builder-style-mobile-opacity]{opacity:var(--bn-mobile-opacity)!important}
  .site-builder-node[data-builder-style-mobile-radius-free]{border-radius:var(--bn-mobile-radius-free)!important}
  .site-builder-node[data-builder-style-mobile-gap-free]{--bn-gap:var(--bn-mobile-gap-free)!important}
  .site-builder-node[data-builder-style-mobile-position]{position:var(--bn-mobile-position)!important}
  .site-builder-node[data-builder-style-mobile-inset-top]{top:var(--bn-mobile-inset-top)!important}
  .site-builder-node[data-builder-style-mobile-inset-right]{right:var(--bn-mobile-inset-right)!important}
  .site-builder-node[data-builder-style-mobile-inset-bottom]{bottom:var(--bn-mobile-inset-bottom)!important}
  .site-builder-node[data-builder-style-mobile-inset-left]{left:var(--bn-mobile-inset-left)!important}
  .site-builder-node[data-builder-style-mobile-z-index]{z-index:var(--bn-mobile-z-index)!important}
  .site-builder-node[data-builder-style-mobile-overflow]{overflow:var(--bn-mobile-overflow)!important}
  .site-builder-node[data-builder-style-mobile-rotate]{rotate:var(--bn-mobile-rotate)!important}
  .site-builder-node[data-builder-style-mobile-scale]{scale:var(--bn-mobile-scale)!important}
  .site-builder-node[data-builder-style-mobile-translate]{translate:var(--bn-mobile-translate)!important}
  .site-builder-node[data-builder-style-mobile-transform-origin]{transform-origin:var(--bn-mobile-transform-origin)!important}
  .site-builder-node[data-builder-style-mobile-align-self]{align-self:var(--bn-mobile-align-self)!important}
  .site-builder-node[data-builder-style-mobile-flex-grow]{flex-grow:var(--bn-mobile-flex-grow)!important}
  .site-builder-node[data-builder-style-mobile-flex-shrink]{flex-shrink:var(--bn-mobile-flex-shrink)!important}
  .site-builder-node[data-builder-style-mobile-flex-basis]{flex-basis:var(--bn-mobile-flex-basis)!important}
  .site-builder-node[data-builder-style-mobile-grid-column]{grid-column:var(--bn-mobile-grid-column)!important}
  .site-builder-node[data-builder-style-mobile-grid-row]{grid-row:var(--bn-mobile-grid-row)!important}
  .site-builder-node[data-builder-style-mobile-filter]{filter:var(--bn-mobile-filter)!important}
  .site-builder-node[data-builder-style-mobile-backdrop-filter]{backdrop-filter:var(--bn-mobile-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-mobile-backdrop-filter)!important}
  .site-builder-node[data-builder-style-mobile-mix-blend-mode]{mix-blend-mode:var(--bn-mobile-mix-blend-mode)!important}
  .site-builder-node[data-builder-style-mobile-justify-content]{justify-content:var(--bn-mobile-justify-content)!important}
  .site-builder-node[data-builder-style-mobile-align-items]{align-items:var(--bn-mobile-align-items)!important}
  .site-builder-node[data-builder-style-mobile-flex-wrap]{flex-wrap:var(--bn-mobile-flex-wrap)!important}
  .site-builder-node[data-builder-style-mobile-grid-template-columns]{grid-template-columns:var(--bn-mobile-grid-template-columns)!important}
  .site-builder-node[data-builder-style-mobile-grid-template-rows]{grid-template-rows:var(--bn-mobile-grid-template-rows)!important}
  .site-builder-node[data-builder-style-mobile-grid-auto-flow]{grid-auto-flow:var(--bn-mobile-grid-auto-flow)!important}
  .site-builder-node[data-builder-style-mobile-clip-path]{clip-path:var(--bn-mobile-clip-path)!important;-webkit-clip-path:var(--bn-mobile-clip-path)!important}
  .site-builder-node[data-builder-style-mobile-mask-image]{mask-image:var(--bn-mobile-mask-image)!important;-webkit-mask-image:var(--bn-mobile-mask-image)!important}
  .site-builder-node[data-builder-style-mobile-text-stroke]{-webkit-text-stroke:var(--bn-mobile-text-stroke)!important}
  .site-builder-node[data-builder-style-mobile-cursor]{cursor:var(--bn-mobile-cursor)!important}
  .site-builder-node[data-builder-style-mobile-user-select]{user-select:var(--bn-mobile-user-select)!important;-webkit-user-select:var(--bn-mobile-user-select)!important}
  .site-builder-node[data-builder-style-mobile-pointer-events]{pointer-events:var(--bn-mobile-pointer-events)!important}
  .site-builder-node[data-builder-style-mobile-scroll-snap-type]{scroll-snap-type:var(--bn-mobile-scroll-snap-type)!important}
  .site-builder-node[data-builder-style-mobile-scroll-snap-align]{scroll-snap-align:var(--bn-mobile-scroll-snap-align)!important}
  .site-builder-node[data-builder-style-mobile-outline]{outline:var(--bn-mobile-outline)!important}
  .site-builder-node[data-builder-style-mobile-outline-offset]{outline-offset:var(--bn-mobile-outline-offset)!important}
  .site-builder-node[data-builder-style-mobile-accent-color]{accent-color:var(--bn-mobile-accent-color)!important}
  .site-builder-node[data-builder-style-mobile-caret-color]{caret-color:var(--bn-mobile-caret-color)!important}
  .site-builder-node[data-builder-style-mobile-transition]{transition-property:var(--bn-mobile-transition-property,var(--bn-transition-property,all))!important;transition-duration:var(--bn-mobile-transition-duration,var(--bn-transition-duration,.2s))!important;transition-timing-function:var(--bn-mobile-transition-timing-function,var(--bn-transition-timing-function,ease))!important;transition-delay:var(--bn-mobile-transition-delay,var(--bn-transition-delay,0s))!important}
  .site-builder-node--container{align-items:stretch}
  .site-builder-node--container[data-builder-mobile-layout="stack"],.site-builder-node--container:not([data-builder-mobile-layout]){display:flex;flex-direction:column}
  .site-builder-node--container[data-builder-mobile-layout="row"]{display:flex;flex-direction:row;flex-wrap:wrap}
  .site-builder-node--container[data-builder-mobile-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-mobile-columns,1),minmax(0,1fr))}
  .site-builder-node--live-talent-grid{grid-template-columns:1fr}
  .site-builder-node--live-search-shell{align-items:stretch;flex-direction:column}
  .site-builder-node--split[data-builder-collapse-mobile="true"]{grid-template-columns:1fr}
  .site-builder-node--carousel-slide{flex-basis:86%}
  .site-builder-node--masonry{column-count:var(--bn-mobile-columns,1)}
  .site-builder-node--pricing-table{grid-template-columns:1fr}
}
${BUILDER_NODE_CONTAINER_QUERY_CSS}
`;

function builderNodeStyleVars(
  vars: Record<string, string | number | undefined>,
): CSSProperties {
  const style: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) style[key] = value;
  }
  return style as CSSProperties;
}

function hasTransitionLonghands(style: BuilderNodeStyleValue | undefined): boolean {
  return Boolean(
    style?.transitionProperty ||
      style?.transitionDuration ||
      style?.transitionTimingFunction ||
      style?.transitionDelay,
  );
}

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Allowlist guard for inline markdown-link hrefs. Permits https:// and
 * relative / in-page targets only; rejects javascript:, data:, vbscript: and
 * any other scheme. Exported so the section-level renderInlineRich guards every
 * user-authored link at one chokepoint, not just the rich_text builder node.
 */
export function isSafeBuilderRichTextHref(value: string): boolean {
  const href = value.trim();
  if (!href || href.startsWith("//")) return false;
  if (/^https:\/\//i.test(href)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  return (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("?") ||
    href.startsWith("./") ||
    href.startsWith("../")
  );
}

export function sanitizeBuilderRichText(input: string): string {
  return input.replace(MARKDOWN_LINK_RE, (match, label: string, href: string) =>
    isSafeBuilderRichTextHref(href) ? match : label,
  );
}

const CONTAINER_QUERY_STYLE_ATTR_KEYS: ReadonlyArray<[
  keyof BuilderNodeStyleValue,
  string,
]> = [
  ["align", "align"],
  ["tone", "tone"],
  ["maxWidth", "width"],
  ["marginTop", "margin-top"],
  ["marginBottom", "margin-bottom"],
  ["paddingX", "padding-x"],
  ["paddingY", "padding-y"],
  ["background", "background"],
  ["radius", "radius"],
  ["objectFit", "fit"],
  ["objectPosition", "object-position"],
  ["aspectRatio", "ratio"],
  ["aspectRatioFree", "aspect-free"],
  ["fontFamily", "font-family"],
  ["fontSize", "font-size"],
  ["fontWeight", "font-weight"],
  ["lineHeight", "line-height"],
  ["letterSpacing", "letter-spacing"],
  ["textTransform", "text-transform"],
  ["fontStyle", "font-style"],
  ["textDecoration", "text-decoration"],
  ["textColor", "text-color"],
  ["backgroundColor", "bg-color"],
  ["borderColor", "border-color"],
  ["width", "free-width"],
  ["height", "height"],
  ["minHeight", "min-height"],
  ["minWidth", "min-width"],
  ["maxWidthFree", "max-width-free"],
  ["maxHeight", "max-height"],
  ["paddingTop", "padding-top"],
  ["paddingRight", "padding-right"],
  ["paddingBottom", "padding-bottom"],
  ["paddingLeft", "padding-left"],
  ["marginTopFree", "margin-top-free"],
  ["marginRightFree", "margin-right-free"],
  ["marginBottomFree", "margin-bottom-free"],
  ["marginLeftFree", "margin-left-free"],
  ["boxShadow", "shadow"],
  ["textShadow", "text-shadow"],
  ["backgroundImage", "bg-image"],
  ["opacity", "opacity"],
  ["borderRadius", "radius-free"],
  ["gap", "gap-free"],
  ["containerType", "container-type"],
  ["containerName", "container-name"],
  ["position", "position"],
  ["top", "inset-top"],
  ["right", "inset-right"],
  ["bottom", "inset-bottom"],
  ["left", "inset-left"],
  ["zIndex", "z-index"],
  ["overflow", "overflow"],
  ["rotate", "rotate"],
  ["scale", "scale"],
  ["translate", "translate"],
  ["transformOrigin", "transform-origin"],
  ["alignSelf", "align-self"],
  ["flexGrow", "flex-grow"],
  ["flexShrink", "flex-shrink"],
  ["flexBasis", "flex-basis"],
  ["gridColumn", "grid-column"],
  ["gridRow", "grid-row"],
  ["filter", "filter"],
  ["backdropFilter", "backdrop-filter"],
  ["mixBlendMode", "mix-blend-mode"],
  ["justifyContent", "justify-content"],
  ["alignItems", "align-items"],
  ["flexWrap", "flex-wrap"],
  ["gridTemplateColumns", "grid-template-columns"],
  ["gridTemplateRows", "grid-template-rows"],
  ["gridAutoFlow", "grid-auto-flow"],
  ["clipPath", "clip-path"],
  ["maskImage", "mask-image"],
  ["textStroke", "text-stroke"],
  ["cursor", "cursor"],
  ["userSelect", "user-select"],
  ["pointerEvents", "pointer-events"],
  ["scrollSnapType", "scroll-snap-type"],
  ["scrollSnapAlign", "scroll-snap-align"],
  ["outline", "outline"],
  ["outlineOffset", "outline-offset"],
  ["accentColor", "accent-color"],
  ["caretColor", "caret-color"],
];

function builderNodeContainerQueryStyleAttrs(
  breakpoint: "tablet" | "mobile",
  bucket: BuilderNodeStyleValue | undefined,
) {
  const attrs: Record<string, string | undefined> = {};
  const prefix = `data-builder-style-cq-${breakpoint}`;
  if (bucket?.size) attrs[`${prefix}-size`] = bucket.size;
  if (bucket?.visibility === "hidden") attrs[`${prefix}-hidden`] = "";
  if (bucket?.borderColor || bucket?.borderWidth || bucket?.borderStyle) {
    attrs[`${prefix}-border-width`] = "";
    attrs[`${prefix}-border-style`] = "";
  }
  if (hasTransitionLonghands(bucket)) attrs[`${prefix}-transition`] = "";
  for (const [key, attr] of CONTAINER_QUERY_STYLE_ATTR_KEYS) {
    const value = bucket?.[key];
    if (value !== undefined && value !== "") attrs[`${prefix}-${attr}`] = "";
  }
  return attrs;
}

function builderNodeStyleAttrs(style: BuilderNodeStyle | undefined) {
  const tablet = style?.responsive?.tablet;
  const mobile = style?.responsive?.mobile;
  const hasBaseTransition = Boolean(style?.hover) || hasTransitionLonghands(style);
  return {
    "data-builder-style-align": style?.align,
    "data-builder-style-size": style?.size,
    "data-builder-style-tone": style?.tone,
    "data-builder-style-width": style?.maxWidth,
    "data-builder-style-background": style?.background,
    "data-builder-style-radius": style?.radius,
    "data-builder-style-fit": style?.objectFit,
    "data-builder-style-object-position": style?.objectPosition,
    "data-builder-style-ratio": style?.aspectRatio,
    "data-builder-style-container-type": style?.containerType ? "" : undefined,
    "data-builder-style-container-name": style?.containerName ? "" : undefined,
    "data-builder-style-transition": hasBaseTransition ? "" : undefined,
    ...builderNodeContainerQueryStyleAttrs(
      "tablet",
      style?.containerQueries?.tablet,
    ),
    ...builderNodeContainerQueryStyleAttrs(
      "mobile",
      style?.containerQueries?.mobile,
    ),
    "data-builder-style-tablet-align": tablet?.align,
    "data-builder-style-tablet-size": tablet?.size,
    "data-builder-style-tablet-tone": tablet?.tone,
    "data-builder-style-tablet-width": tablet?.maxWidth,
    "data-builder-style-tablet-margin-top": tablet?.marginTop,
    "data-builder-style-tablet-margin-bottom": tablet?.marginBottom,
    "data-builder-style-tablet-padding-x": tablet?.paddingX,
    "data-builder-style-tablet-padding-y": tablet?.paddingY,
    "data-builder-style-tablet-background": tablet?.background,
    "data-builder-style-tablet-radius": tablet?.radius,
    "data-builder-style-tablet-fit": tablet?.objectFit,
    "data-builder-style-tablet-object-position": tablet?.objectPosition,
    "data-builder-style-tablet-ratio": tablet?.aspectRatio,
    "data-builder-style-tablet-aspect-free": tablet?.aspectRatioFree ? "" : undefined,
    "data-builder-style-tablet-hidden": tablet?.visibility === "hidden" ? "" : undefined,
    "data-builder-style-tablet-font-family": tablet?.fontFamily ? "" : undefined,
    "data-builder-style-tablet-font-size": tablet?.fontSize ? "" : undefined,
    "data-builder-style-tablet-font-weight":
      typeof tablet?.fontWeight === "number" ? "" : undefined,
    "data-builder-style-tablet-line-height": tablet?.lineHeight ? "" : undefined,
    "data-builder-style-tablet-letter-spacing": tablet?.letterSpacing ? "" : undefined,
    "data-builder-style-tablet-text-transform": tablet?.textTransform ? "" : undefined,
    "data-builder-style-tablet-font-style": tablet?.fontStyle ? "" : undefined,
    "data-builder-style-tablet-text-decoration": tablet?.textDecoration ? "" : undefined,
    "data-builder-style-tablet-text-color": tablet?.textColor ? "" : undefined,
    "data-builder-style-tablet-bg-color": tablet?.backgroundColor ? "" : undefined,
    "data-builder-style-tablet-border-color": tablet?.borderColor ? "" : undefined,
    "data-builder-style-tablet-border-width":
      tablet?.borderColor || tablet?.borderWidth || tablet?.borderStyle ? "" : undefined,
    "data-builder-style-tablet-border-style":
      tablet?.borderColor || tablet?.borderWidth || tablet?.borderStyle ? "" : undefined,
    "data-builder-style-tablet-free-width": tablet?.width ? "" : undefined,
    "data-builder-style-tablet-height": tablet?.height ? "" : undefined,
    "data-builder-style-tablet-min-height": tablet?.minHeight ? "" : undefined,
    "data-builder-style-tablet-min-width": tablet?.minWidth ? "" : undefined,
    "data-builder-style-tablet-max-width-free": tablet?.maxWidthFree ? "" : undefined,
    "data-builder-style-tablet-max-height": tablet?.maxHeight ? "" : undefined,
    "data-builder-style-tablet-padding-top": tablet?.paddingTop ? "" : undefined,
    "data-builder-style-tablet-padding-right": tablet?.paddingRight ? "" : undefined,
    "data-builder-style-tablet-padding-bottom": tablet?.paddingBottom ? "" : undefined,
    "data-builder-style-tablet-padding-left": tablet?.paddingLeft ? "" : undefined,
    "data-builder-style-tablet-margin-top-free": tablet?.marginTopFree ? "" : undefined,
    "data-builder-style-tablet-margin-right-free": tablet?.marginRightFree ? "" : undefined,
    "data-builder-style-tablet-margin-bottom-free": tablet?.marginBottomFree ? "" : undefined,
    "data-builder-style-tablet-margin-left-free": tablet?.marginLeftFree ? "" : undefined,
    "data-builder-style-tablet-shadow": tablet?.boxShadow ? "" : undefined,
    "data-builder-style-tablet-text-shadow": tablet?.textShadow ? "" : undefined,
    "data-builder-style-tablet-bg-image": tablet?.backgroundImage ? "" : undefined,
    "data-builder-style-tablet-opacity":
      typeof tablet?.opacity === "number" ? "" : undefined,
    "data-builder-style-tablet-radius-free": tablet?.borderRadius ? "" : undefined,
    "data-builder-style-tablet-gap-free": tablet?.gap ? "" : undefined,
    "data-builder-style-tablet-position": tablet?.position ? "" : undefined,
    "data-builder-style-tablet-inset-top": tablet?.top ? "" : undefined,
    "data-builder-style-tablet-inset-right": tablet?.right ? "" : undefined,
    "data-builder-style-tablet-inset-bottom": tablet?.bottom ? "" : undefined,
    "data-builder-style-tablet-inset-left": tablet?.left ? "" : undefined,
    "data-builder-style-tablet-z-index":
      typeof tablet?.zIndex === "number" ? "" : undefined,
    "data-builder-style-tablet-overflow": tablet?.overflow ? "" : undefined,
    "data-builder-style-tablet-rotate": tablet?.rotate ? "" : undefined,
    "data-builder-style-tablet-scale": tablet?.scale ? "" : undefined,
    "data-builder-style-tablet-translate": tablet?.translate ? "" : undefined,
    "data-builder-style-tablet-transform-origin": tablet?.transformOrigin
      ? ""
      : undefined,
    "data-builder-style-tablet-align-self": tablet?.alignSelf ? "" : undefined,
    "data-builder-style-tablet-flex-grow":
      typeof tablet?.flexGrow === "number" ? "" : undefined,
    "data-builder-style-tablet-flex-shrink":
      typeof tablet?.flexShrink === "number" ? "" : undefined,
    "data-builder-style-tablet-flex-basis": tablet?.flexBasis ? "" : undefined,
    "data-builder-style-tablet-grid-column": tablet?.gridColumn ? "" : undefined,
    "data-builder-style-tablet-grid-row": tablet?.gridRow ? "" : undefined,
    "data-builder-style-tablet-filter": tablet?.filter ? "" : undefined,
    "data-builder-style-tablet-backdrop-filter":
      tablet?.backdropFilter ? "" : undefined,
    "data-builder-style-tablet-mix-blend-mode":
      tablet?.mixBlendMode ? "" : undefined,
    "data-builder-style-tablet-justify-content": tablet?.justifyContent ? "" : undefined,
    "data-builder-style-tablet-align-items": tablet?.alignItems ? "" : undefined,
    "data-builder-style-tablet-flex-wrap": tablet?.flexWrap ? "" : undefined,
    "data-builder-style-tablet-grid-template-columns": tablet?.gridTemplateColumns ? "" : undefined,
    "data-builder-style-tablet-grid-template-rows": tablet?.gridTemplateRows ? "" : undefined,
    "data-builder-style-tablet-grid-auto-flow": tablet?.gridAutoFlow ? "" : undefined,
    "data-builder-style-tablet-clip-path": tablet?.clipPath ? "" : undefined,
    "data-builder-style-tablet-mask-image": tablet?.maskImage ? "" : undefined,
    "data-builder-style-tablet-text-stroke": tablet?.textStroke ? "" : undefined,
    "data-builder-style-tablet-cursor": tablet?.cursor ? "" : undefined,
    "data-builder-style-tablet-user-select": tablet?.userSelect ? "" : undefined,
    "data-builder-style-tablet-pointer-events": tablet?.pointerEvents ? "" : undefined,
    "data-builder-style-tablet-scroll-snap-type": tablet?.scrollSnapType ? "" : undefined,
    "data-builder-style-tablet-scroll-snap-align": tablet?.scrollSnapAlign ? "" : undefined,
    "data-builder-style-tablet-outline": tablet?.outline ? "" : undefined,
    "data-builder-style-tablet-outline-offset": tablet?.outlineOffset ? "" : undefined,
    "data-builder-style-tablet-accent-color": tablet?.accentColor ? "" : undefined,
    "data-builder-style-tablet-caret-color": tablet?.caretColor ? "" : undefined,
    "data-builder-style-tablet-transition": hasTransitionLonghands(tablet)
      ? ""
      : undefined,
    "data-builder-style-mobile-align": mobile?.align,
    "data-builder-style-mobile-size": mobile?.size,
    "data-builder-style-mobile-tone": mobile?.tone,
    "data-builder-style-mobile-width": mobile?.maxWidth,
    "data-builder-style-mobile-margin-top": mobile?.marginTop,
    "data-builder-style-mobile-margin-bottom": mobile?.marginBottom,
    "data-builder-style-mobile-padding-x": mobile?.paddingX,
    "data-builder-style-mobile-padding-y": mobile?.paddingY,
    "data-builder-style-mobile-background": mobile?.background,
    "data-builder-style-mobile-radius": mobile?.radius,
    "data-builder-style-mobile-fit": mobile?.objectFit,
    "data-builder-style-mobile-object-position": mobile?.objectPosition,
    "data-builder-style-mobile-ratio": mobile?.aspectRatio,
    "data-builder-style-mobile-aspect-free": mobile?.aspectRatioFree ? "" : undefined,
    "data-builder-style-mobile-hidden": mobile?.visibility === "hidden" ? "" : undefined,
    "data-builder-style-mobile-font-family": mobile?.fontFamily ? "" : undefined,
    "data-builder-style-mobile-font-size": mobile?.fontSize ? "" : undefined,
    "data-builder-style-mobile-font-weight":
      typeof mobile?.fontWeight === "number" ? "" : undefined,
    "data-builder-style-mobile-line-height": mobile?.lineHeight ? "" : undefined,
    "data-builder-style-mobile-letter-spacing": mobile?.letterSpacing ? "" : undefined,
    "data-builder-style-mobile-text-transform": mobile?.textTransform ? "" : undefined,
    "data-builder-style-mobile-font-style": mobile?.fontStyle ? "" : undefined,
    "data-builder-style-mobile-text-decoration": mobile?.textDecoration ? "" : undefined,
    "data-builder-style-mobile-text-color": mobile?.textColor ? "" : undefined,
    "data-builder-style-mobile-bg-color": mobile?.backgroundColor ? "" : undefined,
    "data-builder-style-mobile-border-color": mobile?.borderColor ? "" : undefined,
    "data-builder-style-mobile-border-width":
      mobile?.borderColor || mobile?.borderWidth || mobile?.borderStyle ? "" : undefined,
    "data-builder-style-mobile-border-style":
      mobile?.borderColor || mobile?.borderWidth || mobile?.borderStyle ? "" : undefined,
    "data-builder-style-mobile-free-width": mobile?.width ? "" : undefined,
    "data-builder-style-mobile-height": mobile?.height ? "" : undefined,
    "data-builder-style-mobile-min-height": mobile?.minHeight ? "" : undefined,
    "data-builder-style-mobile-min-width": mobile?.minWidth ? "" : undefined,
    "data-builder-style-mobile-max-width-free": mobile?.maxWidthFree ? "" : undefined,
    "data-builder-style-mobile-max-height": mobile?.maxHeight ? "" : undefined,
    "data-builder-style-mobile-padding-top": mobile?.paddingTop ? "" : undefined,
    "data-builder-style-mobile-padding-right": mobile?.paddingRight ? "" : undefined,
    "data-builder-style-mobile-padding-bottom": mobile?.paddingBottom ? "" : undefined,
    "data-builder-style-mobile-padding-left": mobile?.paddingLeft ? "" : undefined,
    "data-builder-style-mobile-margin-top-free": mobile?.marginTopFree ? "" : undefined,
    "data-builder-style-mobile-margin-right-free": mobile?.marginRightFree ? "" : undefined,
    "data-builder-style-mobile-margin-bottom-free": mobile?.marginBottomFree ? "" : undefined,
    "data-builder-style-mobile-margin-left-free": mobile?.marginLeftFree ? "" : undefined,
    "data-builder-style-mobile-shadow": mobile?.boxShadow ? "" : undefined,
    "data-builder-style-mobile-text-shadow": mobile?.textShadow ? "" : undefined,
    "data-builder-style-mobile-bg-image": mobile?.backgroundImage ? "" : undefined,
    "data-builder-style-mobile-opacity":
      typeof mobile?.opacity === "number" ? "" : undefined,
    "data-builder-style-mobile-radius-free": mobile?.borderRadius ? "" : undefined,
    "data-builder-style-mobile-gap-free": mobile?.gap ? "" : undefined,
    "data-builder-style-mobile-position": mobile?.position ? "" : undefined,
    "data-builder-style-mobile-inset-top": mobile?.top ? "" : undefined,
    "data-builder-style-mobile-inset-right": mobile?.right ? "" : undefined,
    "data-builder-style-mobile-inset-bottom": mobile?.bottom ? "" : undefined,
    "data-builder-style-mobile-inset-left": mobile?.left ? "" : undefined,
    "data-builder-style-mobile-z-index":
      typeof mobile?.zIndex === "number" ? "" : undefined,
    "data-builder-style-mobile-overflow": mobile?.overflow ? "" : undefined,
    "data-builder-style-mobile-rotate": mobile?.rotate ? "" : undefined,
    "data-builder-style-mobile-scale": mobile?.scale ? "" : undefined,
    "data-builder-style-mobile-translate": mobile?.translate ? "" : undefined,
    "data-builder-style-mobile-transform-origin": mobile?.transformOrigin
      ? ""
      : undefined,
    "data-builder-style-mobile-align-self": mobile?.alignSelf ? "" : undefined,
    "data-builder-style-mobile-flex-grow":
      typeof mobile?.flexGrow === "number" ? "" : undefined,
    "data-builder-style-mobile-flex-shrink":
      typeof mobile?.flexShrink === "number" ? "" : undefined,
    "data-builder-style-mobile-flex-basis": mobile?.flexBasis ? "" : undefined,
    "data-builder-style-mobile-grid-column": mobile?.gridColumn ? "" : undefined,
    "data-builder-style-mobile-grid-row": mobile?.gridRow ? "" : undefined,
    "data-builder-style-mobile-filter": mobile?.filter ? "" : undefined,
    "data-builder-style-mobile-backdrop-filter":
      mobile?.backdropFilter ? "" : undefined,
    "data-builder-style-mobile-mix-blend-mode":
      mobile?.mixBlendMode ? "" : undefined,
    "data-builder-style-mobile-justify-content": mobile?.justifyContent ? "" : undefined,
    "data-builder-style-mobile-align-items": mobile?.alignItems ? "" : undefined,
    "data-builder-style-mobile-flex-wrap": mobile?.flexWrap ? "" : undefined,
    "data-builder-style-mobile-grid-template-columns": mobile?.gridTemplateColumns ? "" : undefined,
    "data-builder-style-mobile-grid-template-rows": mobile?.gridTemplateRows ? "" : undefined,
    "data-builder-style-mobile-grid-auto-flow": mobile?.gridAutoFlow ? "" : undefined,
    "data-builder-style-mobile-clip-path": mobile?.clipPath ? "" : undefined,
    "data-builder-style-mobile-mask-image": mobile?.maskImage ? "" : undefined,
    "data-builder-style-mobile-text-stroke": mobile?.textStroke ? "" : undefined,
    "data-builder-style-mobile-cursor": mobile?.cursor ? "" : undefined,
    "data-builder-style-mobile-user-select": mobile?.userSelect ? "" : undefined,
    "data-builder-style-mobile-pointer-events": mobile?.pointerEvents ? "" : undefined,
    "data-builder-style-mobile-scroll-snap-type": mobile?.scrollSnapType ? "" : undefined,
    "data-builder-style-mobile-scroll-snap-align": mobile?.scrollSnapAlign ? "" : undefined,
    "data-builder-style-mobile-outline": mobile?.outline ? "" : undefined,
    "data-builder-style-mobile-outline-offset": mobile?.outlineOffset ? "" : undefined,
    "data-builder-style-mobile-accent-color": mobile?.accentColor ? "" : undefined,
    "data-builder-style-mobile-caret-color": mobile?.caretColor ? "" : undefined,
    "data-builder-style-mobile-transition": hasTransitionLonghands(mobile)
      ? ""
      : undefined,
    // Hover-state gates — each presence attr arms the matching :hover rule in the
    // static sheet (which reads the --bn-hover-* var). No attr ⇒ no rule ⇒ resting
    // value is untouched.
    "data-builder-style-hover-bg": style?.hover?.backgroundColor ? "" : undefined,
    "data-builder-style-hover-color": style?.hover?.color ? "" : undefined,
    "data-builder-style-hover-border-color": style?.hover?.borderColor ? "" : undefined,
    "data-builder-style-hover-shadow": style?.hover?.boxShadow ? "" : undefined,
    "data-builder-style-hover-scale": style?.hover?.scale ? "" : undefined,
    "data-builder-style-hover-translate": style?.hover?.translate ? "" : undefined,
    "data-builder-style-hover-opacity":
      typeof style?.hover?.opacity === "number" ? "" : undefined,
  };
}

function styleColor(tone: BuilderNodeStyleValue["tone"]): string | undefined {
  if (tone === "muted") return "rgba(18, 18, 18, 0.62)";
  if (tone === "strong") return "#111";
  return undefined;
}

function styleBackground(
  background: BuilderNodeStyleValue["background"],
): string | undefined {
  if (background === "none") return "transparent";
  if (background === "surface") return "rgba(246, 241, 232, 0.92)";
  if (background === "contrast") return "#111";
  return undefined;
}

function containerQueryStyleVars(
  breakpoint: "tablet" | "mobile",
  style: BuilderNodeStyleValue | undefined,
  base: BuilderNodeStyle | undefined,
): Record<string, string | number | undefined> {
  const prefix = `--bn-cq-${breakpoint}`;
  return {
    [`${prefix}-align`]: style?.align,
    [`${prefix}-color`]: styleColor(style?.tone),
    [`${prefix}-max-width`]: style?.maxWidth
      ? NODE_MAX_WIDTH[style.maxWidth]
      : undefined,
    [`${prefix}-margin-top`]: style?.marginTop
      ? NODE_SPACING[style.marginTop]
      : undefined,
    [`${prefix}-margin-bottom`]: style?.marginBottom
      ? NODE_SPACING[style.marginBottom]
      : undefined,
    [`${prefix}-padding-x`]: style?.paddingX
      ? NODE_SPACING[style.paddingX]
      : undefined,
    [`${prefix}-padding-y`]: style?.paddingY
      ? NODE_SPACING[style.paddingY]
      : undefined,
    [`${prefix}-background`]: styleBackground(style?.background),
    [`${prefix}-radius`]: style?.radius ? NODE_RADIUS[style.radius] : undefined,
    [`${prefix}-fit`]: style?.objectFit,
    [`${prefix}-object-position`]: style?.objectPosition,
    [`${prefix}-ratio`]: style?.aspectRatio
      ? NODE_ASPECT_RATIO[style.aspectRatio]
      : undefined,
    [`${prefix}-aspect-free`]: style?.aspectRatioFree,
    [`${prefix}-font-family`]: style?.fontFamily,
    [`${prefix}-font-size`]: style?.fontSize,
    [`${prefix}-font-weight`]: style?.fontWeight,
    [`${prefix}-line-height`]: style?.lineHeight,
    [`${prefix}-letter-spacing`]: style?.letterSpacing,
    [`${prefix}-text-transform`]: style?.textTransform,
    [`${prefix}-font-style`]: style?.fontStyle,
    [`${prefix}-text-decoration`]: style?.textDecoration,
    [`${prefix}-text-color`]: style?.textColor,
    [`${prefix}-bg-color`]: style?.backgroundColor,
    [`${prefix}-border-color`]: style?.borderColor,
    [`${prefix}-border-width`]:
      style?.borderColor || style?.borderWidth || style?.borderStyle
        ? style?.borderWidth ?? base?.borderWidth ?? "1px"
        : undefined,
    [`${prefix}-border-style`]:
      style?.borderColor || style?.borderWidth || style?.borderStyle
        ? style?.borderStyle ?? base?.borderStyle ?? "solid"
        : undefined,
    [`${prefix}-free-width`]: style?.width,
    [`${prefix}-height`]: style?.height,
    [`${prefix}-min-height`]: style?.minHeight,
    [`${prefix}-min-width`]: style?.minWidth,
    [`${prefix}-max-width-free`]: style?.maxWidthFree,
    [`${prefix}-max-height`]: style?.maxHeight,
    [`${prefix}-padding-top`]: style?.paddingTop,
    [`${prefix}-padding-right`]: style?.paddingRight,
    [`${prefix}-padding-bottom`]: style?.paddingBottom,
    [`${prefix}-padding-left`]: style?.paddingLeft,
    [`${prefix}-margin-top-free`]: style?.marginTopFree,
    [`${prefix}-margin-right-free`]: style?.marginRightFree,
    [`${prefix}-margin-bottom-free`]: style?.marginBottomFree,
    [`${prefix}-margin-left-free`]: style?.marginLeftFree,
    [`${prefix}-shadow`]: style?.boxShadow,
    [`${prefix}-text-shadow`]: style?.textShadow,
    [`${prefix}-bg-image`]: style?.backgroundImage,
    [`${prefix}-opacity`]: style?.opacity,
    [`${prefix}-radius-free`]: style?.borderRadius,
    [`${prefix}-gap-free`]: style?.gap,
    [`${prefix}-container-type`]: style?.containerType,
    [`${prefix}-container-name`]: style?.containerName,
    [`${prefix}-position`]: style?.position,
    [`${prefix}-inset-top`]: style?.top,
    [`${prefix}-inset-right`]: style?.right,
    [`${prefix}-inset-bottom`]: style?.bottom,
    [`${prefix}-inset-left`]: style?.left,
    [`${prefix}-z-index`]: style?.zIndex,
    [`${prefix}-overflow`]: style?.overflow,
    [`${prefix}-rotate`]: style?.rotate,
    [`${prefix}-scale`]: style?.scale,
    [`${prefix}-translate`]: style?.translate,
    [`${prefix}-transform-origin`]: style?.transformOrigin,
    [`${prefix}-transition-property`]: style?.transitionProperty,
    [`${prefix}-transition-duration`]: style?.transitionDuration,
    [`${prefix}-transition-timing-function`]: style?.transitionTimingFunction,
    [`${prefix}-transition-delay`]: style?.transitionDelay,
    [`${prefix}-align-self`]: style?.alignSelf,
    [`${prefix}-flex-grow`]: style?.flexGrow,
    [`${prefix}-flex-shrink`]: style?.flexShrink,
    [`${prefix}-flex-basis`]: style?.flexBasis,
    [`${prefix}-grid-column`]: style?.gridColumn,
    [`${prefix}-grid-row`]: style?.gridRow,
    [`${prefix}-filter`]: style?.filter,
    [`${prefix}-backdrop-filter`]: style?.backdropFilter,
    [`${prefix}-mix-blend-mode`]: style?.mixBlendMode,
    [`${prefix}-justify-content`]: style?.justifyContent,
    [`${prefix}-align-items`]: style?.alignItems,
    [`${prefix}-flex-wrap`]: style?.flexWrap,
    [`${prefix}-grid-template-columns`]: style?.gridTemplateColumns,
    [`${prefix}-grid-template-rows`]: style?.gridTemplateRows,
    [`${prefix}-grid-auto-flow`]: style?.gridAutoFlow,
    [`${prefix}-clip-path`]: style?.clipPath,
    [`${prefix}-mask-image`]: style?.maskImage,
    [`${prefix}-text-stroke`]: style?.textStroke,
    [`${prefix}-cursor`]: style?.cursor,
    [`${prefix}-user-select`]: style?.userSelect,
    [`${prefix}-pointer-events`]: style?.pointerEvents,
    [`${prefix}-scroll-snap-type`]: style?.scrollSnapType,
    [`${prefix}-scroll-snap-align`]: style?.scrollSnapAlign,
    [`${prefix}-outline`]: style?.outline,
    [`${prefix}-outline-offset`]: style?.outlineOffset,
    [`${prefix}-accent-color`]: style?.accentColor,
    [`${prefix}-caret-color`]: style?.caretColor,
  };
}

function responsiveStyleVars(
  style: BuilderNodeStyle | undefined,
): CSSProperties {
  const hasBaseTransition =
    Boolean(style?.hover) || hasTransitionLonghands(style);
  return builderNodeStyleVars({
    "--bn-container-type": style?.containerType,
    "--bn-container-name": style?.containerName,
    ...containerQueryStyleVars("tablet", style?.containerQueries?.tablet, style),
    ...containerQueryStyleVars("mobile", style?.containerQueries?.mobile, style),
    "--bn-transition-property": hasBaseTransition
      ? style?.transitionProperty ?? "all"
      : undefined,
    "--bn-transition-duration": hasBaseTransition
      ? style?.transitionDuration ?? ".2s"
      : undefined,
    "--bn-transition-timing-function": hasBaseTransition
      ? style?.transitionTimingFunction ?? "ease"
      : undefined,
    "--bn-transition-delay": hasBaseTransition
      ? style?.transitionDelay ?? "0s"
      : undefined,
    "--bn-tablet-align": style?.responsive?.tablet?.align,
    "--bn-tablet-color": styleColor(style?.responsive?.tablet?.tone),
    "--bn-tablet-max-width": style?.responsive?.tablet?.maxWidth
      ? NODE_MAX_WIDTH[style.responsive.tablet.maxWidth]
      : undefined,
    "--bn-tablet-margin-top": style?.responsive?.tablet?.marginTop
      ? NODE_SPACING[style.responsive.tablet.marginTop]
      : undefined,
    "--bn-tablet-margin-bottom": style?.responsive?.tablet?.marginBottom
      ? NODE_SPACING[style.responsive.tablet.marginBottom]
      : undefined,
    "--bn-tablet-padding-x": style?.responsive?.tablet?.paddingX
      ? NODE_SPACING[style.responsive.tablet.paddingX]
      : undefined,
    "--bn-tablet-padding-y": style?.responsive?.tablet?.paddingY
      ? NODE_SPACING[style.responsive.tablet.paddingY]
      : undefined,
    "--bn-tablet-background": styleBackground(style?.responsive?.tablet?.background),
    "--bn-tablet-radius": style?.responsive?.tablet?.radius
      ? NODE_RADIUS[style.responsive.tablet.radius]
      : undefined,
    "--bn-tablet-fit": style?.responsive?.tablet?.objectFit,
    "--bn-tablet-object-position": style?.responsive?.tablet?.objectPosition,
    "--bn-tablet-ratio": style?.responsive?.tablet?.aspectRatio
      ? NODE_ASPECT_RATIO[style.responsive.tablet.aspectRatio]
      : undefined,
    "--bn-tablet-aspect-free": style?.responsive?.tablet?.aspectRatioFree,
    "--bn-mobile-align": style?.responsive?.mobile?.align,
    "--bn-mobile-color": styleColor(style?.responsive?.mobile?.tone),
    "--bn-mobile-max-width": style?.responsive?.mobile?.maxWidth
      ? NODE_MAX_WIDTH[style.responsive.mobile.maxWidth]
      : undefined,
    "--bn-mobile-margin-top": style?.responsive?.mobile?.marginTop
      ? NODE_SPACING[style.responsive.mobile.marginTop]
      : undefined,
    "--bn-mobile-margin-bottom": style?.responsive?.mobile?.marginBottom
      ? NODE_SPACING[style.responsive.mobile.marginBottom]
      : undefined,
    "--bn-mobile-padding-x": style?.responsive?.mobile?.paddingX
      ? NODE_SPACING[style.responsive.mobile.paddingX]
      : undefined,
    "--bn-mobile-padding-y": style?.responsive?.mobile?.paddingY
      ? NODE_SPACING[style.responsive.mobile.paddingY]
      : undefined,
    "--bn-mobile-background": styleBackground(style?.responsive?.mobile?.background),
    "--bn-mobile-radius": style?.responsive?.mobile?.radius
      ? NODE_RADIUS[style.responsive.mobile.radius]
      : undefined,
    "--bn-mobile-fit": style?.responsive?.mobile?.objectFit,
    "--bn-mobile-object-position": style?.responsive?.mobile?.objectPosition,
    "--bn-mobile-ratio": style?.responsive?.mobile?.aspectRatio
      ? NODE_ASPECT_RATIO[style.responsive.mobile.aspectRatio]
      : undefined,
    "--bn-mobile-aspect-free": style?.responsive?.mobile?.aspectRatioFree,
    // Free-value escapes — per-breakpoint overrides. Desktop applies these inline
    // in sharedNodeStyle; these vars only render when the breakpoint value is set,
    // gated by the matching data-attr so an unset var never clobbers the desktop
    // value (an ungated !important rule would reset inherited props to the parent).
    "--bn-tablet-font-family": style?.responsive?.tablet?.fontFamily,
    "--bn-tablet-font-size": style?.responsive?.tablet?.fontSize,
    "--bn-tablet-font-weight": style?.responsive?.tablet?.fontWeight,
    "--bn-tablet-line-height": style?.responsive?.tablet?.lineHeight,
    "--bn-tablet-letter-spacing": style?.responsive?.tablet?.letterSpacing,
    "--bn-tablet-text-transform": style?.responsive?.tablet?.textTransform,
    "--bn-tablet-font-style": style?.responsive?.tablet?.fontStyle,
    "--bn-tablet-text-decoration": style?.responsive?.tablet?.textDecoration,
    "--bn-tablet-text-color": style?.responsive?.tablet?.textColor,
    "--bn-tablet-bg-color": style?.responsive?.tablet?.backgroundColor,
    "--bn-tablet-border-color": style?.responsive?.tablet?.borderColor,
    "--bn-tablet-border-width":
      style?.responsive?.tablet?.borderColor ||
      style?.responsive?.tablet?.borderWidth ||
      style?.responsive?.tablet?.borderStyle
        ? style?.responsive?.tablet?.borderWidth ?? style?.borderWidth ?? "1px"
        : undefined,
    "--bn-tablet-border-style":
      style?.responsive?.tablet?.borderColor ||
      style?.responsive?.tablet?.borderWidth ||
      style?.responsive?.tablet?.borderStyle
        ? style?.responsive?.tablet?.borderStyle ?? style?.borderStyle ?? "solid"
        : undefined,
    "--bn-mobile-font-family": style?.responsive?.mobile?.fontFamily,
    "--bn-mobile-font-size": style?.responsive?.mobile?.fontSize,
    "--bn-mobile-font-weight": style?.responsive?.mobile?.fontWeight,
    "--bn-mobile-line-height": style?.responsive?.mobile?.lineHeight,
    "--bn-mobile-letter-spacing": style?.responsive?.mobile?.letterSpacing,
    "--bn-mobile-text-transform": style?.responsive?.mobile?.textTransform,
    "--bn-mobile-font-style": style?.responsive?.mobile?.fontStyle,
    "--bn-mobile-text-decoration": style?.responsive?.mobile?.textDecoration,
    "--bn-mobile-text-color": style?.responsive?.mobile?.textColor,
    "--bn-mobile-bg-color": style?.responsive?.mobile?.backgroundColor,
    "--bn-mobile-border-color": style?.responsive?.mobile?.borderColor,
    "--bn-mobile-border-width":
      style?.responsive?.mobile?.borderColor ||
      style?.responsive?.mobile?.borderWidth ||
      style?.responsive?.mobile?.borderStyle
        ? style?.responsive?.mobile?.borderWidth ?? style?.borderWidth ?? "1px"
        : undefined,
    "--bn-mobile-border-style":
      style?.responsive?.mobile?.borderColor ||
      style?.responsive?.mobile?.borderWidth ||
      style?.responsive?.mobile?.borderStyle
        ? style?.responsive?.mobile?.borderStyle ?? style?.borderStyle ?? "solid"
        : undefined,
    "--bn-tablet-free-width": style?.responsive?.tablet?.width,
    "--bn-tablet-height": style?.responsive?.tablet?.height,
    "--bn-tablet-min-height": style?.responsive?.tablet?.minHeight,
    "--bn-tablet-min-width": style?.responsive?.tablet?.minWidth,
    "--bn-tablet-max-width-free": style?.responsive?.tablet?.maxWidthFree,
    "--bn-tablet-max-height": style?.responsive?.tablet?.maxHeight,
    "--bn-mobile-free-width": style?.responsive?.mobile?.width,
    "--bn-mobile-height": style?.responsive?.mobile?.height,
    "--bn-mobile-min-height": style?.responsive?.mobile?.minHeight,
    "--bn-mobile-min-width": style?.responsive?.mobile?.minWidth,
    "--bn-mobile-max-width-free": style?.responsive?.mobile?.maxWidthFree,
    "--bn-mobile-max-height": style?.responsive?.mobile?.maxHeight,
    "--bn-tablet-padding-top": style?.responsive?.tablet?.paddingTop,
    "--bn-tablet-padding-right": style?.responsive?.tablet?.paddingRight,
    "--bn-tablet-padding-bottom": style?.responsive?.tablet?.paddingBottom,
    "--bn-tablet-padding-left": style?.responsive?.tablet?.paddingLeft,
    "--bn-mobile-padding-top": style?.responsive?.mobile?.paddingTop,
    "--bn-mobile-padding-right": style?.responsive?.mobile?.paddingRight,
    "--bn-mobile-padding-bottom": style?.responsive?.mobile?.paddingBottom,
    "--bn-mobile-padding-left": style?.responsive?.mobile?.paddingLeft,
    "--bn-tablet-margin-top-free": style?.responsive?.tablet?.marginTopFree,
    "--bn-tablet-margin-right-free": style?.responsive?.tablet?.marginRightFree,
    "--bn-tablet-margin-bottom-free": style?.responsive?.tablet?.marginBottomFree,
    "--bn-tablet-margin-left-free": style?.responsive?.tablet?.marginLeftFree,
    "--bn-mobile-margin-top-free": style?.responsive?.mobile?.marginTopFree,
    "--bn-mobile-margin-right-free": style?.responsive?.mobile?.marginRightFree,
    "--bn-mobile-margin-bottom-free": style?.responsive?.mobile?.marginBottomFree,
    "--bn-mobile-margin-left-free": style?.responsive?.mobile?.marginLeftFree,
    "--bn-tablet-shadow": style?.responsive?.tablet?.boxShadow,
    "--bn-tablet-text-shadow": style?.responsive?.tablet?.textShadow,
    "--bn-tablet-bg-image": style?.responsive?.tablet?.backgroundImage,
    "--bn-tablet-opacity": style?.responsive?.tablet?.opacity,
    "--bn-mobile-shadow": style?.responsive?.mobile?.boxShadow,
    "--bn-mobile-text-shadow": style?.responsive?.mobile?.textShadow,
    "--bn-mobile-bg-image": style?.responsive?.mobile?.backgroundImage,
    "--bn-mobile-opacity": style?.responsive?.mobile?.opacity,
    "--bn-tablet-radius-free": style?.responsive?.tablet?.borderRadius,
    "--bn-mobile-radius-free": style?.responsive?.mobile?.borderRadius,
    "--bn-tablet-gap-free": style?.responsive?.tablet?.gap,
    "--bn-mobile-gap-free": style?.responsive?.mobile?.gap,
    "--bn-tablet-position": style?.responsive?.tablet?.position,
    "--bn-tablet-inset-top": style?.responsive?.tablet?.top,
    "--bn-tablet-inset-right": style?.responsive?.tablet?.right,
    "--bn-tablet-inset-bottom": style?.responsive?.tablet?.bottom,
    "--bn-tablet-inset-left": style?.responsive?.tablet?.left,
    "--bn-mobile-position": style?.responsive?.mobile?.position,
    "--bn-mobile-inset-top": style?.responsive?.mobile?.top,
    "--bn-mobile-inset-right": style?.responsive?.mobile?.right,
    "--bn-mobile-inset-bottom": style?.responsive?.mobile?.bottom,
    "--bn-mobile-inset-left": style?.responsive?.mobile?.left,
    "--bn-tablet-z-index": style?.responsive?.tablet?.zIndex,
    "--bn-tablet-overflow": style?.responsive?.tablet?.overflow,
    "--bn-mobile-z-index": style?.responsive?.mobile?.zIndex,
    "--bn-mobile-overflow": style?.responsive?.mobile?.overflow,
    "--bn-tablet-rotate": style?.responsive?.tablet?.rotate,
    "--bn-tablet-scale": style?.responsive?.tablet?.scale,
    "--bn-tablet-translate": style?.responsive?.tablet?.translate,
    "--bn-tablet-transform-origin": style?.responsive?.tablet?.transformOrigin,
    "--bn-mobile-rotate": style?.responsive?.mobile?.rotate,
    "--bn-mobile-scale": style?.responsive?.mobile?.scale,
    "--bn-mobile-translate": style?.responsive?.mobile?.translate,
    "--bn-mobile-transform-origin": style?.responsive?.mobile?.transformOrigin,
    "--bn-tablet-align-self": style?.responsive?.tablet?.alignSelf,
    "--bn-tablet-flex-grow": style?.responsive?.tablet?.flexGrow,
    "--bn-tablet-flex-shrink": style?.responsive?.tablet?.flexShrink,
    "--bn-tablet-flex-basis": style?.responsive?.tablet?.flexBasis,
    "--bn-mobile-align-self": style?.responsive?.mobile?.alignSelf,
    "--bn-mobile-flex-grow": style?.responsive?.mobile?.flexGrow,
    "--bn-mobile-flex-shrink": style?.responsive?.mobile?.flexShrink,
    "--bn-mobile-flex-basis": style?.responsive?.mobile?.flexBasis,
    "--bn-tablet-grid-column": style?.responsive?.tablet?.gridColumn,
    "--bn-tablet-grid-row": style?.responsive?.tablet?.gridRow,
    "--bn-mobile-grid-column": style?.responsive?.mobile?.gridColumn,
    "--bn-mobile-grid-row": style?.responsive?.mobile?.gridRow,
    "--bn-tablet-filter": style?.responsive?.tablet?.filter,
    "--bn-tablet-backdrop-filter": style?.responsive?.tablet?.backdropFilter,
    "--bn-tablet-mix-blend-mode": style?.responsive?.tablet?.mixBlendMode,
    "--bn-mobile-filter": style?.responsive?.mobile?.filter,
    "--bn-mobile-backdrop-filter": style?.responsive?.mobile?.backdropFilter,
    "--bn-mobile-mix-blend-mode": style?.responsive?.mobile?.mixBlendMode,
    "--bn-tablet-justify-content": style?.responsive?.tablet?.justifyContent,
    "--bn-tablet-align-items": style?.responsive?.tablet?.alignItems,
    "--bn-tablet-flex-wrap": style?.responsive?.tablet?.flexWrap,
    "--bn-mobile-justify-content": style?.responsive?.mobile?.justifyContent,
    "--bn-mobile-align-items": style?.responsive?.mobile?.alignItems,
    "--bn-mobile-flex-wrap": style?.responsive?.mobile?.flexWrap,
    "--bn-tablet-grid-template-columns": style?.responsive?.tablet?.gridTemplateColumns,
    "--bn-tablet-grid-template-rows": style?.responsive?.tablet?.gridTemplateRows,
    "--bn-tablet-grid-auto-flow": style?.responsive?.tablet?.gridAutoFlow,
    "--bn-mobile-grid-template-columns": style?.responsive?.mobile?.gridTemplateColumns,
    "--bn-mobile-grid-template-rows": style?.responsive?.mobile?.gridTemplateRows,
    "--bn-mobile-grid-auto-flow": style?.responsive?.mobile?.gridAutoFlow,
    "--bn-tablet-clip-path": style?.responsive?.tablet?.clipPath,
    "--bn-tablet-mask-image": style?.responsive?.tablet?.maskImage,
    "--bn-tablet-text-stroke": style?.responsive?.tablet?.textStroke,
    "--bn-tablet-cursor": style?.responsive?.tablet?.cursor,
    "--bn-tablet-user-select": style?.responsive?.tablet?.userSelect,
    "--bn-tablet-pointer-events": style?.responsive?.tablet?.pointerEvents,
    "--bn-tablet-scroll-snap-type": style?.responsive?.tablet?.scrollSnapType,
    "--bn-tablet-scroll-snap-align": style?.responsive?.tablet?.scrollSnapAlign,
    "--bn-tablet-outline": style?.responsive?.tablet?.outline,
    "--bn-tablet-outline-offset": style?.responsive?.tablet?.outlineOffset,
    "--bn-tablet-accent-color": style?.responsive?.tablet?.accentColor,
    "--bn-tablet-caret-color": style?.responsive?.tablet?.caretColor,
    "--bn-tablet-transition-property":
      style?.responsive?.tablet?.transitionProperty,
    "--bn-tablet-transition-duration":
      style?.responsive?.tablet?.transitionDuration,
    "--bn-tablet-transition-timing-function":
      style?.responsive?.tablet?.transitionTimingFunction,
    "--bn-tablet-transition-delay": style?.responsive?.tablet?.transitionDelay,
    "--bn-mobile-clip-path": style?.responsive?.mobile?.clipPath,
    "--bn-mobile-mask-image": style?.responsive?.mobile?.maskImage,
    "--bn-mobile-text-stroke": style?.responsive?.mobile?.textStroke,
    "--bn-mobile-cursor": style?.responsive?.mobile?.cursor,
    "--bn-mobile-user-select": style?.responsive?.mobile?.userSelect,
    "--bn-mobile-pointer-events": style?.responsive?.mobile?.pointerEvents,
    "--bn-mobile-scroll-snap-type": style?.responsive?.mobile?.scrollSnapType,
    "--bn-mobile-scroll-snap-align": style?.responsive?.mobile?.scrollSnapAlign,
    "--bn-mobile-outline": style?.responsive?.mobile?.outline,
    "--bn-mobile-outline-offset": style?.responsive?.mobile?.outlineOffset,
    "--bn-mobile-accent-color": style?.responsive?.mobile?.accentColor,
    "--bn-mobile-caret-color": style?.responsive?.mobile?.caretColor,
    "--bn-mobile-transition-property":
      style?.responsive?.mobile?.transitionProperty,
    "--bn-mobile-transition-duration":
      style?.responsive?.mobile?.transitionDuration,
    "--bn-mobile-transition-timing-function":
      style?.responsive?.mobile?.transitionTimingFunction,
    "--bn-mobile-transition-delay": style?.responsive?.mobile?.transitionDelay,
    // Hover-state overrides — a single (non-viewport) layer. Each var only renders
    // when set; the matching data-builder-style-hover-* attr gates a :hover rule in
    // the static sheet so the override applies only while hovered/focused, and an
    // unset var never clobbers the resting value.
    "--bn-hover-bg": style?.hover?.backgroundColor,
    "--bn-hover-color": style?.hover?.color,
    "--bn-hover-border-color": style?.hover?.borderColor,
    "--bn-hover-shadow": style?.hover?.boxShadow,
    "--bn-hover-scale": style?.hover?.scale,
    "--bn-hover-translate": style?.hover?.translate,
    "--bn-hover-opacity": style?.hover?.opacity,
  });
}

// Map a friendly easing key to a CSS timing-function. "back" overshoots
// slightly (a tasteful spring feel); "smooth" is the Material standard curve.
function resolveAnimationEasing(
  easing: BuilderNodeStyle["animationEasing"],
): string {
  switch (easing) {
    case "linear":
    case "ease-in":
    case "ease-out":
    case "ease-in-out":
      return easing;
    case "back":
      return "cubic-bezier(0.34, 1.56, 0.64, 1)";
    case "smooth":
      return "cubic-bezier(0.4, 0, 0.2, 1)";
    case "ease":
    default:
      return "ease";
  }
}

function sharedNodeStyle(style: BuilderNodeStyle | undefined): CSSProperties {
  if (!style) return {};
  const out: CSSProperties = {
    ...responsiveStyleVars(style),
  };
  if (style.align) out.textAlign = style.align;
  if (style.maxWidth) out.maxWidth = NODE_MAX_WIDTH[style.maxWidth];
  if (style.marginTop) out.marginTop = NODE_SPACING[style.marginTop];
  if (style.marginBottom) out.marginBottom = NODE_SPACING[style.marginBottom];
  if (style.paddingX) {
    out.paddingLeft = NODE_SPACING[style.paddingX];
    out.paddingRight = NODE_SPACING[style.paddingX];
  }
  if (style.paddingY) {
    out.paddingTop = NODE_SPACING[style.paddingY];
    out.paddingBottom = NODE_SPACING[style.paddingY];
  }
  if (style.radius) out.borderRadius = NODE_RADIUS[style.radius];
  if (style.background === "surface") out.background = "rgba(246, 241, 232, 0.92)";
  if (style.background === "contrast") {
    out.background = "var(--token-color-ink,#111)";
    out.color = "#fff";
  }
  if (style.tone === "muted") out.color = "rgba(18, 18, 18, 0.62)";
  if (style.tone === "strong") out.color = "var(--token-color-ink,#111)";
  // Free-value escapes — applied last so they override the token presets above.
  if (style.fontFamily) out.fontFamily = style.fontFamily;
  if (style.fontSize) out.fontSize = style.fontSize;
  if (typeof style.fontWeight === "number") out.fontWeight = style.fontWeight;
  if (style.lineHeight) out.lineHeight = style.lineHeight;
  if (style.letterSpacing) out.letterSpacing = style.letterSpacing;
  if (style.textTransform) out.textTransform = style.textTransform;
  if (style.fontStyle) out.fontStyle = style.fontStyle;
  if (style.textDecoration) out.textDecoration = style.textDecoration;
  // Advanced text controls.
  if (style.textWrap) {
    (out as Record<string, unknown>).textWrap = style.textWrap;
  }
  if (style.whiteSpace) out.whiteSpace = style.whiteSpace;
  // Line-clamp truncates to N lines with an ellipsis — needs the -webkit-box
  // display + vertical orient + hidden overflow together.
  if (typeof style.lineClamp === "number" && style.lineClamp > 0) {
    out.display = "-webkit-box";
    out.WebkitLineClamp = style.lineClamp;
    out.WebkitBoxOrient = "vertical";
    out.overflow = "hidden";
  }
  if (style.textColor) out.color = style.textColor;
  if (style.backgroundColor) out.backgroundColor = style.backgroundColor;
  if (style.borderColor || style.borderWidth || style.borderStyle) {
    out.borderStyle = style.borderStyle ?? "solid";
    out.borderWidth = style.borderWidth ?? "1px";
    if (style.borderColor) out.borderColor = style.borderColor;
  }
  // Free border-radius escape — applied after the radius token so an exact value
  // (or per-corner shorthand) wins over the preset.
  if (style.borderRadius) out.borderRadius = style.borderRadius;
  // Free dimension escapes — exact width/height + min/max clamps. width coexists
  // with the maxWidth token above; maxWidthFree is applied after it so an exact
  // clamp wins over the preset.
  if (style.width) out.width = style.width;
  if (style.height) out.height = style.height;
  if (style.minHeight) out.minHeight = style.minHeight;
  if (style.minWidth) out.minWidth = style.minWidth;
  if (style.maxWidthFree) out.maxWidth = style.maxWidthFree;
  if (style.maxHeight) out.maxHeight = style.maxHeight;
  // Free per-side padding — applied after the paddingX/paddingY token so an
  // exact side overrides the preset.
  if (style.paddingTop) out.paddingTop = style.paddingTop;
  if (style.paddingRight) out.paddingRight = style.paddingRight;
  if (style.paddingBottom) out.paddingBottom = style.paddingBottom;
  if (style.paddingLeft) out.paddingLeft = style.paddingLeft;
  // Free per-side margin — applied after the marginTop/marginBottom token so an
  // exact side overrides the preset (and adds left/right, which have no token).
  if (style.marginTopFree) out.marginTop = style.marginTopFree;
  if (style.marginRightFree) out.marginRight = style.marginRightFree;
  if (style.marginBottomFree) out.marginBottom = style.marginBottomFree;
  if (style.marginLeftFree) out.marginLeft = style.marginLeftFree;
  // Surface & depth escapes. A box-shadow layers over the token background; a
  // background image/gradient is painted cover/center/no-repeat; opacity 0–1.
  if (style.boxShadow) out.boxShadow = style.boxShadow;
  if (style.textShadow) out.textShadow = style.textShadow;
  // Paint a background image at the desktop level AND whenever any breakpoint
  // sets one, so the paint axes (cover/center/no-repeat defaults, or the free
  // backgroundSize / backgroundPosition / backgroundRepeat overrides) ride the
  // inline style across every breakpoint. The responsive bg-image CSS rule only
  // swaps the image via its var — it never re-forces the paint axes — so a
  // desktop override (e.g. "contain") is never reset at tablet / mobile.
  const hasAnyBackgroundImage =
    style.backgroundImage ||
    style.responsive?.tablet?.backgroundImage ||
    style.responsive?.mobile?.backgroundImage;
  if (style.backgroundImage) out.backgroundImage = style.backgroundImage;
  if (hasAnyBackgroundImage) {
    out.backgroundSize = style.backgroundSize ?? "cover";
    out.backgroundPosition = style.backgroundPosition ?? "center";
    out.backgroundRepeat = style.backgroundRepeat ?? "no-repeat";
  }
  // Gradient/clipped text — paint the background through the text glyphs. Gated
  // on an actual background paint so we never blank the text, and bundled with
  // the -webkit- prefix + transparent text fill the technique requires. Set at
  // the base layer so it cascades to every breakpoint.
  if (
    style.backgroundClip === "text" &&
    (style.backgroundImage || style.backgroundColor)
  ) {
    out.backgroundClip = "text";
    out.WebkitBackgroundClip = "text";
    out.WebkitTextFillColor = "transparent";
  }
  if (typeof style.opacity === "number") out.opacity = style.opacity;
  // Free gap escape — reassign the --bn-gap variable that every layout consumer
  // reads. Spread after the node's own --bn-gap (see containerStyle etc.) so the
  // exact value wins, and inherited by child tracks (carousel) automatically.
  if (style.gap) out["--bn-gap" as keyof CSSProperties] = style.gap as never;
  // Positioning escapes — a position context plus inset offsets. Applied after
  // layout so an explicit position/offset wins; negatives enable overlaps.
  if (style.position) out.position = style.position;
  if (style.top) out.top = style.top;
  if (style.right) out.right = style.right;
  if (style.bottom) out.bottom = style.bottom;
  if (style.left) out.left = style.left;
  // Stacking & clipping escapes — z-index orders overlapping nodes (0 is a
  // valid value, so test the type); overflow clips/scrolls the node's box.
  if (typeof style.zIndex === "number") out.zIndex = style.zIndex;
  if (style.overflow) out.overflow = style.overflow;
  // Transform escapes — standalone rotate/scale/translate (compose
  // independently of any position/layout). Applied after positioning so they
  // layer on top. transformOrigin sets the pivot for rotate/scale.
  if (style.rotate) out.rotate = style.rotate;
  if (style.scale) out.scale = style.scale;
  if (style.translate) out.translate = style.translate;
  if (style.transformOrigin) out.transformOrigin = style.transformOrigin;
  // Legacy transition shorthand. First-class longhands + hover auto-defaults
  // emit through the renderer CSS var/data-attr path above.
  if (style.transition) out.transition = style.transition;
  // Flex/grid child placement — how this node sizes/aligns inside its parent
  // (0 is meaningful for grow/shrink, so test the type). No-op outside flex/grid.
  if (style.alignSelf) out.alignSelf = style.alignSelf;
  if (typeof style.flexGrow === "number") out.flexGrow = style.flexGrow;
  if (typeof style.flexShrink === "number") out.flexShrink = style.flexShrink;
  if (style.flexBasis) out.flexBasis = style.flexBasis;
  // Grid child placement — span/line position in a grid parent. No-op elsewhere.
  if (style.gridColumn) out.gridColumn = style.gridColumn;
  if (style.gridRow) out.gridRow = style.gridRow;
  // Flex/grid container layout — distribute this node's OWN children on the main
  // axis (justifyContent) / cross axis (alignItems) and control row wrapping.
  // Applied inline so a free value wins over the container's structured align /
  // hardcoded wrap. No-op on non-flex/grid nodes.
  if (style.justifyContent) out.justifyContent = style.justifyContent;
  if (style.alignItems) out.alignItems = style.alignItems;
  if (style.flexWrap) out.flexWrap = style.flexWrap;
  // Grid container tracks — free column/row templates + implicit-flow direction.
  // Applied inline so an exact track definition wins over the container's
  // structured repeat(columns) grid. No-op on non-grid nodes.
  if (style.gridTemplateColumns) out.gridTemplateColumns = style.gridTemplateColumns;
  if (style.gridTemplateRows) out.gridTemplateRows = style.gridTemplateRows;
  if (style.gridAutoFlow) out.gridAutoFlow = style.gridAutoFlow;
  // Filter effects — self filter + backdrop frost (with the -webkit- prefix so
  // backdrop-filter works on Safari).
  if (style.filter) out.filter = style.filter;
  if (style.backdropFilter) {
    out.backdropFilter = style.backdropFilter;
    out.WebkitBackdropFilter = style.backdropFilter;
  }
  // Compositing — blend this node against the backdrop (overlays/duotone).
  if (style.mixBlendMode) out.mixBlendMode = style.mixBlendMode;
  // Premium-2026 effect & interaction escapes — applied last so they layer over
  // everything. clipPath/maskImage carry the -webkit- prefix for Safari;
  // textStroke maps to -webkit-text-stroke (outlined/hollow glyphs).
  if (style.clipPath) {
    out.clipPath = style.clipPath;
    (out as Record<string, unknown>).WebkitClipPath = style.clipPath;
  }
  if (style.maskImage) {
    (out as Record<string, unknown>).maskImage = style.maskImage;
    out.WebkitMaskImage = style.maskImage;
  }
  if (style.textStroke) {
    (out as Record<string, unknown>).WebkitTextStroke = style.textStroke;
  }
  if (style.cursor) out.cursor = style.cursor;
  if (style.userSelect) {
    out.userSelect = style.userSelect;
    out.WebkitUserSelect = style.userSelect;
  }
  if (style.pointerEvents) out.pointerEvents = style.pointerEvents;
  if (style.scrollSnapType) out.scrollSnapType = style.scrollSnapType;
  if (style.scrollSnapAlign) out.scrollSnapAlign = style.scrollSnapAlign;
  if (style.outline) out.outline = style.outline;
  if (style.outlineOffset) out.outlineOffset = style.outlineOffset;
  if (style.accentColor) out.accentColor = style.accentColor;
  if (style.caretColor) out.caretColor = style.caretColor;
  // Entrance animation — fires on the PUBLISHED page only (the edit canvas uses
  // a separate renderer, so the inspector won't re-animate on every keystroke).
  // Maps a friendly preset to a named @keyframe in the static sheet; `both`
  // fill keeps the end state. Honours prefers-reduced-motion via the sheet.
  if (style.animationPreset && style.animationPreset !== "none") {
    const duration = style.animationDuration || "0.6s";
    const delay = style.animationDelay || "0s";
    const easing = resolveAnimationEasing(style.animationEasing);
    out.animation = `bn-anim-${style.animationPreset} ${duration} ${easing} ${delay} both`;
    if (style.animationTrigger === "scroll") {
      // CSS scroll-driven animation — progress maps to the node entering the
      // viewport. Pure CSS; unsupported browsers ignore the timeline and just
      // play it on load. The view-timeline ignores the duration above.
      const record = out as Record<string, unknown>;
      record.animationTimeline = "view()";
      record.animationRange = "entry 0% cover 35%";
    }
  }
  // Visibility — a desktop-level "hidden" removes the node everywhere (the
  // breakpoint layers inherit it). Per-breakpoint hides are handled by the
  // data-attr + media rules in builderNodeStyleAttrs / the static sheet.
  if (style.visibility === "hidden") out.display = "none";
  return out;
}

function alignSelfStyle(style: BuilderNodeStyle | undefined): CSSProperties {
  if (!style?.align) return {};
  if (style.align === "center") return { marginLeft: "auto", marginRight: "auto" };
  if (style.align === "right") return { marginLeft: "auto", marginRight: 0 };
  return { marginLeft: 0, marginRight: "auto" };
}

function hasRenderableChildren(
  node: BuilderNode,
): node is BuilderNode & { children: BuilderNode[] } {
  return "children" in node && Array.isArray(node.children) && node.children.length > 0;
}

function renderChildren(
  node: BuilderNode & { children: BuilderNode[] },
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  return node.children
    .filter((child) => shouldRenderNode(child, options.mode))
    .map((child) => renderBuilderNode(child, options));
}

function renderRepeatContainerChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode | null {
  const template = node.children.find((child) => shouldRenderNode(child, options.mode));
  if (!template) return renderChildren(node, options);
  const binding = getBuilderNodeDataBinding(node);
  const records = binding
    ? collectionRecordsForSource(binding.sourceKey, options.dataSources)
    : [];
  const items = resolveBuilderDataBindingCollection(binding, records);
  if (items.length === 0 || options.repeatDepth >= MAX_REPEAT_RENDER_DEPTH) {
    return renderBuilderNode(template, options);
  }
  return items.map((item) => {
    const namespace = `${node.id}__repeat_${item.key}`;
    const materialized = materializeRepeatTemplateIds(template, namespace);
    return renderBuilderNode(materialized, {
      ...options,
      repeatItem: item,
      repeatDepth: options.repeatDepth + 1,
    });
  });
}

function collectionRecordsForSource(
  sourceKey: string,
  dataSources: BuilderNodeRenderDataSources,
): ReadonlyArray<BuilderDataSourceRecord> {
  const custom = dataSources.collections?.[sourceKey];
  if (custom) return custom;
  switch (sourceKey) {
    case "featured_talent_profiles":
      return (dataSources.featuredTalentProfiles ?? []).map((card) => ({
        ...card,
        imageUrl: card.thumbnailUrl,
        href: profileHrefForRepeat(card),
      }));
    case "talent_locations":
      return (dataSources.talentLocations ?? []).map((location) => ({
        ...location,
        href: `/directory?location=${encodeURIComponent(location.citySlug)}`,
      }));
    case "tenant_directory_search":
      return (dataSources.directoryShortcuts ?? []).map((shortcut) => ({
        ...shortcut,
        href: `/directory?type=${encodeURIComponent(shortcut.slug)}`,
      }));
    default:
      return [];
  }
}

function profileHrefForRepeat(card: FeaturedTalentCardDTO): string {
  const code = encodeURIComponent(card.profileCode);
  return card.slugPart
    ? `/t/${code}-${encodeURIComponent(card.slugPart)}`
    : `/t/${code}`;
}

function materializeRepeatTemplateIds(node: BuilderNode, namespace: string): BuilderNode {
  const namespacedId = `${namespace}__${node.id}`;
  if (!("children" in node) || !Array.isArray(node.children)) {
    return { ...node, id: namespacedId } as BuilderNode;
  }
  const props = node.props as Record<string, unknown>;
  let nextProps: Record<string, unknown> = { ...props };
  if (node.kind === "accordion" && Array.isArray(props.defaultOpenItemIds)) {
    nextProps = {
      ...nextProps,
      defaultOpenItemIds: (props.defaultOpenItemIds as string[]).map(
        (id) => `${namespace}__${id}`,
      ),
    };
  }
  if (node.kind === "tabs" && typeof props.defaultTabId === "string") {
    nextProps = { ...nextProps, defaultTabId: `${namespace}__${props.defaultTabId}` };
  }
  return {
    ...node,
    id: namespacedId,
    props: nextProps,
    children: node.children.map((child) =>
      materializeRepeatTemplateIds(child, namespace),
    ),
  } as BuilderNode;
}

function renderDataBoundContainerChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  // Phase 3 — live component instance. When this container is a linked instance
  // and its master definition is available, render the resolved master subtree
  // (with per-instance overrides) LIVE. resolveInstanceChildren returns null when
  // the component is missing/unloaded, so we fall through to the node's own
  // stored children — a published page can never blank out.
  if (node.props.instanceOf) {
    const resolved = resolveInstanceChildren(node, options.components);
    if (resolved) {
      return resolved
        .filter((child) => shouldRenderNode(child, options.mode))
        .map((child) => renderBuilderNode(child, options));
    }
  }
  if (isBuilderDataBindingRepeater(getBuilderNodeDataBinding(node))) {
    return renderRepeatContainerChildren(node, options);
  }
  const sourceKey = node.props.dataBinding?.sourceKey;
  if (sourceKey === "tenant_directory_search") {
    return renderDirectorySearchChildren(node, options);
  }
  if (sourceKey === "featured_talent_profiles") {
    return renderFeaturedTalentChildren(node, options);
  }
  if (sourceKey === "talent_locations") {
    return renderTalentLocationChildren(node, options);
  }
  return renderChildren(node, options);
}

function renderFeaturedTalentChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  const limit = node.props.dataBinding?.maxItems ?? 4;
  const cards = (options.dataSources.featuredTalentProfiles ?? []).slice(0, limit);
  if (cards.length === 0) {
    return renderChildren(node, options);
  }

  const editableIntroChildren = node.children
    .slice(0, 2)
    .filter((child) => shouldRenderNode(child, options.mode));

  return (
    <>
      {editableIntroChildren.map((child) => renderBuilderNode(child, options))}
      <div
        className="site-builder-node--live-talent-grid"
        data-builder-live-data-grid="featured_talent_profiles"
        style={builderNodeStyleVars({
          "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
          "--bn-live-columns": node.props.columns ?? 4,
        })}
      >
        {cards.map((card, index) => (
          <FeaturedTalentCard
            key={card.id}
            card={card}
            priority={index < 2}
            publicPathPrefix={options.publicPathPrefix}
          />
        ))}
      </div>
    </>
  );
}

function renderTalentLocationChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  const limit = node.props.dataBinding?.maxItems ?? 6;
  const locations = (options.dataSources.talentLocations ?? []).slice(0, limit);
  if (locations.length === 0) return renderChildren(node, options);

  const introChildren = node.children
    .slice(0, 2)
    .filter((child) => shouldRenderNode(child, options.mode));
  const mapPlaceholder = node.children
    .slice(3)
    .filter((child) => shouldRenderNode(child, options.mode));

  return (
    <>
      {introChildren.map((child) => renderBuilderNode(child, options))}
      <div
        className="site-builder-node--live-chip-grid"
        data-builder-live-data-grid="talent_locations"
      >
        {locations.map((location) => (
          <a
            key={location.id}
            className="site-builder-node--live-chip"
            href={prefixPublicHref(
              `/directory?location=${encodeURIComponent(location.citySlug)}`,
              options.publicPathPrefix,
            )}
          >
            <strong>{location.displayName}</strong>
            <span>{location.talentCount} talents</span>
          </a>
        ))}
      </div>
      {mapPlaceholder.map((child) => renderBuilderNode(child, options))}
    </>
  );
}

function renderDirectorySearchChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  const shortcuts = (options.dataSources.directoryShortcuts ?? []).slice(0, 6);
  if (shortcuts.length === 0) return renderChildren(node, options);

  const introChildren = node.children
    .slice(0, 2)
    .filter((child) => shouldRenderNode(child, options.mode));

  return (
    <>
      {introChildren.map((child) => renderBuilderNode(child, options))}
      <form
        action={prefixPublicHref("/directory", options.publicPathPrefix)}
        className="site-builder-node--live-search-shell"
        data-builder-live-data-grid="tenant_directory_search"
      >
        <span>Search the directory by role, location, or fit</span>
        <button type="submit" className="site-builder-node site-builder-node--button">
          Search
        </button>
      </form>
      <div className="site-builder-node--live-chip-grid">
        {shortcuts.map((shortcut) => (
          <a
            key={shortcut.id}
            className="site-builder-node--live-chip"
            href={prefixPublicHref(
              `/directory?type=${encodeURIComponent(shortcut.slug)}`,
              options.publicPathPrefix,
            )}
          >
            <strong>{shortcut.name}</strong>
          </a>
        ))}
      </div>
    </>
  );
}

function shouldRenderNode(
  node: BuilderNode,
  mode: NormalizedBuilderNodeRenderOptions["mode"],
): boolean {
  if (node.kind === "section") return false;
  if (mode === "freeform" && resolveBuilderNodeRole(node.id)) return false;
  return true;
}

function containerStyle(node: Extract<BuilderNode, { kind: "container" }>): CSSProperties {
  return {
    ...builderNodeStyleVars({
    "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
    "--bn-align": node.props.align ?? "stretch",
    "--bn-columns": node.props.columns ?? 2,
    "--bn-tablet-columns": node.props.responsive?.tablet?.columns,
    "--bn-mobile-columns": node.props.responsive?.mobile?.columns,
    }),
    ...sharedNodeStyle(node.props.style),
  };
}

function splitStyle(node: Extract<BuilderNode, { kind: "split" }>): CSSProperties {
  const [left, right] = (node.props.ratio ?? "50-50").split("-").map(Number);
  return {
    ...builderNodeStyleVars({
      "--bn-split-left": `${left}fr`,
      "--bn-split-right": `${right}fr`,
      "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
    }),
    ...sharedNodeStyle(node.props.style),
  };
}

function cardStyle(node: Extract<BuilderNode, { kind: "card" }>): CSSProperties {
  return {
    ...builderNodeStyleVars({
      "--bn-gap": GAP_BY_SIZE.m,
    }),
    ...sharedNodeStyle(node.props.style),
  };
}

function ctaGroupStyle(node: Extract<BuilderNode, { kind: "cta_group" }>): CSSProperties {
  const alignMap = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch",
  } as const;
  const layout = node.props.layout ?? "row";
  const align = node.props.align ?? "center";
  // Structured justify/align come first; sharedNodeStyle is spread LAST so a free
  // justifyContent / alignItems / flexWrap escape wins over the cta_group preset
  // (matching the "free always wins" rule the container/split/card paths follow).
  const structured: CSSProperties =
    layout === "stack"
      ? { alignItems: align === "stretch" ? "stretch" : alignMap[align] }
      : {
          justifyContent: alignMap[align === "stretch" ? "center" : align],
          alignItems: "center",
        };
  return {
    ...builderNodeStyleVars({
      "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
    }),
    ...structured,
    ...sharedNodeStyle(node.props.style),
  };
}

function pricingTableStyle(
  node: Extract<BuilderNode, { kind: "pricing_table" }>,
): CSSProperties {
  return {
    ...builderNodeStyleVars({
      "--bn-pricing-columns": Math.min(Math.max(node.props.tiers.length, 2), 4),
      "--bn-gap": GAP_BY_SIZE.m,
    }),
    ...sharedNodeStyle(node.props.style),
  };
}

function resolveNodeStringProp(
  node: BuilderNode,
  prop: BuilderFieldBindingProp,
  fallbackValue: string,
  repeatItem: BuilderRepeatItem | null,
): { value: string; bound: boolean } {
  const fieldBindings = (node.props as { fieldBindings?: Record<string, string> })
    .fieldBindings;
  return resolveBuilderFieldBindingValue(
    fallbackValue,
    fieldBindings?.[prop],
    repeatItem,
  );
}

function renderButtonHref(
  href: { value: string; bound: boolean },
  publicPathPrefix: string,
): string | undefined {
  if (!href.value.trim()) return undefined;
  if (href.bound && !isSafeRichTextHref(href.value)) return undefined;
  return prefixPublicHref(href.value, publicPathPrefix);
}

function renderImageSrc(src: { value: string; bound: boolean }): string | undefined {
  if (!src.value.trim()) return undefined;
  if (src.bound && !isSafeBuilderBoundImageSrc(src.value)) return undefined;
  return src.value;
}

function buttonStateAttrs(node: Extract<BuilderNode, { kind: "button" }>) {
  return {
    "data-builder-button-tone": node.props.tone ?? "primary",
    "data-builder-button-hover-tone": node.props.stateStyles?.hover?.tone,
    "data-builder-button-focus-tone": node.props.stateStyles?.focus?.tone,
    "data-builder-button-active-tone": node.props.stateStyles?.active?.tone,
    "data-builder-button-disabled-tone": node.props.stateStyles?.disabled?.tone,
  };
}

function renderBuilderNode(
  node: BuilderNode,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  switch (node.kind) {
    case "section":
      return null;
    case "container":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          data-builder-layout={node.props.layout}
          data-builder-tablet-layout={node.props.responsive?.tablet?.layout}
          data-builder-mobile-layout={node.props.responsive?.mobile?.layout}
          data-builder-data-source={node.props.dataBinding?.sourceKey}
          data-builder-data-mode={node.props.dataBinding?.mode}
          data-builder-data-max-items={node.props.dataBinding?.maxItems}
          className="site-builder-node site-builder-node--container"
          style={containerStyle(node)}
        >
          {renderDataBoundContainerChildren(node, options)}
        </div>
      );
    case "split":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          data-builder-collapse-mobile={node.props.collapseOnMobile === false ? "false" : "true"}
          className="site-builder-node site-builder-node--split"
          style={splitStyle(node)}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "accordion":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--accordion"
          style={{
            ...CONTAINER_STYLE,
            display: "grid",
            gap: GAP_BY_SIZE.m,
            ...sharedNodeStyle(node.props.style),
          }}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "accordion_item":
      return (
        <details
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--accordion-item"
          open
          style={{
            border: "1px solid rgba(18, 18, 18, 0.14)",
            borderRadius: "0",
            padding: "1rem",
            ...sharedNodeStyle(node.props.style),
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            {node.props.title}
          </summary>
          <div style={{ display: "grid", gap: GAP_BY_SIZE.s, paddingTop: "0.75rem" }}>
            {renderChildren(node, options)}
          </div>
        </details>
      );
    case "tabs": {
      const panels = node.children.filter((child) => child.kind === "tab_panel");
      const activePanel =
        panels.find((panel) => panel.id === node.props.defaultTabId) ?? panels[0] ?? null;
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--tabs"
          style={{
            ...CONTAINER_STYLE,
            display: "grid",
            gap: GAP_BY_SIZE.m,
            ...sharedNodeStyle(node.props.style),
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {panels.map((panel) => (
              <span
                key={`${panel.id}:tab`}
                data-builder-node-id={panel.id}
                data-builder-node-kind={panel.kind}
                style={{
                  border: "1px solid rgba(18, 18, 18, 0.14)",
                  borderRadius: "0",
                  padding: "0.45rem 0.75rem",
                  fontSize: "0.875rem",
                  fontWeight: panel.id === activePanel?.id ? 700 : 500,
                }}
              >
                {panel.props.title}
              </span>
            ))}
          </div>
          {activePanel ? renderBuilderNode(activePanel, options) : null}
        </div>
      );
    }
    case "tab_panel":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--tab-panel"
          style={{ display: "grid", gap: GAP_BY_SIZE.s, ...sharedNodeStyle(node.props.style) }}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "carousel": {
      const carouselItems = node.children
        .filter((child) => shouldRenderNode(child, options.mode))
        .map((child, index) => (
          <div
            key={`${node.id}:slide:${child.id}`}
            id={`${node.id}-slide-${index + 1}`}
            className="site-builder-node--carousel-slide"
          >
            {renderBuilderNode(child, options)}
          </div>
        ));
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          data-builder-carousel-loop={node.props.loop ? "true" : undefined}
          data-builder-carousel-autoplay-ms={node.props.autoplayMs}
          className="site-builder-node site-builder-node--carousel"
          style={{
            ...builderNodeStyleVars({
              "--bn-slide-width": `${100 / (node.props.slidesPerView ?? 2)}%`,
              "--bn-tablet-slides": Math.min(node.props.slidesPerView ?? 2, 2),
            }),
            ...sharedNodeStyle(node.props.style),
          }}
        >
          <BuilderNodeCarouselTrack
            nodeId={node.id}
            showArrows={node.props.showArrows}
            showDots={node.props.showDots}
          >
            {carouselItems}
          </BuilderNodeCarouselTrack>
        </div>
      );
    }
    case "masonry":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--masonry"
          style={{
            ...builderNodeStyleVars({
              "--bn-columns": node.props.columns ?? 3,
              "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
            }),
            ...sharedNodeStyle(node.props.style),
          }}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "card":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-card-variant={node.props.variant ?? "elevated"}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--card"
          style={cardStyle(node)}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "cta_group":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-cta-layout={node.props.layout ?? "row"}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--cta-group"
          style={ctaGroupStyle(node)}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "heading": {
      const Tag = `h${node.props.level}` as "h1" | "h2" | "h3" | "h4";
      const text = resolveNodeStringProp(
        node,
        "text",
        node.props.text,
        options.repeatItem,
      ).value;
      return (
        <Tag
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--heading"
          style={{
            margin: 0,
            lineHeight: 1.05,
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        >
          {renderInlineRich(text)}
        </Tag>
      );
    }
    case "paragraph": {
      const text = resolveNodeStringProp(
        node,
        "text",
        node.props.text,
        options.repeatItem,
      ).value;
      return (
        <p
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--paragraph"
          style={{
            margin: 0,
            lineHeight: 1.65,
            color: "rgba(18, 18, 18, 0.72)",
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        >
          {renderInlineRich(text)}
        </p>
      );
    }
    case "button": {
      const label = resolveNodeStringProp(
        node,
        "label",
        node.props.label,
        options.repeatItem,
      ).value;
      const href = renderButtonHref(
        resolveNodeStringProp(node, "href", node.props.href, options.repeatItem),
        options.publicPathPrefix,
      );
      return (
        <a
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...buttonStateAttrs(node)}
          {...builderNodeStyleAttrs(node.props.style)}
          className={`site-builder-node site-builder-node--button site-builder-node--button-${node.props.tone ?? "primary"}`}
          href={href}
          style={{
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        >
          {label}
        </a>
      );
    }
    case "image": {
      const src = renderImageSrc(
        resolveNodeStringProp(node, "src", node.props.src, options.repeatItem),
      );
      const alt = resolveNodeStringProp(
        node,
        "alt",
        node.props.alt ?? "",
        options.repeatItem,
      ).value;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--image"
          src={src}
          alt={alt}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            objectFit: node.props.style?.objectFit ?? "cover",
            objectPosition: node.props.style?.objectPosition ?? "center",
            aspectRatio:
              node.props.style?.aspectRatioFree ??
              NODE_ASPECT_RATIO[node.props.style?.aspectRatio ?? "auto"],
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        />
      );
    }
    case "video":
      return (
        <video
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--video"
          src={node.props.src}
          poster={node.props.poster}
          autoPlay={node.props.autoplay ?? false}
          muted={node.props.muted ?? node.props.autoplay ?? false}
          loop={node.props.loop ?? false}
          controls={node.props.controls ?? true}
          playsInline
          preload="metadata"
          style={{
            objectFit: node.props.style?.objectFit ?? "cover",
            objectPosition: node.props.style?.objectPosition ?? "center",
            aspectRatio:
              node.props.style?.aspectRatioFree ??
              NODE_ASPECT_RATIO[node.props.style?.aspectRatio ?? "auto"],
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        />
      );
    case "embed":
      return (
        <iframe
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-embed-provider={node.props.provider ?? "url"}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--embed"
          src={node.props.src}
          title={node.props.title ?? "Embedded content"}
          loading="lazy"
          sandbox="allow-forms allow-popups allow-presentation allow-scripts"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen={node.props.allowFullScreen ?? true}
          style={{
            aspectRatio:
              node.props.style?.aspectRatioFree ??
              NODE_ASPECT_RATIO[node.props.style?.aspectRatio ?? "16:9"],
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        />
      );
    case "icon": {
      const icon = getBuilderIconDefinition(node.props.icon);
      const decorative = node.props.decorative ?? !node.props.label;
      return (
        <span
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-icon={icon.name}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--icon"
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : node.props.label || icon.name}
          aria-hidden={decorative ? true : undefined}
          style={{
            fontSize: ICON_SIZE[node.props.size ?? "md"],
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {icon.paths.map((path) => (
              <path key={path} d={path} />
            ))}
            {icon.circles?.map((circle) => (
              <circle
                key={`${circle.cx}-${circle.cy}-${circle.r}`}
                cx={circle.cx}
                cy={circle.cy}
                r={circle.r}
              />
            ))}
            {icon.polygons?.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </svg>
        </span>
      );
    }
    case "pricing_table":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--pricing-table"
          style={pricingTableStyle(node)}
        >
          {node.props.tiers.map((tier) => (
            <article
              key={tier.id}
              className="site-builder-node--pricing-tier"
              data-builder-pricing-highlighted={tier.highlighted ? "true" : undefined}
            >
              <header className="site-builder-node--pricing-tier-header">
                <h3 className="site-builder-node--pricing-tier-title">
                  {renderInlineRich(tier.name)}
                </h3>
                {tier.description ? (
                  <p className="site-builder-node--pricing-tier-description">
                    {renderInlineRich(tier.description)}
                  </p>
                ) : null}
              </header>
              <div className="site-builder-node--pricing-price">
                <strong>{tier.price}</strong>
                {tier.period ? (
                  <span className="site-builder-node--pricing-period">
                    / {tier.period}
                  </span>
                ) : null}
              </div>
              {(tier.features?.length ?? 0) > 0 ? (
                <ul className="site-builder-node--pricing-features">
                  {(tier.features ?? []).map((feature) => {
                    const included = feature.included !== false;
                    return (
                      <li
                        key={feature.label}
                        className="site-builder-node--pricing-feature"
                        data-builder-feature-included={included ? "true" : "false"}
                      >
                        <span
                          className="site-builder-node--pricing-feature-mark"
                          aria-hidden="true"
                        >
                          {included ? "✓" : "×"}
                        </span>
                        <span>{renderInlineRich(feature.label)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {tier.ctaLabel && tier.ctaHref ? (
                <a
                  className="site-builder-node--pricing-cta"
                  href={prefixPublicHref(tier.ctaHref, options.publicPathPrefix)}
                >
                  {renderInlineRich(tier.ctaLabel)}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      );
    case "rich_text": {
      const text = resolveNodeStringProp(
        node,
        "text",
        node.props.text,
        options.repeatItem,
      ).value;
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--rich-text"
          style={{
            margin: 0,
            lineHeight: 1.65,
            color: "rgba(18, 18, 18, 0.72)",
            whiteSpace: "pre-wrap",
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        >
          {renderInlineRich(sanitizeBuilderRichText(text))}
        </div>
      );
    }
    case "divider":
      return (
        <hr
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-divider-tone={node.props.tone ?? "default"}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--divider"
          style={{
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        />
      );
    case "spacer":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--spacer"
          aria-hidden="true"
          style={{ height: SPACER_BY_SIZE[node.props.size], ...sharedNodeStyle(node.props.style) }}
        />
      );
    default:
      return null;
  }
}

export function renderBuilderNodes(
  nodes: ReadonlyArray<BuilderNode>,
  options: BuilderNodeRenderOptions = {},
): ReactNode {
  const normalizedOptions: NormalizedBuilderNodeRenderOptions = {
    publicPathPrefix: options.publicPathPrefix ?? "",
    mode: options.mode ?? "freeform",
    dataSources: options.dataSources ?? {},
    includeRendererStyles: options.includeRendererStyles ?? true,
    includeFontLinks: options.includeFontLinks ?? true,
    components: options.components ?? {},
    repeatItem: null,
    repeatDepth: 0,
  };
  const renderedNodes = nodes
    .filter((node) => shouldRenderNode(node, normalizedOptions.mode))
    .map((node) => renderBuilderNode(node, normalizedOptions));
  if (renderedNodes.length === 0) return null;
  const fontLinks = normalizedOptions.includeFontLinks ? (
    <BuilderNodeFontLinks
      key="site-builder-node-fonts"
      nodes={nodes}
      components={normalizedOptions.components}
    />
  ) : null;
  const headNodes = [
    fontLinks,
    normalizedOptions.includeRendererStyles ? (
      <BuilderNodeRendererStyles key="site-builder-node-styles" />
    ) : null,
  ].filter(Boolean);
  if (headNodes.length === 0) return renderedNodes;
  return [...headNodes, ...renderedNodes];
}

export function BuilderNodeFontLinks({
  nodes,
  components,
}: {
  nodes: ReadonlyArray<BuilderNode>;
  components?: ComponentDefinitions;
}): ReactNode {
  const href = buildGoogleFontsHrefForFamilies(
    collectBuilderNodeFontFamilies(nodes, components),
  );
  if (!href) return null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={href} data-builder-node-fonts="" />
    </>
  );
}

export function BuilderNodeRendererStyles(): ReactNode {
  return (
    <style
      data-builder-node-renderer-styles=""
      dangerouslySetInnerHTML={{ __html: BUILDER_NODE_RENDERER_CSS }}
    />
  );
}

export function hasRenderableBuilderNodes(
  nodes: ReadonlyArray<BuilderNode>,
  options: Pick<BuilderNodeRenderOptions, "mode"> = {},
): boolean {
  const mode = options.mode ?? "freeform";
  return nodes.some((node) => {
    if (!shouldRenderNode(node, mode)) return false;
    if (hasRenderableChildren(node)) {
      return true;
    }
    return node.kind !== "section";
  });
}
