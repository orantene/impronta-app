import type { CSSProperties, ReactNode } from "react";

import { prefixPublicHref } from "@/lib/saas/public-hrefs";

import { BuilderNodeCarouselTrack } from "./carousel";
import { resolveBuilderNodeRole } from "./role-bindings";
import type { BuilderNode } from "./types";

export interface BuilderNodeRenderOptions {
  publicPathPrefix?: string;
  mode?: "all" | "freeform";
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
@media (max-width:900px){
  .site-builder-node--container[data-builder-tablet-layout="stack"]{display:flex;flex-direction:column}
  .site-builder-node--container[data-builder-tablet-layout="row"]{display:flex;flex-direction:row;flex-wrap:wrap}
  .site-builder-node--container[data-builder-tablet-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-tablet-columns,var(--bn-columns,2)),minmax(0,1fr))}
  .site-builder-node--carousel-slide{flex-basis:calc(100% / var(--bn-tablet-slides,2))}
  .site-builder-node--masonry{column-count:var(--bn-tablet-columns,2)}
}
@media (max-width:640px){
  .site-builder-node--container{align-items:stretch}
  .site-builder-node--container[data-builder-mobile-layout="stack"],.site-builder-node--container:not([data-builder-mobile-layout]){display:flex;flex-direction:column}
  .site-builder-node--container[data-builder-mobile-layout="row"]{display:flex;flex-direction:row;flex-wrap:wrap}
  .site-builder-node--container[data-builder-mobile-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-mobile-columns,1),minmax(0,1fr))}
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

function shouldRenderNode(
  node: BuilderNode,
  mode: Required<BuilderNodeRenderOptions>["mode"],
): boolean {
  if (node.kind === "section") return false;
  if (mode === "freeform" && resolveBuilderNodeRole(node.id)) return false;
  return true;
}

function containerStyle(node: Extract<BuilderNode, { kind: "container" }>): CSSProperties {
  return builderNodeStyleVars({
    "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
    "--bn-align": node.props.align ?? "stretch",
    "--bn-columns": node.props.columns ?? 2,
    "--bn-tablet-columns": node.props.responsive?.tablet?.columns,
    "--bn-mobile-columns": node.props.responsive?.mobile?.columns,
  });
}

function splitStyle(node: Extract<BuilderNode, { kind: "split" }>): CSSProperties {
  const [left, right] = (node.props.ratio ?? "50-50").split("-").map(Number);
  return builderNodeStyleVars({
    "--bn-split-left": `${left}fr`,
    "--bn-split-right": `${right}fr`,
    "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
  });
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
          data-builder-layout={node.props.layout}
          data-builder-tablet-layout={node.props.responsive?.tablet?.layout}
          data-builder-mobile-layout={node.props.responsive?.mobile?.layout}
          className="site-builder-node site-builder-node--container"
          style={containerStyle(node)}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "split":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
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
          className="site-builder-node site-builder-node--accordion"
          style={{ ...CONTAINER_STYLE, display: "grid", gap: GAP_BY_SIZE.m }}
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
          className="site-builder-node site-builder-node--accordion-item"
          open
          style={{
            border: "1px solid rgba(18, 18, 18, 0.14)",
            borderRadius: "8px",
            padding: "1rem",
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
          className="site-builder-node site-builder-node--tabs"
          style={{ ...CONTAINER_STYLE, display: "grid", gap: GAP_BY_SIZE.m }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {panels.map((panel) => (
              <span
                key={`${panel.id}:tab`}
                data-builder-node-id={panel.id}
                data-builder-node-kind={panel.kind}
                style={{
                  border: "1px solid rgba(18, 18, 18, 0.14)",
                  borderRadius: "999px",
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
          className="site-builder-node site-builder-node--tab-panel"
          style={{ display: "grid", gap: GAP_BY_SIZE.s }}
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
          data-builder-carousel-loop={node.props.loop ? "true" : undefined}
          data-builder-carousel-autoplay-ms={node.props.autoplayMs}
          className="site-builder-node site-builder-node--carousel"
          style={builderNodeStyleVars({
            "--bn-slide-width": `${100 / (node.props.slidesPerView ?? 2)}%`,
            "--bn-tablet-slides": Math.min(node.props.slidesPerView ?? 2, 2),
          })}
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
          className="site-builder-node site-builder-node--masonry"
          style={builderNodeStyleVars({
            "--bn-columns": node.props.columns ?? 3,
            "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
          })}
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
          className="site-builder-node site-builder-node--heading"
          style={{ margin: 0, lineHeight: 1.05 }}
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
          className="site-builder-node site-builder-node--paragraph"
          style={{ margin: 0, lineHeight: 1.65, color: "rgba(18, 18, 18, 0.72)" }}
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
          className={`site-builder-node site-builder-node--button site-builder-node--button-${node.props.tone ?? "primary"}`}
          href={prefixPublicHref(node.props.href, options.publicPathPrefix)}
          style={{
            display: "inline-flex",
            width: "fit-content",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(18, 18, 18, 0.18)",
            borderRadius: "999px",
            padding: "0.8rem 1.2rem",
            background: node.props.tone === "secondary" ? "transparent" : "#111111",
            color: node.props.tone === "secondary" ? "#111111" : "#ffffff",
            fontWeight: 700,
            textDecoration: "none",
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
          className="site-builder-node site-builder-node--image"
          src={node.props.src}
          alt={node.props.alt ?? ""}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            borderRadius: "8px",
            objectFit: "cover",
          }}
        />
      );
    case "spacer":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          className="site-builder-node site-builder-node--spacer"
          aria-hidden="true"
          style={{ height: SPACER_BY_SIZE[node.props.size] }}
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
