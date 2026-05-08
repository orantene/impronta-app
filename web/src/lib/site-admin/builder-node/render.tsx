import type { CSSProperties, ReactNode } from "react";

import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { FeaturedTalentCard } from "@/lib/site-admin/sections/featured_talent/FeaturedTalentCard";
import type { FeaturedTalentCardDTO } from "@/lib/site-admin/sections/featured_talent/fetch";

import { BuilderNodeCarouselTrack } from "./carousel";
import { resolveBuilderNodeRole } from "./role-bindings";
import type { BuilderNode, BuilderNodeStyle, BuilderNodeStyleValue } from "./types";

export interface BuilderNodeRenderDataSources {
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
}

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

const CONTAINER_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "1120px",
  margin: "0 auto",
};

const BUILDER_NODE_RENDERER_CSS = `
.site-builder-node{box-sizing:border-box}
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
.site-builder-node--masonry{width:100%;max-width:1120px;margin:0 auto;column-count:var(--bn-columns,3);column-gap:var(--bn-gap,1.25rem)}
.site-builder-node--masonry>*{break-inside:avoid;margin-bottom:var(--bn-gap,1.25rem)}
.site-builder-node--live-talent-grid{display:grid;grid-template-columns:repeat(var(--bn-live-columns,4),minmax(0,1fr));gap:var(--bn-gap,1.25rem);width:100%}
.site-builder-node--live-chip-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:0.75rem;width:100%}
.site-builder-node--live-chip{display:inline-flex;align-items:center;gap:0.5rem;border:1px solid rgba(18,18,18,0.16);background:#fff;color:#111;padding:0.75rem 1rem;text-decoration:none}
.site-builder-node--live-chip strong{font-weight:700}
.site-builder-node--live-chip span{color:rgba(18,18,18,0.58);font-size:0.82rem}
.site-builder-node--live-search-shell{display:flex;width:min(100%,680px);align-items:center;justify-content:space-between;gap:1rem;border:1px solid rgba(18,18,18,0.16);background:#fff;padding:0.75rem 0.75rem 0.75rem 1rem}
.site-builder-node--live-search-shell span{color:rgba(18,18,18,0.58)}
.site-builder-node--button{display:inline-flex;width:fit-content;align-items:center;justify-content:center;border:1px solid rgba(18,18,18,0.18);border-radius:999px;padding:0.8rem 1.2rem;font-weight:700;text-decoration:none;transition:background-color .16s ease,color .16s ease,border-color .16s ease,transform .16s ease}
.site-builder-node--button[data-builder-button-tone="primary"]{background:#111;color:#fff}
.site-builder-node--button[data-builder-button-tone="secondary"]{background:transparent;color:#111}
.site-builder-node--button[data-builder-button-hover-tone="primary"]:hover,.site-builder-node--button[data-builder-button-focus-tone="primary"]:focus-visible,.site-builder-node--button[data-builder-button-active-tone="primary"]:active{background:#111!important;color:#fff!important;border-color:#111!important}
.site-builder-node--button[data-builder-button-hover-tone="secondary"]:hover,.site-builder-node--button[data-builder-button-focus-tone="secondary"]:focus-visible,.site-builder-node--button[data-builder-button-active-tone="secondary"]:active{background:transparent!important;color:#111!important;border-color:rgba(18,18,18,0.28)!important}
.site-builder-node--button[data-builder-button-disabled-tone="secondary"][aria-disabled="true"]{background:transparent;color:rgba(18,18,18,0.42);border-color:rgba(18,18,18,0.16);pointer-events:none}
.site-builder-node--button[data-builder-button-disabled-tone="primary"][aria-disabled="true"]{background:rgba(18,18,18,0.35);color:#fff;border-color:rgba(18,18,18,0.08);pointer-events:none}
.site-builder-node[data-builder-style-size="sm"]{font-size:clamp(0.9rem,1vw,1rem)}
.site-builder-node[data-builder-style-size="md"]{font-size:clamp(1rem,1.3vw,1.25rem)}
.site-builder-node[data-builder-style-size="lg"]{font-size:clamp(1.35rem,2vw,2.25rem)}
.site-builder-node[data-builder-style-size="xl"]{font-size:clamp(2rem,4vw,4.5rem)}
.site-builder-node--paragraph[data-builder-style-size="lg"]{font-size:clamp(1.1rem,1.45vw,1.45rem)}
.site-builder-node--paragraph[data-builder-style-size="xl"]{font-size:clamp(1.25rem,1.8vw,1.8rem)}
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
  .site-builder-node[data-builder-style-tablet-ratio]{aspect-ratio:var(--bn-tablet-ratio)!important}
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
  .site-builder-node[data-builder-style-mobile-ratio]{aspect-ratio:var(--bn-mobile-ratio)!important}
  .site-builder-node--container{align-items:stretch}
  .site-builder-node--container[data-builder-mobile-layout="stack"],.site-builder-node--container:not([data-builder-mobile-layout]){display:flex;flex-direction:column}
  .site-builder-node--container[data-builder-mobile-layout="row"]{display:flex;flex-direction:row;flex-wrap:wrap}
  .site-builder-node--container[data-builder-mobile-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-mobile-columns,1),minmax(0,1fr))}
  .site-builder-node--live-talent-grid{grid-template-columns:1fr}
  .site-builder-node--live-search-shell{align-items:stretch;flex-direction:column}
  .site-builder-node--split[data-builder-collapse-mobile="true"]{grid-template-columns:1fr}
  .site-builder-node--carousel-slide{flex-basis:86%}
  .site-builder-node--masonry{column-count:var(--bn-mobile-columns,1)}
}
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

function builderNodeStyleAttrs(style: BuilderNodeStyle | undefined) {
  const tablet = style?.responsive?.tablet;
  const mobile = style?.responsive?.mobile;
  return {
    "data-builder-style-align": style?.align,
    "data-builder-style-size": style?.size,
    "data-builder-style-tone": style?.tone,
    "data-builder-style-width": style?.maxWidth,
    "data-builder-style-background": style?.background,
    "data-builder-style-radius": style?.radius,
    "data-builder-style-fit": style?.objectFit,
    "data-builder-style-ratio": style?.aspectRatio,
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
    "data-builder-style-tablet-ratio": tablet?.aspectRatio,
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
    "data-builder-style-mobile-ratio": mobile?.aspectRatio,
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

function responsiveStyleVars(
  style: BuilderNodeStyle | undefined,
): CSSProperties {
  return builderNodeStyleVars({
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
    "--bn-tablet-ratio": style?.responsive?.tablet?.aspectRatio
      ? NODE_ASPECT_RATIO[style.responsive.tablet.aspectRatio]
      : undefined,
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
    "--bn-mobile-ratio": style?.responsive?.mobile?.aspectRatio
      ? NODE_ASPECT_RATIO[style.responsive.mobile.aspectRatio]
      : undefined,
  });
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
    out.background = "#111";
    out.color = "#fff";
  }
  if (style.tone === "muted") out.color = "rgba(18, 18, 18, 0.62)";
  if (style.tone === "strong") out.color = "#111";
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
  options: Required<BuilderNodeRenderOptions>,
): ReactNode {
  return node.children
    .filter((child) => shouldRenderNode(child, options.mode))
    .map((child) => renderBuilderNode(child, options));
}

function renderDataBoundContainerChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: Required<BuilderNodeRenderOptions>,
): ReactNode {
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
  options: Required<BuilderNodeRenderOptions>,
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
  options: Required<BuilderNodeRenderOptions>,
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
  options: Required<BuilderNodeRenderOptions>,
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
  mode: Required<BuilderNodeRenderOptions>["mode"],
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
  options: Required<BuilderNodeRenderOptions>,
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
    case "heading": {
      const Tag = `h${node.props.level}` as "h1" | "h2" | "h3" | "h4";
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
          {node.props.text}
        </Tag>
      );
    }
    case "paragraph":
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
          {node.props.text}
        </p>
      );
    case "button":
      return (
        <a
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...buttonStateAttrs(node)}
          {...builderNodeStyleAttrs(node.props.style)}
          className={`site-builder-node site-builder-node--button site-builder-node--button-${node.props.tone ?? "primary"}`}
          href={prefixPublicHref(node.props.href, options.publicPathPrefix)}
          style={{
            ...sharedNodeStyle(node.props.style),
            ...alignSelfStyle(node.props.style),
          }}
        >
          {node.props.label}
        </a>
      );
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--image"
          src={node.props.src}
          alt={node.props.alt ?? ""}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            objectFit: node.props.style?.objectFit ?? "cover",
            aspectRatio: NODE_ASPECT_RATIO[node.props.style?.aspectRatio ?? "auto"],
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
  const normalizedOptions: Required<BuilderNodeRenderOptions> = {
    publicPathPrefix: options.publicPathPrefix ?? "",
    mode: options.mode ?? "freeform",
    dataSources: options.dataSources ?? {},
  };
  const renderedNodes = nodes
    .filter((node) => shouldRenderNode(node, normalizedOptions.mode))
    .map((node) => renderBuilderNode(node, normalizedOptions));
  if (renderedNodes.length === 0) return null;
  return [
    <style
      key="site-builder-node-styles"
      data-builder-node-renderer-styles=""
      dangerouslySetInnerHTML={{ __html: BUILDER_NODE_RENDERER_CSS }}
    />,
    ...renderedNodes,
  ];
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
