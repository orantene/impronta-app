/**
 * The body of a business service page (TUL-1272 #5). Server component, paints
 * from the site's theme tokens only. 390 px: one column, photos scroll
 * sideways, a sticky booking bar. Desktop: content column + a sticky booking
 * panel on the right. The booking panel is the protected part (price, CTA,
 * policies): C6 lets a site restyle the page around it, never remove it.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { SaveServiceButton } from "@/components/client-account/SaveServiceButton";
import type { ServiceFaqItem } from "@/lib/talent-site/service-page-faq";
import { serviceFaqCopy } from "@/lib/talent-site/service-page-faq";
import { datedAnchorHref, DATED_STEP_ANCHOR_ID } from "@/lib/sessions/dated-mount";
import type { BusinessServiceFacts } from "@/lib/services/business-pages/page-model";
import { businessServicePageCopy } from "@/lib/services/business-pages/page-model";

const INK = "var(--token-color-ink, CanvasText)";
const BG = "var(--token-color-background, Canvas)";
const SOFT = `color-mix(in srgb, ${INK} 66%, ${BG})`;
const LINE = `color-mix(in srgb, ${INK} 14%, transparent)`;

export const BUSINESS_SERVICE_PAGE_CSS = `
.bsp { box-sizing: border-box; max-width: 1080px; margin: 0 auto; padding: 32px 16px 120px; color: ${INK}; font-family: var(--site-body-font, inherit); line-height: 1.6; }
.bsp-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
.bsp-back { margin: 0 0 16px; font-size: 14px; }
.bsp-back a { color: inherit; text-underline-offset: 3px; }
.bsp h1 { margin: 0 0 8px; font-family: var(--site-heading-font, inherit); font-size: 30px; line-height: 1.15; }
.bsp-save { margin: 0 0 12px; }
.bsp-facts { margin: 0 0 20px; color: ${SOFT}; }
.bsp-photos { display: flex; gap: 8px; margin: 0 0 24px; overflow-x: auto; scroll-snap-type: x mandatory; }
.bsp-photos img { flex: none; width: 78%; max-width: 420px; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 12px; scroll-snap-align: start; }
.bsp-photos img:only-child { width: 100%; max-width: none; aspect-ratio: 16 / 10; }
.bsp-desc { margin: 0 0 24px; white-space: pre-line; }
.bsp h2 { margin: 28px 0 10px; font-size: 18px; font-family: var(--site-heading-font, inherit); }
.bsp details { border-top: 1px solid ${LINE}; padding: 12px 0; }
.bsp summary { cursor: pointer; font-weight: 600; }
.bsp details p { margin: 8px 0 0; color: ${SOFT}; white-space: pre-line; }
.bsp-panel { border: 1px solid ${LINE}; border-radius: 16px; padding: 20px; background: ${BG}; }
.bsp-price { margin: 0 0 4px; font-size: 22px; font-weight: 600; }
.bsp-panel ul { margin: 12px 0 16px; padding-left: 18px; color: ${SOFT}; }
.bsp-book { display: inline-block; padding: 12px 22px; border-radius: var(--token-button-radius, 999px); background: ${INK}; color: ${BG}; font-weight: 600; text-decoration: none; }
.bsp-sticky { position: fixed; left: 0; right: 0; bottom: 0; z-index: 80; display: flex; align-items: center; justify-content: space-between; gap: 12px; box-sizing: border-box; min-height: 64px; padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); background: ${BG}; border-top: 1px solid ${LINE}; }
@media (min-width: 900px) {
  .bsp { padding: 48px 24px 64px; }
  .bsp-grid { grid-template-columns: minmax(0, 1fr) 340px; gap: 40px; align-items: start; }
  .bsp-panel { position: sticky; top: 96px; }
  .bsp-sticky { display: none; }
  .bsp h1 { font-size: 38px; }
}
`;

export function BusinessServiceView(props: {
  locale: string;
  title: string;
  description: string;
  facts: BusinessServiceFacts;
  faq: readonly ServiceFaqItem[];
  homeHref: string;
  bookHref: string | null;
  /** The dated booking step (TUL-1411). Replaces the generic link inside the booking panel. */
  bookingSlot?: ReactNode;
  /** TUL-1463: the save (heart) button for this service; null when the client account is off on this host. */
  saveOfferingId?: string | null;
}) {
  const c = businessServicePageCopy(props.locale);
  const { facts } = props;
  const price = facts.priceText ?? facts.priceNote;
  const line = [facts.categoryLabel, price, facts.durationText].filter(Boolean).join(" · ");
  return (
    <article className="bsp" lang={props.locale} data-business-service-page="">
      <style>{BUSINESS_SERVICE_PAGE_CSS}</style>
      <p className="bsp-back">
        <Link href={props.homeHref}>{c.back}</Link>
      </p>
      <div className="bsp-grid">
        <div>
          <h1>{props.title}</h1>
          {props.saveOfferingId ? (
            <p className="bsp-save">
              <SaveServiceButton offeringId={props.saveOfferingId} title={props.title} locale={props.locale} showLabel />
            </p>
          ) : null}
          {line ? <p className="bsp-facts">{line}</p> : null}
          {facts.photos.length > 0 ? (
            <div className="bsp-photos" role="group" aria-label={c.photos}>
              {facts.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={i === 0 ? props.title : `${props.title} (${i + 1})`} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
              ))}
            </div>
          ) : null}
          {props.description ? <p className="bsp-desc">{props.description}</p> : null}
          {props.faq.length > 0 ? (
            <section>
              <h2>{serviceFaqCopy(props.locale).heading}</h2>
              {props.faq.map((f) => (
                <details key={f.question}>
                  <summary>{f.question}</summary>
                  <p>{f.answer}</p>
                </details>
              ))}
            </section>
          ) : null}
        </div>
        <aside className="bsp-panel" data-business-service-booking="" aria-label={facts.ctaLabel}>
          {price ? <p className="bsp-price">{price}</p> : null}
          {facts.durationText ? <p className="bsp-facts">{facts.durationText}</p> : null}
          {facts.policies.length > 0 ? (
            <ul aria-label={c.policies}>
              {facts.policies.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {props.bookHref && props.bookingSlot ? (
            <div id={DATED_STEP_ANCHOR_ID}>{props.bookingSlot}</div>
          ) : props.bookHref ? (
            <a className="bsp-book" href={props.bookHref} rel="nofollow">
              {facts.ctaLabel}
            </a>
          ) : null}
        </aside>
      </div>
      {props.bookHref ? (
        <div className="bsp-sticky">
          <span style={{ fontWeight: 600, minWidth: 0 }}>{price ?? ""}</span>
          <a className="bsp-book" href={props.bookingSlot ? datedAnchorHref() : props.bookHref} rel={props.bookingSlot ? undefined : "nofollow"}>
            {facts.ctaLabel}
          </a>
        </div>
      ) : null}
    </article>
  );
}
