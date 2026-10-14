/**
 * TUL-586: the `<main>` of a talent service page, for `renderMaxSiteDocument`. Same seam as
 * `policy-main.tsx`: the site shell and theme wrap it, only the body swaps, and it paints from
 * the site's theme tokens only.
 */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import {
  buildServicePageJsonLd,
  serviceBookHref,
  serviceMetaText,
  servicePageCopy,
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

export function serviceMainNode(o: ServicePageOffering, opts: { locale: string; homePath: string }): ReactNode {
  const copy = servicePageCopy(opts.locale);
  const price = priceLine(o, opts.locale, copy.priceFrom);
  const facts = [price, o.durationMinutes ? copy.minutes(o.durationMinutes) : null].filter(Boolean).join(" · ");
  const wrap: CSSProperties = {
    maxWidth: 760,
    margin: "0 auto",
    padding: "48px 20px 132px",
    width: "100%",
    boxSizing: "border-box",
    color: INK,
    fontFamily: "var(--site-body-font, inherit)",
    lineHeight: 1.6,
  };
  return (
    <article data-talent-service-page="" lang={opts.locale} style={wrap}>
      <p style={{ margin: "0 0 18px", fontSize: 14 }}>
        <Link href={opts.homePath} style={{ color: INK, textUnderlineOffset: 3 }}>{copy.back}</Link>
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
