/**
 * Portfolio block renderer (W-12) — live-bound talent media.
 * Layouts: filmstrip · grid · masonry · contact_sheet · chapter.
 * Kept out of render.tsx to avoid growing the god file.
 *
 * Budget note: chapter layout adds ~1.4 KB of token-only CSS (sticky head,
 * 1+2 shot rhythm) plus thin chapter props. No app-bundle raise needed.
 */
import type { CSSProperties, ReactNode } from "react";

import type { TalentOffering } from "@/lib/talent/offerings-types";

import { anchorIdAttrs } from "./anchor-id";
import {
  PORTFOLIO_DEFAULT_PROPS,
  portfolioChapterRoman,
  type PortfolioLayout,
} from "./portfolio-defaults";
import { MAGAZINE_ROOT_VARS } from "./magazine-edition";
import { filterShotsForPortfolio } from "./portfolio-selection";
import { PortfolioShotLink } from "./portfolio-shot-link";
import { renderItalicMarkedTitle } from "./services-catalog-title";
import type { TalentPortfolioShot } from "./portfolio-types";
import type { BuilderPortfolioNode } from "./types";

export const PORTFOLIO_MAGAZINE_CSS = `
.sb-portfolio[data-edition="magazine"]{${MAGAZINE_ROOT_VARS};padding:52px 16px 0;color:var(--sb-mag-ink);width:100%;box-sizing:border-box}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter{display:block}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-head{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:end;border-bottom:1px solid var(--sb-mag-ink);padding-bottom:10px;margin-bottom:12px}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-num{font:italic 400 64px/.8 var(--sb-mag-serif);letter-spacing:0}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-title{font:400 38px/.95 var(--sb-mag-serif);letter-spacing:0}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-credit{grid-column:1/-1;margin:0;font:600 10.5px/1.3 var(--sb-mag-label);letter-spacing:.18em;text-transform:uppercase;color:var(--sb-mag-mute)}
.sb-portfolio[data-edition="magazine"] .sb-portfolio--chapter{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-item{margin:0;position:relative;overflow:hidden;background:var(--sb-mag-tint)}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-shot,.sb-portfolio[data-edition="magazine"] .sb-portfolio-frame{height:100%}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-item--hero{grid-column:1/-1}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-item--hero .sb-portfolio-frame{aspect-ratio:4/5}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-item--pair .sb-portfolio-frame{aspect-ratio:3/4}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-cap{position:absolute;left:8px;bottom:8px;margin:0;padding:3px 6px;font:600 9.5px/1.2 var(--sb-mag-label);letter-spacing:.16em;text-transform:uppercase;color:white;background:color-mix(in srgb,black 35%,transparent)}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-service{display:none}
@media (min-width:900px){
  .sb-portfolio[data-edition="magazine"]{padding:90px 40px 0}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter{display:grid;grid-template-columns:320px minmax(0,1fr);gap:40px;align-items:start}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-head{display:block;border:0;padding:0;margin:0;position:sticky;top:80px}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-num{display:block;font-size:120px}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-title{margin-top:6px;font-size:56px}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-credit{margin-top:12px}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio--chapter{grid-template-columns:1.4fr 1fr 1fr;gap:10px}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-item--hero{grid-column:auto;grid-row:span 2}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-item--hero .sb-portfolio-frame{aspect-ratio:auto}
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-item--pair .sb-portfolio-frame{aspect-ratio:4/5}
}
`;

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
.sb-portfolio--staggered{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:6px}
.sb-portfolio--staggered::-webkit-scrollbar{display:none}
.sb-portfolio--staggered .sb-portfolio-item{flex:0 0 62%;margin:0;scroll-snap-align:start}
.sb-portfolio--staggered .sb-portfolio-frame{aspect-ratio:3/4;border-radius:20px}
.sb-portfolio--staggered .sb-portfolio-shot{background:none}
.sb-portfolio--staggered .sb-portfolio-shot img{transition:transform .5s ease}
.sb-portfolio--staggered .sb-portfolio-shot:hover img{transform:scale(1.04)}
/* Phone filmstrip bleeds to the screen edge (Maison staggered default). */
@media (max-width:899px){.sb-portfolio--staggered{margin:0 -18px;padding:0 18px 6px}}
@media (min-width:900px){
  .sb-portfolio--staggered{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));overflow:visible;padding:0;margin:0;align-items:center}
  .sb-portfolio--staggered .sb-portfolio-item:nth-child(n+6){display:none}
  .sb-portfolio--staggered .sb-portfolio-item:nth-child(2),.sb-portfolio--staggered .sb-portfolio-item:nth-child(4){margin-top:40px}
}
.sb-portfolio--grid{display:grid;gap:0.75rem;grid-template-columns:repeat(var(--sb-portfolio-cols,3),minmax(0,1fr))}
.sb-portfolio--grid .sb-portfolio-frame{aspect-ratio:4/5}
.sb-portfolio--masonry{column-count:var(--sb-portfolio-cols,3);column-gap:0.75rem}
.sb-portfolio--masonry .sb-portfolio-item{break-inside:avoid;margin:0 0 0.75rem;display:block}
.sb-portfolio--masonry .sb-portfolio-frame{aspect-ratio:auto}
.sb-portfolio--masonry .sb-portfolio-shot img{height:auto;aspect-ratio:auto}
.sb-portfolio--contact_sheet{display:grid;gap:0.4rem;grid-template-columns:repeat(var(--sb-portfolio-cols,4),minmax(0,1fr))}
.sb-portfolio--contact_sheet .sb-portfolio-frame{aspect-ratio:1/1}
.sb-portfolio--contact_sheet .sb-portfolio-cap{font-size:0.7rem;margin-top:0.25rem}
.sb-portfolio-chapter{display:grid;gap:1.25rem}
.sb-portfolio-chapter-head{display:flex;flex-direction:column;gap:0.45rem;min-width:0}
.sb-portfolio-chapter-num{margin:0;font-size:clamp(2rem,4vw,3rem);font-weight:600;letter-spacing:-0.04em;line-height:1;color:var(--token-color-ink)}
.sb-portfolio-chapter-title{margin:0;font-size:clamp(1.25rem,2.2vw,1.65rem);font-weight:600;letter-spacing:-0.02em;line-height:1.15}
.sb-portfolio-credit{margin:0;font-size:0.8125rem;line-height:1.4;color:var(--token-color-muted)}
.sb-portfolio--chapter{display:grid;gap:0.75rem;grid-template-columns:1fr 1fr}
.sb-portfolio--chapter .sb-portfolio-item--hero{grid-column:1/-1}
.sb-portfolio--chapter .sb-portfolio-item--hero .sb-portfolio-frame{aspect-ratio:3/4}
.sb-portfolio--chapter .sb-portfolio-item--pair .sb-portfolio-frame{aspect-ratio:4/5}
@media (min-width:901px){
  .sb-portfolio-chapter{grid-template-columns:minmax(11rem,24%) minmax(0,1fr);align-items:start;gap:2.25rem}
  .sb-portfolio-chapter-head{position:sticky;top:1.5rem}
}
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
  if (layout === "staggered") return 5;
  if (layout === "masonry") return 2;
  if (layout === "chapter") return 2;
  return 3;
}

function defaultLimit(layout: PortfolioLayout, authored?: number): number {
  if (typeof authored === "number") return authored;
  if (layout === "chapter") return 6;
  return PORTFOLIO_DEFAULT_PROPS.limit ?? 12;
}

function ShotFigure({
  shot,
  offering,
  showCaptions,
  confirmsByHand,
  itemClass,
  wantLabel,
  magazineIndex,
}: {
  shot: TalentPortfolioShot;
  offering?: TalentOffering | null;
  showCaptions: boolean;
  confirmsByHand: boolean;
  itemClass?: string;
  /** Staggered strip: a linked shot reads "I want this" instead of the service name. */
  wantLabel?: string;
  /** Magazine: 1-based plate number shown as "01 · caption". */
  magazineIndex?: number;
}) {
  const label =
    shot.caption?.trim() ||
    shot.offeringTitle?.trim() ||
    shot.alt ||
    "Portfolio photo";
  const serviceLine =
    wantLabel && shot.offeringId && shot.caption?.trim()
      ? wantLabel
      : shot.offeringTitle?.trim() || null;

  return (
    <figure
      className={itemClass ? `sb-portfolio-item ${itemClass}` : "sb-portfolio-item"}
      data-portfolio-media={shot.id}
    >
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
        {showCaptions && magazineIndex ? (
          <figcaption className="sb-portfolio-cap">
            {[String(magazineIndex).padStart(2, "0"), shot.caption?.trim() || serviceLine]
              .filter(Boolean)
              .join(" · ")}
          </figcaption>
        ) : showCaptions && (shot.caption?.trim() || serviceLine) ? (
          <figcaption className="sb-portfolio-cap">
            {shot.caption?.trim() || null}
            {serviceLine ? <span className="sb-portfolio-service">{serviceLine}</span> : null}
          </figcaption>
        ) : null}
      </PortfolioShotLink>
    </figure>
  );
}

function chapterItemClass(index: number): string {
  return index % 3 === 0 ? "sb-portfolio-item--hero" : "sb-portfolio-item--pair";
}

export function renderPortfolioBlock(args: {
  node: BuilderPortfolioNode;
  shots: ReadonlyArray<TalentPortfolioShot>;
  offerings?: ReadonlyArray<TalentOffering>;
  confirmsByHand?: boolean;
  styleAttr?: CSSProperties;
  /**
   * `builderNodeStyleAttrs(style)`: the presence attrs the static sheet keys
   * the phone/tablet overrides on (`--bn-mobile-*`). Without them a
   * responsive padding on the block never applies.
   */
  styleDataAttrs?: Record<string, string | undefined>;
  locale?: string;
}): ReactNode {
  const p = args.node.props;
  const layout = (p.layout ?? PORTFOLIO_DEFAULT_PROPS.layout) as PortfolioLayout;
  const es = (args.locale ?? "").toLowerCase().startsWith("es");
  const wantLabel = layout === "staggered" ? (es ? "Quiero esto" : "I want this") : undefined;
  const showCaptions = p.showCaptions === true;
  const linkMode = p.linkMode ?? PORTFOLIO_DEFAULT_PROPS.linkMode;
  const cols = defaultColumns(layout, p.columns);
  const visible = filterShotsForPortfolio(args.shots, {
    selectionMode: p.selectionMode,
    selectedMediaIds: p.selectedMediaIds,
    autoIncludeNew: p.autoIncludeNew,
    limit: defaultLimit(layout, p.limit),
    shotBindings: p.shotBindings,
    albumId: p.albumId,
  }).map((shot) =>
    linkMode === "none" ? { ...shot, offeringId: null, offeringTitle: shot.offeringTitle } : shot,
  );
  const byOffering = new Map((args.offerings ?? []).map((o) => [o.id, o]));
  const title = (p.title ?? PORTFOLIO_DEFAULT_PROPS.title)?.trim() || "Recent work";
  const eyebrow = p.eyebrow?.trim() || "";
  const empty = (p.emptyMessage ?? PORTFOLIO_DEFAULT_PROPS.emptyMessage) as string;
  const credit = p.creditLine?.trim() || "";
  const roman = portfolioChapterRoman(p.chapterNumber);
  const isChapter = layout === "chapter";
  const magazine = isChapter && p.edition === "magazine";

  const shotNodes = visible.map((shot, index) => (
    <ShotFigure
      key={shot.id}
      shot={shot}
      offering={shot.offeringId ? byOffering.get(shot.offeringId) ?? null : null}
      showCaptions={showCaptions}
      confirmsByHand={args.confirmsByHand ?? true}
      itemClass={isChapter ? chapterItemClass(index) : undefined}
      wantLabel={wantLabel}
      magazineIndex={magazine ? index + 1 : undefined}
    />
  ));

  return (
    <section
      data-builder-node-kind="portfolio"
      data-portfolio-layout={layout}
      data-portfolio-chapter={isChapter ? roman : undefined}
      data-edition={magazine ? "magazine" : undefined}
      {...(args.styleDataAttrs ?? {})}
      className={args.styleDataAttrs ? "site-builder-node sb-portfolio" : "sb-portfolio"}
      style={{
        ...args.styleAttr,
        ["--sb-portfolio-cols" as string]: String(cols),
      }}
      {...anchorIdAttrs(args.node)}
    >
      <style>{PORTFOLIO_CSS}</style>
      {magazine ? <style>{PORTFOLIO_MAGAZINE_CSS}</style> : null}
      {isChapter ? (
        <div className="sb-portfolio-chapter">
          <header className="sb-portfolio-chapter-head">
            <p className="sb-portfolio-chapter-num" aria-hidden="true">
              {roman}
            </p>
            <h2 className="sb-portfolio-chapter-title">{title}</h2>
            {credit ? <p className="sb-portfolio-credit">{credit}</p> : null}
          </header>
          {visible.length === 0 ? (
            <p className="sb-portfolio-empty">{empty}</p>
          ) : (
            <div className="sb-portfolio--chapter">{shotNodes}</div>
          )}
        </div>
      ) : (
        <>
          <header className="sb-portfolio-header">
            {eyebrow ? <p className="sb-portfolio-eyebrow">{eyebrow}</p> : null}
            <h2 className="sb-portfolio-title">{renderItalicMarkedTitle(title)}</h2>
          </header>
          {visible.length === 0 ? (
            <p className="sb-portfolio-empty">{empty}</p>
          ) : (
            <div className={`sb-portfolio--${layout}`}>{shotNodes}</div>
          )}
        </>
      )}
    </section>
  );
}
