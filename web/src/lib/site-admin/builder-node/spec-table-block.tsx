/**
 * Spec table (Gridline `.gl-st`): authored label/value rows.
 *
 * Phone: a bordered two-column table, mono caps labels in a 38% column.
 * Desktop (the block's own container >= 900px, the mockup's `@container`
 * tier): the same rows become a strip, one column per row, label over value.
 * Hidden when no row has both a label and a value; nothing is invented.
 * Token colours only.
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
import { SPEC_TABLE_ROWS_MAX } from "./spec-table-defaults";
import type { BuilderSpecTableNode } from "./types";

export const SPEC_TABLE_CSS = `
.sb-spec{container:sbspec/inline-size;color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box}
.sb-spec[data-spec-empty="1"]{display:none!important}
.sb-spec-header{margin-bottom:.75rem}
.sb-spec-eyebrow{margin:0 0 .35rem;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-spec-title{margin:0;font-size:clamp(1.35rem,2.5vw,1.85rem);font-weight:600;letter-spacing:-.02em;line-height:1.15}
.sb-spec-table{width:100%;border-collapse:collapse;font-size:14px;background:var(--token-color-surface-raised,var(--token-color-background));border:1.5px solid var(--token-color-ink);border-radius:var(--site-radius-md,8px);overflow:hidden}
.sb-spec-table th,.sb-spec-table td{padding:11px 12px;border-bottom:1px solid var(--token-color-line);text-align:left;vertical-align:top}
.sb-spec-table th{font:500 11px var(--site-mono-font,ui-monospace,monospace);letter-spacing:.05em;text-transform:uppercase;color:var(--token-color-muted);width:38%}
.sb-spec-table td{font-weight:600}
.sb-spec-table tr:last-child th,.sb-spec-table tr:last-child td{border-bottom:0}
@container sbspec (min-width:900px){
  .sb-spec-table{display:grid;grid-template-columns:repeat(var(--sb-spec-cols,5),1fr)}
  .sb-spec-table tbody{display:contents}
  .sb-spec-table tr{display:grid;border-right:1px solid var(--token-color-line)}
  .sb-spec-table tr:last-child{border-right:0}
  .sb-spec-table th,.sb-spec-table td{width:auto;border-bottom:0;padding:12px 14px 4px}
  .sb-spec-table td{padding:0 14px 14px;font-size:14px}
}
`;

export function specTableRows(node: BuilderSpecTableNode): Array<{ label: string; value: string }> {
  return (node.props.rows ?? [])
    .map((r) => ({ label: (r.label ?? "").trim(), value: (r.value ?? "").trim() }))
    .filter((r) => r.label && r.value)
    .slice(0, SPEC_TABLE_ROWS_MAX);
}

export function renderSpecTableBlock(args: {
  node: BuilderSpecTableNode;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, styleAttr } = args;
  const rows = specTableRows(node);
  const empty = rows.length === 0;
  const eyebrow = (node.props.eyebrow ?? "").trim();
  const title = (node.props.title ?? "").trim();
  return (
    <section
      className="sb-spec"
      data-builder-kind="spec_table"
      data-builder-node-kind="spec_table"
      data-builder-node-id={node.id}
      data-spec-empty={empty ? "1" : "0"}
      style={{ ...styleAttr, ["--sb-spec-cols" as string]: String(Math.max(rows.length, 1)) }}
      hidden={empty || undefined}
      aria-hidden={empty || undefined}
      {...anchorIdAttrs(node)}
    >
      {empty ? null : (
        <>
          <style>{SPEC_TABLE_CSS}</style>
          {eyebrow || title ? (
            <header className="sb-spec-header">
              {eyebrow ? <p className="sb-spec-eyebrow">{eyebrow}</p> : null}
              {title ? <h2 className="sb-spec-title">{title}</h2> : null}
            </header>
          ) : null}
          <table className="sb-spec-table">
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${i}:${r.label}`}>
                  <th scope="row">{r.label}</th>
                  <td>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
