/**
 * Portfolio layout "work_order" (Gridline `.gl-jobs` / `.gl-job`): job cards.
 *
 * Each tile is a photo with a two-line work-order caption. Convention (no
 * schema change): the media caption is two lines, first = the job title,
 * second = the detail ("OT-0412 · San Pedro · 1 día"). The tile never links
 * to an offering (work_order shots stay unlinked); a tap opens the shared
 * portfolio lightbox (TUL-474 / TUL-440). Alt text is the job title, else a
 * generic portfolio label (TUL-384: empty alt marked content photos as
 * decorative). A tile without a caption shows the
 * photo alone. Phone: 2 columns, square. Desktop (the block's own container
 * >= 900px): 6 columns, 4:5 tiles. Token colours only.
 */
import type { ReactNode } from "react";

import type { OpenIntent } from "@/lib/talent-site/open-intent-queue";

import { PortfolioShotLink } from "./portfolio-shot-link";
import { generalBookLabel, type PortfolioGallery } from "./portfolio-lightbox-logic";
import { portfolioPhotoFallbackAlt } from "./portfolio-i18n";
import type { TalentPortfolioShot } from "./portfolio-types";

export const PORTFOLIO_WORK_ORDER_CSS = `
.sb-portfolio[data-portfolio-layout="work_order"]{container:sbwo/inline-size}
.sb-portfolio--work_order{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.sb-wo-job{margin:0;border-radius:8px;overflow:hidden;background:var(--token-color-surface-raised,var(--token-color-background));border:1px solid var(--token-color-line);transition:transform .18s}
.sb-wo-job:hover{transform:translateY(-2px)}
.sb-wo-shot{display:block;width:100%;padding:0;border:0;background:transparent;cursor:pointer;text-align:inherit;font:inherit;color:inherit}
.sb-wo-job img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
.sb-wo-job figcaption{padding:8px;font:500 10.5px/1.4 var(--site-mono-font,ui-monospace,monospace);color:var(--token-color-muted);overflow-wrap:anywhere}
.sb-wo-job figcaption b{display:block;color:var(--token-color-ink);font:800 13px var(--token-typography-heading-font-family,var(--site-heading-font,inherit));margin-bottom:2px}
/* TUL-474/496: last job captions clear sticky book bar + chat bubble on phone. */
@media (max-width:899px){
  .sb-portfolio[data-portfolio-layout="work_order"]{padding-bottom:max(28px,calc(96px + env(safe-area-inset-bottom,0px)));scroll-margin-bottom:96px}
  .sb-portfolio--work_order{margin-bottom:12px}
}
@container sbwo (min-width:900px){
  .sb-portfolio--work_order{margin-top:0;grid-template-columns:repeat(6,1fr);gap:8px}
  .sb-wo-job img{aspect-ratio:4/5}
}
@media (prefers-reduced-motion:reduce){.sb-wo-job{transition:none}.sb-wo-job:hover{transform:none}}
`;

/** Split the two-line caption convention: first line title, the rest detail. */
export function splitWorkOrderCaption(caption: string | null | undefined): { title: string; detail: string } {
  const lines = (caption ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return { title: lines[0] ?? "", detail: lines.slice(1).join(" ") };
}

export function WorkOrderFigure({
  shot,
  gallery,
  es,
  locale,
  generalIntent,
  captionHint,
}: {
  shot: TalentPortfolioShot;
  gallery: PortfolioGallery;
  es: boolean;
  /** Visitor locale for the generic portfolio alt fallback (TUL-384). */
  locale?: string | null;
  generalIntent?: OpenIntent | null;
  /** TUL-187: "Disponible en español" when the caption is not in the visitor's language. */
  captionHint?: string | null;
}): ReactNode {
  const { title, detail } = splitWorkOrderCaption(shot.caption);
  const label = title || (es ? "Ver foto" : "View photo");
  // Prefer the job-title line of the caption, never the media `alt` column,
  // which on demos is often a person name (see gridline G10/G11 tests).
  const alt = title || portfolioPhotoFallbackAlt(locale ?? (es ? "es" : "en"));
  const hint = captionHint ? (
    <small className="sb-portfolio-cap-hint" style={{ display: "block", opacity: 0.6, fontSize: "0.8em" }}>
      {captionHint}
    </small>
  ) : null;
  return (
    <figure className="sb-wo-job" data-portfolio-media={shot.id}>
      <PortfolioShotLink
        shotId={shot.id}
        className="sb-wo-shot"
        ariaLabel={`${es ? "Ver foto" : "View photo"} ${gallery.index + 1}: ${label}`}
        lightbox={{
          gallery,
          bookLabel: es ? "Reservar este look" : "Book this look",
          closeLabel: es ? "Cerrar" : "Close",
          prevLabel: es ? "Foto anterior" : "Previous photo",
          nextLabel: es ? "Foto siguiente" : "Next photo",
          ...(generalIntent ? { generalBook: { label: generalBookLabel(es), intent: generalIntent } } : {}),
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- public CDN URLs, same as the other portfolio layouts */}
        <img src={shot.url} alt={alt} loading="lazy" decoding="async" />
      </PortfolioShotLink>
      {title ? (
        <figcaption>
          <b>{title}</b>
          {detail}
          {hint}
        </figcaption>
      ) : null}
    </figure>
  );
}
