/**
 * Soft 404 body for a talent Max site: site shell (header/footer) wraps this
 * via `mainOverride`, same shape as policy pages. Locale-aware Mexican Spanish
 * (tú). No em dashes.
 */

import type { ReactNode } from "react";
import Link from "next/link";

import { isSpanishLocale } from "@/lib/locale-time";

import type { MaxSiteSeo } from "./max-site-seo.server";

export type Soft404Copy = {
  title: string;
  heading: string;
  body: string;
  homeCta: string;
};

export function soft404Copy(locale: string | undefined | null): Soft404Copy {
  if (isSpanishLocale(locale)) {
    return {
      title: "Página no encontrada",
      heading: "Página no encontrada",
      body: "La página que buscas no existe o puede haberse movido.",
      homeCta: "Volver al inicio",
    };
  }
  return {
    title: "Page not found",
    heading: "Page not found",
    body: "The page you're looking for doesn't exist or may have moved.",
    homeCta: "Back to home",
  };
}

/** `<main>` content only; the Max shell supplies theme, header and footer. */
export function soft404MainNode(locale: string, homeHref: string): ReactNode {
  const copy = soft404Copy(locale);
  return (
    <div
      data-talent-soft-404=""
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "72px 20px 132px",
        width: "100%",
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(1.6rem, 2.4vw, 2rem)",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
        }}
      >
        {copy.heading}
      </h1>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: "0.95rem",
          lineHeight: 1.55,
          opacity: 0.72,
        }}
      >
        {copy.body}
      </p>
      <p style={{ margin: "28px 0 0" }}>
        <Link
          href={homeHref}
          data-talent-soft-404-home=""
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 18px",
            borderRadius: 999,
            background: "var(--token-color-accent, var(--token-color-ink, #0B0B0D))",
            color: "var(--token-color-accent-on, var(--token-color-background, #fff))",
            fontSize: "0.95rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {copy.homeCta}
        </Link>
      </p>
    </div>
  );
}

/** Title + noindex; canonical/alternates stay from the home shell build. */
export function soft404Seo(seo: MaxSiteSeo, locale: string): MaxSiteSeo {
  const copy = soft404Copy(locale);
  return {
    ...seo,
    title: copy.title,
    description: undefined,
    ogTitle: copy.title,
    ogDescription: undefined,
    jsonLd: undefined,
    noindex: true,
  };
}
