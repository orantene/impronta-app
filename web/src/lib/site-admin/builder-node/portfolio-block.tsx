/**
 * Portfolio block renderer (W-12) — live-bound talent media.
 * Layouts: filmstrip · grid · masonry · contact_sheet.
 * Kept out of render.tsx to avoid growing the god file.
 */
import type { CSSProperties, ReactNode } from "react";

import type { TalentOffering } from "@/lib/talent/offerings-types";

import { PORTFOLIO_DEFAULT_PROPS, type PortfolioLayout } from "./portfolio-defaults";
import { filterShotsForPortfolio } from "./portfolio-selection";
import { PortfolioShotLink } from "./portfolio-shot-link";
import type { TalentPortfolioShot } from "./portfolio-types";
import type { BuilderPortfolioNode } from "./types";

export const PORTFOLIO_CSS = `
.sb-portfolio{color:var(--token-color-ink);font:inherit}
.sb-portfolio-header{margin-bottom:1rem}
.sb-portfolio-eyebrow{margin:0 0 0.35rem;font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-portfolio-title{margin:0;font-size:clamp(1.35rem,2.5vw,1.85rem);font-weight:600;letter-spacing:-0.02em;line-height:1.15}
.sb-portfolio-empty{padding:2rem 0;color:var(--token-color-muted);font-size:0.95rem}
.sb-portfolio-shot{position:relative;display:block;overflow:hidden;border:0;padding:0;margin:0;background:var(--token-color-surface-raised,transparent);color:inherit;text-align:left;cursor:pointer;text-decoration:none;width:100%}
.sb-portfolio-shot:focus-visible{outline:2px solid var(--token-color-ink);outline-offset:2px}
.sb-portfolio-shot img{display:block;width:100%;height:100%;object-fit:cover}
.sb-portfolio-cap{display:block;margin-top:0.4rem;font-size:0.8125rem;line-height:1.35;color:var(--token-color-muted)}
.sb-portfolio-service{display:block;font-size:0.75rem;letter-spacing:0.04em;text-transform:uppercase;color:var(--token-color-ink);margin-top:0.15rem}
.sb-portfolio--filmstrip{display:flex;gap:0.75rem;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding-bottom:0.25rem}
.sb-portfolio--filmstrip .sb-portfolio-item{flex:0 0 auto;width:min(72vw,280px);scroll-snap-align:start}
.sb-portfolio--filmstrip .sb-portfolio-frame{aspect-ratio:4/5}
.sb-portfolio--grid{display:grid;gap:0.75rem;grid-template-columns:repeat(var(--sb-portfolio-cols,3),minmax(0,1fr))}
.sb-portfolio--grid .sb-portfolio-frame{aspect-ratio:4/5}
.sb-portfolio--masonry{column-count:var(--sb-portfolio-cols,3);column-gap:0.75rem}
.sb-portfolio--masonry .sb-portfolio-item{break-inside:avoid;margin:0 0 0.75rem;display:block}
.sb-portfolio--masonry .sb-portfolio-frame{aspect-ratio:auto}
.sb-portfolio--masonry .sb-portfolio-shot img{height:auto;aspect-ratio:auto}
.sb-portfolio--contact_sheet{display:grid;gap:0.4rem;grid-template-columns:repeat(var(--sb-portfolio-cols,4),minmax(0,1fr))}
.sb-portfolio--contact_sheet .sb-portfolio-frame{aspect-ratio:1/1}
.sb-portfolio--contact_sheet .sb-portfolio-cap{font-size:0.7rem;margin-top:0.25rem}
@media (max-width:720px){
  .sb-portfolio--grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sb-portfolio--masonry{column-count:2}
  .sb-portfolio--contact_sheet{grid-template-columns:repeat(3,minmax(0,1fr))}
  .sb-portfolio--filmstrip .sb-portfolio-item{width:min(78vw,240px)}
}
@media (max-width:400px){
  .sb-portfolio--contact_sheet{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;

function defaultColumns(layout: PortfolioLayout, authored?: 2 | 3 | 4): number {
  if (authored) return authored;
  if (layout === "contact_sheet") return 4;
  if (layout === "filmstrip") return 3;
  if (layout === "masonry") return 2;
  return 3;
}

function ShotFigure({
  shot,
  offering,
  showCaptions,
  confirmsByHand,
}: {
  shot: TalentPortfolioShot;
  offering?: TalentOffering | null;
  showCaptions: boolean;
  confirmsByHand: boolean;
}) {
  const label =
    shot.caption?.trim() ||
    shot.offeringTitle?.trim() ||
    shot.alt ||
    "Portfolio photo";
  const serviceLine = shot.offeringTitle?.trim() || null;

  return (
    <figure className="sb-portfolio-item" data-portfolio-media={shot.id}>
      <PortfolioShotLink
        offering={offering}
        offeringId={shot.offeringId}
        confirmsByHand={confirmsByHand}
        className="sb-portfolio-shot"
        ariaLabel={
          serviceLine ? `${label}. Opens ${serviceLine}` : label
        }
      >
        <span className="sb-portfolio-frame" style={{ display: "block", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- public CDN URLs; sizes vary by layout */}
          <img src={shot.url} alt={shot.alt || label} loading="lazy" decoding="async" />
        </span>
        {showCaptions && (shot.caption?.trim() || serviceLine) ? (
          <figcaption className="sb-portfolio-cap">
            {shot.caption?.trim() || null}
            {serviceLine ? <span className="sb-portfolio-service">{serviceLine}</span> : null}
          </figcaption>
        ) : null}
      </PortfolioShotLink>
    </figure>
  );
}

export function renderPortfolioBlock(args: {
  node: BuilderPortfolioNode;
  shots: ReadonlyArray<TalentPortfolioShot>;
  offerings?: ReadonlyArray<TalentOffering>;
  confirmsByHand?: boolean;
  styleAttr?: CSSProperties;
}): ReactNode {
  const p = args.node.props;
  const layout = (p.layout ?? PORTFOLIO_DEFAULT_PROPS.layout) as PortfolioLayout;
  const showCaptions = p.showCaptions === true;
  const linkMode = p.linkMode ?? PORTFOLIO_DEFAULT_PROPS.linkMode;
  const cols = defaultColumns(layout, p.columns);
  const visible = filterShotsForPortfolio(args.shots, {
    selectionMode: p.selectionMode,
    selectedMediaIds: p.selectedMediaIds,
    autoIncludeNew: p.autoIncludeNew,
    limit: p.limit,
    shotBindings: p.shotBindings,
  }).map((shot) =>
    linkMode === "none" ? { ...shot, offeringId: null, offeringTitle: shot.offeringTitle } : shot,
  );
  const byOffering = new Map((args.offerings ?? []).map((o) => [o.id, o]));
  const title = (p.title ?? PORTFOLIO_DEFAULT_PROPS.title)?.trim() || "Recent work";
  const eyebrow = p.eyebrow?.trim() || "";
  const empty = (p.emptyMessage ?? PORTFOLIO_DEFAULT_PROPS.emptyMessage) as string;

  return (
    <section
      data-builder-node-kind="portfolio"
      data-portfolio-layout={layout}
      className="sb-portfolio"
      style={{
        ...args.styleAttr,
        ["--sb-portfolio-cols" as string]: String(cols),
      }}
    >
      <style>{PORTFOLIO_CSS}</style>
      <header className="sb-portfolio-header">
        {eyebrow ? <p className="sb-portfolio-eyebrow">{eyebrow}</p> : null}
        <h2 className="sb-portfolio-title">{title}</h2>
      </header>
      {visible.length === 0 ? (
        <p className="sb-portfolio-empty">{empty}</p>
      ) : (
        <div className={`sb-portfolio--${layout}`}>
          {visible.map((shot) => (
            <ShotFigure
              key={shot.id}
              shot={shot}
              offering={shot.offeringId ? byOffering.get(shot.offeringId) ?? null : null}
              showCaptions={showCaptions}
              confirmsByHand={args.confirmsByHand ?? true}
            />
          ))}
        </div>
      )}
    </section>
  );
}
