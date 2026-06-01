import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  renderBuilderNodes,
  type BuilderNodeRenderDataSources,
} from "../../src/lib/site-admin/builder-node/render";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";
import { planFidelityFonts, type PlanFidelityFontsOptions } from "./fonts-bridge";

export { planFidelityFonts, type FidelityFontPlan } from "./fonts-bridge";
export type { BuilderNodeRenderDataSources } from "../../src/lib/site-admin/builder-node/render";

export interface FidelityDesign {
  id: string;
  title: string;
  tree: BuilderNode[];
  /**
   * Inline data sources for the renderer. The fidelity harness has no backend,
   * so any repeater (`container` with `dataBinding.repeat`) is driven by a
   * static collection supplied here under `collections[sourceKey]`. This is the
   * mechanism that lets P3 repeaters render N real cards deterministically
   * (real photos + field bindings) instead of falling back to a single template.
   */
  dataSources?: BuilderNodeRenderDataSources;
}

export interface FidelityBreakpoint {
  name: "desktop" | "tablet" | "mobile";
  width: number;
  height: number;
}

export const FIDELITY_BREAKPOINTS: readonly FidelityBreakpoint[] = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

export function renderFidelityMarkup(
  tree: ReadonlyArray<BuilderNode>,
  dataSources?: BuilderNodeRenderDataSources,
): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(tree, {
        mode: "freeform",
        dataSources,
      }),
    ),
  );
}

export function buildFidelityHtml(
  design: FidelityDesign,
  options: PlanFidelityFontsOptions = {},
): string {
  const markup = renderFidelityMarkup(design.tree, design.dataSources);
  // Font bridge: inject Google links for CDN faces + self-hosted @font-face for
  // bundled faces so declared registry families render with their real glyphs
  // instead of silently falling back to the system serif/sans.
  const fontPlan = planFidelityFonts(design.tree, options);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(design.title)}</title>
    ${fontPlan.headHtml}
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      html, body { min-height: 100%; margin: 0; }
      body {
        background: #f6f2ea;
        color: #161412;
        font-family: Arial, Helvetica, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
      a { color: inherit; }
      img { display: block; max-width: 100%; }
      button, input, textarea, select { font: inherit; }
    </style>
  </head>
  <body>
    ${markup}
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
