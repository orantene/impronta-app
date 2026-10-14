/**
 * TUL-586: the `<main>` of a talent service page, for `renderMaxSiteDocument`. Same seam as
 * `policy-main.tsx`: the site shell and theme wrap it, only the body swaps, and it paints from
 * the site's theme tokens only.
 */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import {
  buildServicePageJsonLd,
  pickRelatedServices,
  serviceBackHref,
  serviceBookHref,
  serviceMetaText,
  servicePriceLine as priceLine,
  servicePageCopy,
  serviceSlug,
  type ServicePageOffering,
} from "@/lib/talent-site/service-page";

import { buildServiceFaqJsonLd, serviceFaqCopy, type ServiceFaqItem } from "@/lib/talent-site/service-page-faq";

import type { MaxSiteSeo } from "./render-max-site";

const INK = "var(--token-color-ink, CanvasText)";
const SOFT = "color-mix(in srgb, var(--token-color-ink, CanvasText) 66%, var(--token-color-background, Canvas))";

const H2: CSSProperties = { margin: "0 0 12px", fontSize: 18, fontFamily: "var(--site-heading-font, inherit)" };

/** TUL-795: phone sticky bar (hidden at >=640px and height-reserved by FLOATING_CHROME_STACK_CSS). */
const STICKY: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 80,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  boxSizing: "border-box",
  minHeight: 64,
  padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
  background: "var(--token-color-background, Canvas)",
  borderTop: `1px solid color-mix(in srgb, ${INK} 18%, transparent)`,
  color: INK,
};
const STICKY_BTN: CSSProperties = {
  padding: "11px 22px",
  background: INK,
  color: "var(--token-color-background, Canvas)",
  textDecoration: "none",
  fontWeight: 600,
  borderRadius: "var(--token-button-radius, 999px)",
  whiteSpace: "nowrap",
};


export type ServiceRelatedLink = { title: string; href: string; facts: string };

/** Related-service links: slug from the primary-language title (shared by both hreflang pair), text in the page language. */
export function serviceRelatedLinks(
  offerings: readonly ServicePageOffering[],
  primaryOfferings: readonly ServicePageOffering[] | null,
  currentId: string,
  locale: string,
  hrefFor: (slugPath: string) => string,
): ServiceRelatedLink[] {
  const copy = servicePageCopy(locale);
  return pickRelatedServices(offerings, currentId).map((r) => {
    const slugRow = (primaryOfferings ?? offerings).find((x) => x.id === r.id) ?? r;
    return {
      title: r.title,
      href: hrefFor(`/${serviceSlug(slugRow)}`),
      facts: [priceLine(r, locale, copy.priceFrom), r.durationMinutes ? copy.minutes(r.durationMinutes) : null].filter(Boolean).join(" · "),
    };
  });
}

export function serviceMainNode(
  o: ServicePageOffering,
  opts: { locale: string; homePath: string; related?: readonly ServiceRelatedLink[]; faq?: readonly ServiceFaqItem[] },
): ReactNode {
  const copy = servicePageCopy(opts.locale);
  const price = priceLine(o, opts.locale, copy.priceFrom);
  const facts = [
    o.categoryLabel ?? o.category ?? null,
    price,
    o.durationMinutes ? copy.minutes(o.durationMinutes) : null,
    o.cancellationHours && o.cancellationHours > 0 ? copy.freeCancel(o.cancellationHours) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const wrap: CSSProperties = {
    maxWidth: 760,
    margin: "0 auto",
    padding: "48px 20px 56px",
    width: "100%",
    boxSizing: "border-box",
    color: INK,
    fontFamily: "var(--site-body-font, inherit)",
    lineHeight: 1.6,
  };
  return (
    <article data-talent-service-page="" lang={opts.locale} style={wrap}>
      <p style={{ margin: "0 0 18px", fontSize: 14 }}>
        <Link href={serviceBackHref(opts.homePath)} style={{ color: INK, textUnderlineOffset: 3 }}>{copy.back}</Link>
      </p>
      <h1 style={{ margin: "0 0 8px", fontFamily: "var(--site-heading-font, inherit)", lineHeight: 1.15 }}>{o.title}</h1>
      {facts ? <p style={{ margin: "0 0 20px", color: SOFT }}>{facts}</p> : null}
      {o.description ? <p style={{ margin: "0 0 28px", whiteSpace: "pre-line" }}>{o.description}</p> : null}
      {o.publicCtaHidden ? null : (
        <Link
          href={serviceBookHref(o.id, opts.homePath)}
          data-talent-service-book=""
          style={{ display: "inline-block", padding: "12px 22px", border: `1px solid ${INK}`, color: INK, textDecoration: "none", fontWeight: 600 }}
        >
          {copy.book}
        </Link>
      )}
      {opts.faq && opts.faq.length > 0 ? (
        <section data-talent-service-faq="" style={{ marginTop: 40 }}>
          <h2 style={H2}>{serviceFaqCopy(opts.locale).heading}</h2>
          {opts.faq.map((f) => (
            <details key={f.question} style={{ borderTop: `1px solid color-mix(in srgb, ${INK} 14%, transparent)`, padding: "12px 0" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{f.question}</summary>
              <p style={{ margin: "8px 0 0", whiteSpace: "pre-line", color: SOFT }}>{f.answer}</p>
            </details>
          ))}
        </section>
      ) : null}
      {o.publicCtaHidden ? null : (
        <div data-talent-service-sticky="" style={STICKY}>
          {price ? <span style={{ fontWeight: 600, minWidth: 0 }}>{price}</span> : <span />}
          <Link href={serviceBookHref(o.id, opts.homePath)} style={STICKY_BTN}>{copy.bookShort}</Link>
        </div>
      )}
      {opts.related && opts.related.length > 0 ? (
        <nav aria-label={copy.related} data-talent-service-related="" style={{ marginTop: 40 }}>
          <h2 style={H2}>{copy.related}</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {opts.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} style={{ color: INK, textUnderlineOffset: 3 }}>{r.title}</Link>
                {r.facts ? <span style={{ color: SOFT }}>{` · ${r.facts}`}</span> : null}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </article>
  );
}

/** Title, description, Service JSON-LD; canonical and hreflang stay as built for the service path. */
export function serviceSeo(
  seo: MaxSiteSeo,
  o: ServicePageOffering,
  ctx: { talentName: string | null; locale: string; city?: string | null; faq?: readonly ServiceFaqItem[] },
): MaxSiteSeo {
  const meta = serviceMetaText(o, ctx.talentName, { city: ctx.city, locale: ctx.locale });
  const canonical = seo.canonical ?? seo.alternates?.canonical;
  return {
    ...seo,
    title: meta.title,
    description: meta.description,
    ogTitle: meta.title,
    ogDescription: meta.description,
    ogImageUrl: o.imageUrls?.[0] ?? seo.ogImageUrl,
    jsonLd: canonical ? serviceJsonLd(o, canonical, ctx) : undefined,
  };
}

/** Service JSON-LD alone, or an @graph with the FAQPage when the page shows an FAQ. */
function serviceJsonLd(
  o: ServicePageOffering,
  canonical: string,
  ctx: { talentName: string | null; locale: string; faq?: readonly ServiceFaqItem[] },
): Record<string, unknown> {
  const service = buildServicePageJsonLd({ offering: o, canonicalUrl: canonical, talentName: ctx.talentName, inLanguage: ctx.locale });
  const faq = buildServiceFaqJsonLd(ctx.faq ?? [], canonical);
  if (!faq) return service;
  const { "@context": ctxUrl, ...serviceNode } = service;
  return { "@context": ctxUrl, "@graph": [serviceNode, faq] };
}
