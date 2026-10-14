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
  servicePageCopy,
  serviceSlug,
  type ServicePageOffering,
} from "@/lib/talent-site/service-page";

import type { MaxSiteSeo } from "./render-max-site";

const INK = "var(--token-color-ink, CanvasText)";
const SOFT = "color-mix(in srgb, var(--token-color-ink, CanvasText) 66%, var(--token-color-background, Canvas))";

function priceLine(o: ServicePageOffering, locale: string, from: string): string | null {
  if (!o.amountCents || o.amountCents <= 0 || !o.currency) return null;
  if (o.priceDisplay !== "exact" && o.priceDisplay !== "from") return null;
  try {
    const n = new Intl.NumberFormat(locale, { style: "currency", currency: o.currency.toUpperCase() }).format(o.amountCents / 100);
    return o.priceDisplay === "from" ? `${from} ${n}` : n;
  } catch {
    return null;
  }
}

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
  opts: { locale: string; homePath: string; related?: readonly ServiceRelatedLink[]; promo?: DisplayPriceContext | null },
): ReactNode {
  const copy = servicePageCopy(opts.locale);
  const dp = servicePromoPrice(o, opts.promo);
  const price: ReactNode = dp ? (
    <PromoBadge key="price" price={dp} locale={opts.locale} prefix={o.priceDisplay === "from" ? copy.priceFrom : null} />
  ) : (
    priceLine(o, opts.locale, copy.priceFrom)
  );
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
      {o.publicCtaHidden ? null : (
        <Link
          href={serviceBookHref(o.id, opts.homePath)}
          data-talent-service-book=""
          style={{ display: "inline-block", padding: "12px 22px", border: `1px solid ${INK}`, color: INK, textDecoration: "none", fontWeight: 600 }}
        >
          {copy.book}
        </Link>
      )}
      {opts.related && opts.related.length > 0 ? (
        <nav aria-label={copy.related} data-talent-service-related="" style={{ marginTop: 40 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18, fontFamily: "var(--site-heading-font, inherit)" }}>{copy.related}</h2>
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
  ctx: { talentName: string | null; locale: string; city?: string | null },
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
    jsonLd: canonical
      ? buildServicePageJsonLd({ offering: o, canonicalUrl: canonical, talentName: ctx.talentName, inLanguage: ctx.locale })
      : undefined,
  };
}
