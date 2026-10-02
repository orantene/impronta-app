/**
 * `stats` variant `spec` (Gridline `.gl-spec`): typed spec cells, never numbers
 * the product computes.
 *
 * A bordered grid of label-over-value cells. Phone: 2 columns (2x2 for four
 * cells). Desktop (the block's own container >= 600px): one column per cell.
 * Every cell is authored text; a cell missing its label or its value is
 * dropped, and a block with no complete cell renders nothing, so a talent who
 * typed nothing makes no claim. No count-up and no script: the value is plain
 * text. Token colours only.
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
import type { BuilderStatsNode } from "./types";

export const STATS_SPEC_CELLS_MAX = 6;

const MONO = "var(--token-typography-label-font-family,var(--token-shell-header-nav-font,ui-monospace,monospace))";
const RULE = "var(--token-shape-rule-width,1.5px) solid var(--token-color-ink)";

export const STATS_SPEC_CSS = `
.site-builder-node--stats-spec{container:sbstatsspec/inline-size;width:100%;min-width:0;box-sizing:border-box;color:var(--token-color-ink)}
.site-builder-node--stats-spec[data-spec-empty="1"]{display:none!important}
.sb-sspec-grid{margin:0;display:grid;grid-template-columns:1fr 1fr;border:${RULE};border-radius:var(--site-radius-md,10px);overflow:hidden;background:var(--token-color-surface-raised,var(--token-color-background))}
.sb-sspec-cell{display:flex;flex-direction:column;min-width:0;padding:11px 12px;border-right:${RULE};border-bottom:${RULE}}
.sb-sspec-cell:nth-child(2n){border-right:0}
.sb-sspec-cell:nth-last-child(-n+2){border-bottom:0}
.sb-sspec-grid[data-odd="1"] .sb-sspec-cell:last-child{grid-column:1/-1;border-right:0}
.sb-sspec-label{order:-1;margin:0;font:500 10.5px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-sspec-value{margin:4px 0 0;font-family:var(--site-heading-font,inherit);font-weight:800;font-size:17px;line-height:1.1;font-stretch:110%;overflow-wrap:anywhere}
@container sbstatsspec (min-width:600px){
  .sb-sspec-grid{grid-template-columns:repeat(var(--sb-sspec-cols,4),minmax(0,1fr))}
  .sb-sspec-cell,.sb-sspec-cell:nth-child(2n){border-bottom:0;border-right:${RULE}}
  .sb-sspec-cell:last-child,.sb-sspec-grid[data-odd="1"] .sb-sspec-cell:last-child{border-right:0;grid-column:auto}
  .sb-sspec-value{font-size:20px}
}
`;

export function statsSpecCells(node: BuilderStatsNode): Array<{ label: string; value: string }> {
  return (node.props.items ?? [])
    .map((i) => ({
      label: (i.label ?? "").trim(),
      value: `${i.prefix ?? ""}${(i.value ?? "").trim()}${i.suffix ?? ""}`.trim(),
    }))
    .filter((c) => c.label && c.value)
    .slice(0, STATS_SPEC_CELLS_MAX);
}

export function renderStatsSpecBlock(args: { node: BuilderStatsNode; styleAttr?: CSSProperties }): ReactNode {
  const { node, styleAttr } = args;
  const cells = statsSpecCells(node);
  const empty = cells.length === 0;
  return (
    <section
      className="site-builder-node site-builder-node--stats site-builder-node--stats-spec"
      data-builder-node-id={node.id}
      data-builder-node-kind="stats"
      data-bn-stats-variant="spec"
      data-spec-empty={empty ? "1" : "0"}
      hidden={empty || undefined}
      aria-hidden={empty || undefined}
      style={{ ...styleAttr, ["--sb-sspec-cols" as string]: String(Math.max(cells.length, 1)) }}
      {...anchorIdAttrs(node)}
    >
      {empty ? null : (
        <>
          <style>{STATS_SPEC_CSS}</style>
          <dl className="sb-sspec-grid" data-odd={cells.length % 2 === 1 ? "1" : "0"}>
            {cells.map((c, i) => (
              <div className="sb-sspec-cell" key={`${i}:${c.label}`}>
                <dt className="sb-sspec-label">{c.label}</dt>
                <dd className="sb-sspec-value">{c.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
