/**
 * Contents block — authored chapter index / table of contents.
 * Links jump to matching `anchorId` targets (e.g. portfolio chapters).
 * Shared widget; Designs stamp via `contentsBlock`. No live data source.
 */
import type { CSSProperties, ReactNode } from "react";

import { normalizeAnchorId, anchorIdAttrs } from "./anchor-id";
import {
  CONTENTS_DEFAULT_PROPS,
  type ContentsItem,
  type ContentsLayout,
  type ContentsNumberStyle,
} from "./contents-defaults";
import { MAGAZINE_ROOT_VARS } from "./magazine-edition";
import { portfolioChapterRoman } from "./portfolio-defaults";
import type { BuilderContentsNode } from "./types";

export const CONTENTS_CSS = `
.sb-contents{color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box}
.sb-contents[data-contents-band="1"]{padding:clamp(2.25rem,5vw,4rem) clamp(1.1rem,3vw,2rem)}
.sb-contents-inner{width:100%;max-width:42rem;margin:0 auto}
.sb-contents-header{margin-bottom:clamp(1.25rem,2.5vw,2rem)}
.sb-contents-eyebrow{margin:0 0 0.35rem;font-size:0.72rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-contents-title{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(1.65rem,3.5vw,2.35rem);font-weight:400;letter-spacing:-0.02em;line-height:1.1;color:var(--token-color-ink)}
.sb-contents-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.sb-contents-item{border-bottom:1px solid var(--token-color-line)}
.sb-contents-item:first-child{border-top:1px solid var(--token-color-line)}
.sb-contents-link{display:flex;align-items:baseline;gap:0.85rem;padding:0.95rem 0.1rem;color:var(--token-color-ink);text-decoration:none;font-size:clamp(1.05rem,2.2vw,1.25rem);line-height:1.3;transition:color 160ms ease}
.sb-contents-link:hover{color:var(--token-color-accent,var(--token-color-primary))}
.sb-contents-num{flex:0 0 auto;min-width:1.75rem;font-size:0.78rem;letter-spacing:0.08em;color:var(--token-color-muted);font-variant-numeric:tabular-nums}
.sb-contents-label{flex:1 1 auto;min-width:0}
.sb-contents[data-contents-layout="compact"] .sb-contents-link{padding:0.65rem 0.1rem;font-size:0.98rem}
.sb-contents[data-contents-layout="compact"] .sb-contents-title{font-size:clamp(1.35rem,3vw,1.85rem)}
`;

/** Magazine index ("In this issue"): ink rule, italic numeral, serif title, small caps credit. */
export const MAGAZINE_INDEX_CSS = `
.sb-mag-toc{${MAGAZINE_ROOT_VARS};border-top:1px solid var(--sb-mag-ink);color:var(--sb-mag-ink);width:100%;min-width:0}
.sb-mag-toc>h2{margin:10px 0 6px;font:600 11px/1.2 var(--sb-mag-label);letter-spacing:.24em;text-transform:uppercase;color:var(--sb-mag-ink)}
.sb-mag-toc ol{list-style:none;margin:0;padding:0}
.sb-mag-toc a{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:8px;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--sb-mag-line);color:var(--sb-mag-ink);text-decoration:none}
.sb-mag-toc i{font:italic 400 22px/1 var(--sb-mag-serif)}
.sb-mag-toc b{font:400 26px/1 var(--sb-mag-serif);min-width:0}
.sb-mag-toc small{font:600 10.5px/1.2 var(--sb-mag-label);letter-spacing:.16em;text-transform:uppercase;color:var(--sb-mag-mute);text-align:right}
.sb-contents[data-edition="magazine"]{padding:0 16px}
@media (min-width:900px){.sb-contents[data-edition="magazine"]{padding:0 40px}}
`;

/** Shared index rows (standalone Contents and the magazine masthead spread). */
export function renderMagazineIndex(args: {
  title: string;
  items: ReadonlyArray<{ label: string; anchor: string; credit?: string }>;
  showNumbers?: boolean;
}): ReactNode {
  const items = normalizeItems(args.items);
  if (items.length === 0) return null;
  return (
    <nav className="sb-mag-toc" aria-label={args.title}>
      <h2>{args.title}</h2>
      <ol>
        {items.map((item, i) => (
          <li key={`${item.anchor}:${i}`}>
            <a href={`#${item.anchor}`}>
              <i aria-hidden>{args.showNumbers === false ? "" : portfolioChapterRoman(i + 1)}</i>
              <b>{item.label}</b>
              {item.credit ? <small>{item.credit}</small> : <small />}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function itemNumber(
  index: number,
  style: ContentsNumberStyle,
): string {
  const n = index + 1;
  if (style === "decimal") return String(n).padStart(2, "0");
  return portfolioChapterRoman(n);
}

function normalizeItems(
  raw: ReadonlyArray<ContentsItem> | undefined,
): Array<{ label: string; anchor: string; credit: string }> {
  const out: Array<{ label: string; anchor: string; credit: string }> = [];
  for (const row of raw ?? []) {
    const label = (row.label ?? "").trim();
    const anchor = normalizeAnchorId(row.anchor);
    if (!label || !anchor) continue;
    out.push({ label, anchor, credit: (row.credit ?? "").trim() });
  }
  return out;
}

export function renderContentsBlock(args: {
  node: BuilderContentsNode;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, styleAttr } = args;
  const p = node.props;
  const layout = (p.layout ?? CONTENTS_DEFAULT_PROPS.layout ?? "index") as ContentsLayout;
  const numberStyle = (p.numberStyle ??
    CONTENTS_DEFAULT_PROPS.numberStyle ??
    "roman") as ContentsNumberStyle;
  const showNumbers = p.showNumbers !== false;
  const items = normalizeItems(p.items);
  const title = (p.title ?? CONTENTS_DEFAULT_PROPS.title ?? "Contents").trim() || "Contents";
  const eyebrow = (p.eyebrow ?? "").trim();

  if (p.edition === "magazine") {
    if (items.length === 0) return null;
    return (
      <div
        className="sb-contents"
        data-builder-kind="contents"
        data-builder-node-kind="contents"
        data-builder-node-id={node.id}
        data-edition="magazine"
        style={styleAttr}
        {...anchorIdAttrs(node)}
      >
        <style>{MAGAZINE_INDEX_CSS}</style>
        {renderMagazineIndex({ title, items, showNumbers })}
      </div>
    );
  }

  return (
    <nav
      className="sb-contents"
      data-builder-kind="contents"
      data-builder-node-kind="contents"
      data-builder-node-id={node.id}
      data-contents-layout={layout}
      data-contents-band="1"
      aria-label={title}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      <style>{CONTENTS_CSS}</style>
      <div className="sb-contents-inner">
        <header className="sb-contents-header">
          {eyebrow ? <p className="sb-contents-eyebrow">{eyebrow}</p> : null}
          <h2 className="sb-contents-title">{title}</h2>
        </header>
        {items.length === 0 ? null : (
          <ol className="sb-contents-list">
            {items.map((item, i) => (
              <li key={`${item.anchor}:${i}`} className="sb-contents-item">
                <a className="sb-contents-link" href={`#${item.anchor}`}>
                  {showNumbers ? (
                    <span className="sb-contents-num" aria-hidden>
                      {itemNumber(i, numberStyle)}
                    </span>
                  ) : null}
                  <span className="sb-contents-label">{item.label}</span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </nav>
  );
}
