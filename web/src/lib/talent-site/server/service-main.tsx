/**
 * TUL-586: the `<main>` of a talent service page, for `renderMaxSiteDocument`. Same seam as
 * `policy-main.tsx`: the site shell and theme wrap it, only the body swaps, and it paints from
 * the site's theme tokens only.
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";

import { PromoBadge, promoPriceText } from "@/components/promos/public/promo-badge";
import { displayPrice, type DisplayPrice, type DisplayPriceContext } from "@/lib/promos/display-price";

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

import { serviceReviewsCopy, serviceReviewsJsonLd, type ServiceReviews } from "@/lib/talent-site/service-page-reviews";
import { buildServiceFaqJsonLd, serviceFaqCopy, type ServiceFaqItem } from "@/lib/talent-site/service-page-faq";

import type { MaxSiteSeo } from "./render-max-site";

const INK = "var(--token-color-ink, CanvasText)";
const SOFT = "color-mix(in srgb, var(--token-color-ink, CanvasText) 66%, var(--token-color-background, Canvas))";

export const SERVICE_PHOTO_MAX = 6;
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


/**
 * The promo-aware price (design L6: no surface renders a price itself). Null
 * when the service shows no price, or when no live promo changes it, so the
 * plain `priceLine` keeps the page looking exactly as before.
 */
export function servicePromoPrice(o: ServicePageOffering, promo: DisplayPriceContext | null | undefined): DisplayPrice | null {
  if (!promo || promo.promos.length === 0) return null;
  if (!o.amountCents || o.amountCents <= 0 || !o.currency) return null;
  if (o.priceDisplay !== "exact" && o.priceDisplay !== "from") return null;
  const dp = displayPrice({ id: o.id, list_cents: o.amountCents, currency: o.currency }, promo);
  return dp.hasPromo ? dp : null;
}

export type ServiceRelatedLink = { title: string; href: string; facts: string };

/** Related-service links: slug from the primary-language title (shared by both hreflang pair), text in the page language. */
export function serviceRelatedLinks(
  offerings: readonly ServicePageOffering[],
  primaryOfferings: readonly ServicePageOffering[] | null,
  currentId: string,
  locale: string,
  hrefFor: (slugPath: string) => string,
  promo?: DisplayPriceContext | null,
): ServiceRelatedLink[] {
  const copy = servicePageCopy(locale);
  return pickRelatedServices(offerings, currentId).map((r) => {
    const slugRow = (primaryOfferings ?? offerings).find((x) => x.id === r.id) ?? r;
    const dp = servicePromoPrice(r, promo);
    const price = dp ? promoPriceText(dp, locale, r.priceDisplay === "from" ? copy.priceFrom : null) : priceLine(r, locale, copy.priceFrom);
    return {
      title: r.title,
      href: hrefFor(`/${serviceSlug(slugRow)}`),
      facts: [price, r.durationMinutes ? copy.minutes(r.durationMinutes) : null].filter(Boolean).join(" · "),
    };
  });
}

export function serviceMainNode(
  o: ServicePageOffering,
  opts: {
    locale: string;
    homePath: string;
    related?: readonly ServiceRelatedLink[];
    faq?: readonly ServiceFaqItem[];
    reviews?: ServiceReviews | null;
    promo?: DisplayPriceContext | null;
  },
): ReactNode {
  const copy = servicePageCopy(opts.locale);
  const dp = servicePromoPrice(o, opts.promo);
  const price: ReactNode = dp ? (
    <PromoBadge key="price" price={dp} locale={opts.locale} prefix={o.priceDisplay === "from" ? copy.priceFrom : null} />
  ) : (
    priceLine(o, opts.locale, copy.priceFrom)
  );
  // The service's own photos (talent_offering_media, the same link the gallery uses); none -> no block.
  const photos = [...new Set((o.imageUrls ?? []).filter((u) => typeof u === "string" && u.trim() !== ""))].slice(0, SERVICE_PHOTO_MAX);
  const parts: ReactNode[] = [
    o.categoryLabel ?? o.category ?? null,
    price,
    o.durationMinutes ? copy.minutes(o.durationMinutes) : null,
    o.cancellationHours && o.cancellationHours > 0 ? copy.freeCancel(o.cancellationHours) : null,
  ].filter(Boolean);
  // No live promo: the same plain string as before. A promo: the same order, one node swapped.
  const facts: ReactNode = dp
    ? parts.map((p, i) => <Fragment key={i}>{i > 0 ? " · " : null}{p}</Fragment>)
    : parts.join(" · ");
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
      {photos.length > 0 ? (
        <div data-talent-service-photos="" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, margin: "0 0 28px" }}>
          {photos.map((src, i) => (
            <img key={src} src={src} alt={i === 0 ? o.title : `${o.title} (${i + 1})`} loading={i === 0 ? "eager" : "lazy"} decoding="async" style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", display: "block" }} />
          ))}
        </div>
      ) : null}
      {o.publicCtaHidden ? null : (
        <Link
          href={serviceBookHref(o.id, opts.homePath)}
          data-talent-service-book=""
          style={{ display: "inline-block", padding: "12px 22px", border: `1px solid ${INK}`, color: INK, textDecoration: "none", fontWeight: 600 }}
        >
          {copy.book}
        </Link>
      )}
      {opts.reviews ? reviewsNode(opts.reviews, opts.locale) : null}
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

function reviewsNode(r: ServiceReviews, locale: string): ReactNode {
  const c = serviceReviewsCopy(locale);
  const avg = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(r.average);
  return (
    <section data-talent-service-reviews="" style={{ marginTop: 40 }}>
      <h2 style={H2}>{c.heading}</h2>
      {r.count > 0 ? <p data-talent-service-rating="" style={{ margin: "0 0 12px", fontWeight: 600 }}>{`★ ${avg} · ${c.count(r.count)}`}</p> : null}
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 16 }}>
        {r.reviews.map((x) => (
          <li key={x.id}>
            <p style={{ margin: 0 }} aria-label={`${x.rating}/5`}>{"★".repeat(Math.max(0, Math.min(5, Math.round(x.rating))))}</p>
            <blockquote style={{ margin: "4px 0", whiteSpace: "pre-line" }}>{x.body}</blockquote>
            <p style={{ margin: 0, color: SOFT, fontSize: 14 }}>{[x.clientName ?? c.anonymous, x.demo ? c.demo : null].filter(Boolean).join(" · ")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Title, description, Service JSON-LD; canonical and hreflang stay as built for the service path. */
export function serviceSeo(
  seo: MaxSiteSeo,
  o: ServicePageOffering,
  ctx: { talentName: string | null; locale: string; city?: string | null; faq?: readonly ServiceFaqItem[]; reviews?: ServiceReviews | null; demo?: boolean },
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
  ctx: { talentName: string | null; locale: string; faq?: readonly ServiceFaqItem[]; reviews?: ServiceReviews | null; demo?: boolean },
): Record<string, unknown> {
  const service = {
    ...buildServicePageJsonLd({ offering: o, canonicalUrl: canonical, talentName: ctx.talentName, inLanguage: ctx.locale }),
    ...serviceReviewsJsonLd(ctx.reviews ?? null, ctx.demo === true),
  };
  const faq = buildServiceFaqJsonLd(ctx.faq ?? [], canonical);
  if (!faq) return service;
  const { "@context": ctxUrl, ...serviceNode } = service;
  return { "@context": ctxUrl, "@graph": [serviceNode, faq] };
}
