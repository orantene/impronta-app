import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * Platform-level JSON-LD for the Tulala marketing surface.
 *
 * Emits a single @graph with three cross-linked nodes:
 *   - Organization  (entity identity for Tulala)
 *   - WebSite       (bilingual EN/ES marketing site)
 *   - SoftwareApplication (the product, BusinessApplication)
 *
 * Deliberate omissions (do NOT re-add without real data):
 *   - Organization.sameAs        — no verified owned social profiles exist
 *     (the footer icons link to bare instagram.com / x.com / linkedin.com
 *     roots, not real Tulala accounts).
 *   - WebSite.potentialAction     — no public site-search endpoint exists.
 *   - SoftwareApplication.offers  — marketing prices are DB-driven and
 *     currency-localized at request time (loadMarketingTiers), so no fixed
 *     price can be truthfully asserted here.
 *
 * Mounted on the platform/marketing surface only (never on tenant/agency
 * storefront hosts, where the Organization would be the wrong entity).
 */
export function PlatformJsonLd() {
  const origin = `https://${PLATFORM_BRAND.domain}`;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: PLATFORM_BRAND.name,
        legalName: PLATFORM_BRAND.legalName,
        url: origin,
        logo: {
          "@type": "ImageObject",
          url: `${origin}/brand/tulala-mark-512.png`,
          width: 512,
          height: 512,
        },
        description: "The Commerce Platform for Talent",
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: PLATFORM_BRAND.name,
        url: origin,
        inLanguage: ["en", "es"],
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#software`,
        name: PLATFORM_BRAND.name,
        url: origin,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "The Commerce Platform for Talent. Independent operators, agencies, and staffing networks run a branded storefront, a booking pipeline, and a shared discovery network.",
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe inside a script tag; escape the
      // sequence "</" defensively so a future string value can never break
      // out of the <script> element.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
