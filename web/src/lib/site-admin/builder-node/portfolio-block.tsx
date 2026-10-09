/**
 * Portfolio block renderer (W-12) — live-bound talent media.
 * Layouts: filmstrip · grid · masonry · contact_sheet · chapter · staggered · work_order
 * (work_order lives in portfolio-work-order.tsx).
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
import { eyebrowDuplicatesHeading } from "./portfolio-eyebrow";
import { PORTFOLIO_FRAMED_CSS } from "./portfolio-framed-css";
import { filterShotsForPortfolio } from "./portfolio-selection";
import { bookEntryFrom, listBookableOfferings } from "@/lib/talent-site/book-entry";
import type { OpenIntent } from "@/lib/talent-site/open-intent-queue";
import { stickyBarAction, stickyBarIntent } from "@/lib/talent-site/sticky-bar-tap";
import { buildPortfolioGallery, generalBookLabel, type PortfolioGallery } from "./portfolio-lightbox-logic";
import { captionLanguageHint } from "./portfolio-caption-hint";
import { NotShownOnSiteBadge } from "./not-shown-on-site-badge";
import { PortfolioShotLink } from "./portfolio-shot-link";
import { PORTFOLIO_WORK_ORDER_CSS, WorkOrderFigure } from "./portfolio-work-order";
import { renderItalicMarkedTitle } from "./services-catalog-title";
import type { TalentPortfolioShot } from "./portfolio-types";
import type { BuilderPortfolioNode } from "./types";

export const PORTFOLIO_MAGAZINE_CSS = `
.sb-portfolio[data-edition="magazine"]{${MAGAZINE_ROOT_VARS};padding:52px 16px 0;color:var(--sb-mag-ink);width:100%;box-sizing:border-box}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter{display:block}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-head{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:end;border-bottom:1px solid var(--sb-mag-ink);padding-bottom:10px;margin-bottom:12px}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-num{font:italic 400 64px/.8 var(--sb-mag-serif);letter-spacing:0}
.sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-title{font:400 var(--token-type-group-title-size,38px)/.95 var(--sb-mag-serif);letter-spacing:0}
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
  .sb-portfolio[data-edition="magazine"] .sb-portfolio-chapter-title{margin-top:6px;font-size:var(--token-type-group-title-size-desktop,56px)}
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
  if (layout === "work_order") return 2;
  return 3;
}

/** F28: the staggered strip is a 5-column row on desktop; a 6th tile collapsed to 0x0. */
const STAGGERED_MAX = 5;

/** Framed cards: six tiles on the phone strip; the sixth is hidden on the desktop row. */
const FRAMED_STAGGERED_MAX = 6;

function defaultLimit(layout: PortfolioLayout, authored?: number, framed = false): number {
  if (layout === "staggered") {
    const cap = framed ? FRAMED_STAGGERED_MAX : STAGGERED_MAX;
    return Math.min(typeof authored === "number" ? authored : cap, cap);
  }
  if (typeof authored === "number") return authored;
  if (layout === "chapter" || layout === "work_order") return 6;
  return PORTFOLIO_DEFAULT_PROPS.limit ?? 12;
}

function ShotFigure({
  shot,
  offering,
  showCaptions,
  confirmsByHand,
  itemClass,
  wantLabel,
  framed,
  magazineIndex,
  es,
  gallery,
  captionHint,
  generalIntent,
}: {
  /** TUL-440: what the lightbox's general "Book an appointment" opens; null = nothing bookable. */
  generalIntent?: OpenIntent | null;
  shot: TalentPortfolioShot;
  /** A-06: every shot of this block, and where this one sits in it (lightbox next/back). */
  gallery: PortfolioGallery;
  offering?: TalentOffering | null;
  showCaptions: boolean;
  confirmsByHand: boolean;
  itemClass?: string;
  /** Staggered strip: a linked shot reads "I want this" instead of the service name. */
  wantLabel?: string;
  /** Framed card: name + round arrow; the service label is the arrow's accessible name. */
  framed?: boolean;
  /** Magazine: 1-based plate number shown as "01 · caption". */
  magazineIndex?: number;
  es?: boolean;
  /** TUL-15: "(en español)" under a caption shown in another language than the visitor's. */
  captionHint?: string | null;
}) {
  const hint = captionHint ? (
    <small className="sb-portfolio-cap-hint" style={{ display: "block", opacity: 0.6, fontSize: "0.8em" }}>
      {captionHint}
    </small>
  ) : null;
  const label =
    shot.caption?.trim() ||
    shot.offeringTitle?.trim() ||
    shot.alt ||
    (es ? "Foto del portafolio" : "Portfolio photo");
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
        shotId={shot.id}
        lightbox={{
          gallery,
          bookLabel: es ? "Reservar este look" : "Book this look",
          closeLabel: es ? "Cerrar" : "Close",
          prevLabel: es ? "Foto anterior" : "Previous photo",
          nextLabel: es ? "Foto siguiente" : "Next photo",
          ...(generalIntent ? { generalBook: { label: generalBookLabel(es === true), intent: generalIntent } } : {}),
        }}
        ariaLabel={
          offering && serviceLine
            ? `${label}. ${es ? "Abre" : "Opens"} ${serviceLine}`
            : `${es ? "Ver foto" : "View photo"} ${gallery.index + 1}: ${label}`
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
            {hint}
          </figcaption>
        ) : showCaptions && framed && (shot.caption?.trim() || shot.offeringTitle?.trim() || shot.offeringId) ? (
          <figcaption className="sb-portfolio-cap">
            <span className="sb-portfolio-name">{shot.caption?.trim() || shot.offeringTitle?.trim() || null}{hint}</span>
            {shot.offeringId ? (
              <>
                <span className="sb-portfolio-arrow" aria-hidden="true">
                  {"\u2192"}
                </span>
                <span className="sb-portfolio-sr">{serviceLine}</span>
              </>
            ) : null}
          </figcaption>
        ) : showCaptions && (shot.caption?.trim() || serviceLine) ? (
          <figcaption className="sb-portfolio-cap">
            {shot.caption?.trim() || null}
            {hint}
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
  /** The page's primary language: the language an unmapped caption is written in. */
  primaryLocale?: string;
  /** TUL-124 — builder canvas: badge empty bands the live site drops. */
  editorPreview?: boolean;
}): ReactNode {
  const p = args.node.props;
  const layout = (p.layout ?? PORTFOLIO_DEFAULT_PROPS.layout) as PortfolioLayout;
  const es = (args.locale ?? "").toLowerCase().startsWith("es");
  const framed = p.cardStyle === "framed";
  const wantLabel = layout === "staggered" || framed ? (es ? "Quiero esto" : "I want this") : undefined;
  const showCaptions = p.showCaptions === true;
  const linkMode = p.linkMode ?? PORTFOLIO_DEFAULT_PROPS.linkMode;
  const cols = defaultColumns(layout, p.columns);
  const visible = filterShotsForPortfolio(args.shots, {
    selectionMode: p.selectionMode,
    selectedMediaIds: p.selectedMediaIds,
    autoIncludeNew: p.autoIncludeNew,
    limit: defaultLimit(layout, p.limit, framed),
    shotBindings: p.shotBindings,
    albumId: p.albumId,
  }).map((shot) =>
    linkMode === "none" ? { ...shot, offeringId: null, offeringTitle: shot.offeringTitle } : shot,
  );
  const byOffering = new Map((args.offerings ?? []).map((o) => [o.id, o]));
  const title = (p.title ?? PORTFOLIO_DEFAULT_PROPS.title)?.trim() || "Recent work";
  const eyebrow = eyebrowDuplicatesHeading(p.eyebrow, title) ? "" : p.eyebrow?.trim() || "";
  const empty = (p.emptyMessage ?? PORTFOLIO_DEFAULT_PROPS.emptyMessage) as string;
  const credit = p.creditLine?.trim() || "";
  const roman = portfolioChapterRoman(p.chapterNumber);
  const isChapter = layout === "chapter";
  const magazine = isChapter && p.edition === "magazine";

  const workOrder = layout === "work_order";
  // TUL-440: the header CTA's decision (one service: its sheet; several: the picker; none: hidden).
  const bookable = listBookableOfferings({ offerings: args.offerings ?? [], confirmsByHand: args.confirmsByHand ?? true });
  const generalIntent = stickyBarIntent(stickyBarAction(bookable.length), bookEntryFrom(bookable));
  const galleryItems = buildPortfolioGallery(visible, (id) => byOffering.has(id), es, showCaptions ? (shot) => {
    const full = visible.find((v) => v.id === shot.id);
    return captionLanguageHint({ caption: full?.caption, captionI18n: full?.captionI18n, locale: args.locale, primaryLocale: args.primaryLocale });
  } : undefined);
  const shotNodes = visible.map((shot, index) => workOrder ? (
    <WorkOrderFigure
      key={shot.id}
      shot={shot}
      gallery={{ items: galleryItems, index }}
      es={es}
      generalIntent={generalIntent}
      locale={args.locale}
    />
  ) : (
    <ShotFigure
      key={shot.id}
      shot={shot}
      offering={shot.offeringId ? byOffering.get(shot.offeringId) ?? null : null}
      showCaptions={showCaptions}
      confirmsByHand={args.confirmsByHand ?? true}
      itemClass={isChapter ? chapterItemClass(index) : undefined}
      wantLabel={wantLabel}
      framed={framed}
      magazineIndex={magazine ? index + 1 : undefined}
      es={es}
      captionHint={
        showCaptions
          ? captionLanguageHint({
              caption: shot.caption,
              captionI18n: shot.captionI18n,
              locale: args.locale,
              primaryLocale: args.primaryLocale,
            })
          : null
      }
      gallery={{ items: galleryItems, index }}
      generalIntent={generalIntent}
    />
  ));

  return (
    <section
      data-builder-node-kind="portfolio"
      data-builder-node-id={args.node.id}
      data-portfolio-layout={layout}
      data-portfolio-chapter={isChapter ? roman : undefined}
      data-edition={magazine ? "magazine" : undefined}
      data-card-style={framed ? "framed" : undefined}
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
      {framed ? <style>{PORTFOLIO_FRAMED_CSS}</style> : null}
      {workOrder ? <style>{PORTFOLIO_WORK_ORDER_CSS}</style> : null}
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
            <div
              className="sb-portfolio-empty"
              data-not-shown-on-site-host={args.editorPreview ? "" : undefined}
            >
              {args.editorPreview ? <NotShownOnSiteBadge locale={args.locale} /> : null}
              <p style={{ margin: args.editorPreview ? "8px 0 0" : 0 }}>{empty}</p>
            </div>
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
            <div
              className="sb-portfolio-empty"
              data-not-shown-on-site-host={args.editorPreview ? "" : undefined}
            >
              {args.editorPreview ? <NotShownOnSiteBadge locale={args.locale} /> : null}
              <p style={{ margin: args.editorPreview ? "8px 0 0" : 0 }}>{empty}</p>
            </div>
          ) : (
            <div className={`sb-portfolio--${layout}`}>{shotNodes}</div>
          )}
          {framed && layout === "staggered" && visible.length > 2 ? (
            <p className="sb-portfolio-hint" aria-hidden="true">
              {es ? "Desliza para ver más \u2192" : "Swipe to see more \u2192"}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
