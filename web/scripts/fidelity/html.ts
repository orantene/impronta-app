import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "../../src/lib/site-admin/builder-node/render";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";

export interface FidelityDesign {
  id: string;
  title: string;
  tree: BuilderNode[];
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

export function renderFidelityMarkup(tree: ReadonlyArray<BuilderNode>): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(tree, {
        mode: "freeform",
      }),
    ),
  );
}

export function buildFidelityHtml(design: FidelityDesign): string {
  const markup = renderFidelityMarkup(design.tree);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(design.title)}</title>
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
