/**
 * Masthead — giant stacked words over an optional B&W cover.
 * Shared W-10 hero variant; Designs stamp via `heroMasthead`. No live data source.
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
import {
  MASTHEAD_DEFAULT_PROPS,
  type MastheadCoverFilter,
} from "./masthead-defaults";
import type { BuilderMastheadNode } from "./types";

export const MASTHEAD_CSS = `
.sb-masthead{position:relative;width:100%;min-width:0;box-sizing:border-box;color:var(--token-color-ink);font:inherit;isolation:isolate}
.sb-masthead[data-masthead-cover="1"]{color:var(--token-color-background,Canvas);min-height:clamp(28rem,82vh,56rem)}
.sb-masthead-cover,.sb-masthead-scrim{position:absolute;inset:0;z-index:0;pointer-events:none}
.sb-masthead-cover{background-size:cover;background-position:center;background-repeat:no-repeat}
.sb-masthead[data-masthead-filter="bw"] .sb-masthead-cover{filter:grayscale(1) contrast(1.05)}
.sb-masthead-scrim{background:linear-gradient(180deg,color-mix(in srgb,var(--token-color-ink,CanvasText) 12%,transparent) 0%,color-mix(in srgb,var(--token-color-ink,CanvasText) 70%,transparent) 100%)}
.sb-masthead-body{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;gap:clamp(0.85rem,2vw,1.5rem);width:100%;min-height:inherit;box-sizing:border-box;padding:clamp(2rem,6vw,4.5rem) clamp(1.1rem,4vw,3rem)}
.sb-masthead-stack{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:0;max-width:100%}
.sb-masthead-line{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(3.25rem,16vw,10.5rem);font-weight:400;line-height:0.88;letter-spacing:-0.045em;text-transform:uppercase;text-wrap:balance;color:inherit}
.sb-masthead-meta{display:flex;flex-direction:column;gap:0.35rem;max-width:36rem}
.sb-masthead-subline{margin:0;font-size:0.78rem;letter-spacing:0.18em;text-transform:uppercase;opacity:0.88}
.sb-masthead-credit{margin:0;font-size:0.92rem;letter-spacing:0.02em;opacity:0.78;font-family:var(--token-typography-body-font-family,var(--site-body-font,system-ui,sans-serif))}
.sb-masthead[data-masthead-cover="0"] .sb-masthead-body{padding-block:clamp(2.5rem,7vw,5rem)}
`;

function normalizeLines(
  raw: ReadonlyArray<string> | undefined,
  splitWords: boolean,
): string[] {
  const authored = (raw ?? [])
    .map((line) => (line ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
  if (authored.length === 0) return [];
  if (splitWords && authored.length === 1) {
    const parts = authored[0]!.split(/\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts.slice(0, 8);
  }
  return authored;
}

export function renderMastheadBlock(args: {
  node: BuilderMastheadNode;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, styleAttr } = args;
  const p = node.props;
  const splitWords = p.splitWords !== false;
  const lines = normalizeLines(p.lines, splitWords);
  const showCover = p.showCover !== false;
  const coverFilter = (p.coverFilter ??
    MASTHEAD_DEFAULT_PROPS.coverFilter ??
    "bw") as MastheadCoverFilter;
  const coverSrc = (p.coverSrc ?? MASTHEAD_DEFAULT_PROPS.coverSrc ?? "").trim();
  const subline = (p.subline ?? "").trim();
  const creditLine = (p.creditLine ?? "").trim();
  const hasCover = showCover && Boolean(coverSrc);

  return (
    <section
      className="sb-masthead"
      data-builder-kind="masthead"
      data-masthead-cover={hasCover ? "1" : "0"}
      data-masthead-filter={coverFilter}
      aria-label={lines.join(" ") || "Masthead"}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      <style>{MASTHEAD_CSS}</style>
      {hasCover ? (
        <>
          <div
            className="sb-masthead-cover"
            style={{ backgroundImage: `url(${coverSrc})` }}
            aria-hidden
          />
          <div className="sb-masthead-scrim" aria-hidden />
        </>
      ) : null}
      <div className="sb-masthead-body">
        {lines.length === 0 ? null : (
          <h1 className="sb-masthead-stack">
            {lines.map((line, i) => (
              <span key={`${i}:${line}`} className="sb-masthead-line">
                {line}
              </span>
            ))}
          </h1>
        )}
        {subline || creditLine ? (
          <div className="sb-masthead-meta">
            {subline ? <p className="sb-masthead-subline">{subline}</p> : null}
            {creditLine ? <p className="sb-masthead-credit">{creditLine}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
