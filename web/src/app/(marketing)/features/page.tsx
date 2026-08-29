import type { Metadata } from "next";
import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { FeatureHubProvider } from "@/components/marketing/features/feature-hub";
import { FeaturePlateGrid } from "@/components/marketing/features/feature-plate-grid";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  allPopupPayloads,
  featureGroupLabel,
  featureGroupsInOrder,
  toPlatePayload,
} from "@/lib/marketing/features";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { breadcrumbJsonLdToString, buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-json-ld";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Everything Tulala gives you",
      es: "Todo lo que Tulala te da",
    }),
    description: pickLocale(locale, {
      en: "Website, storefront, bookings, payments, clients and support. The twenty one things you get, and how they work together.",
      es: "Sitio web, vitrina, reservas, pagos, clientes y soporte. Las veintiún cosas que recibes, y cómo funcionan juntas.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/features"),
  };
}

export default async function FeatureHubPage() {
  const locale = await getRequestLocale();
  const base = `https://${PLATFORM_BRAND.domain}`;

  const groups = featureGroupsInOrder().map(({ group, features }) => ({
    group,
    stage: featureGroupLabel(group, locale),
    features: features.map((f) => toPlatePayload(f, locale)),
  }));

  const copy = {
    eyebrow: pickLocale(locale, { en: "The platform", es: "La plataforma" }),
    title: pickLocale(locale, {
      en: "Everything you need to sell what you do",
      es: "Todo lo que necesitas para vender lo que haces",
    }),
    lede: pickLocale(locale, {
      en: "Most tools give you one piece and leave you to connect the rest. This is the whole journey, from the first page you build to the money in your account, in one place and on one login.",
      es: "La mayoría de las herramientas te da una pieza y te deja conectar el resto. Esto es el camino completo, desde la primera página que construyes hasta el dinero en tu cuenta, en un solo lugar y con una sola cuenta.",
    }),
    coming: pickLocale(locale, { en: "Coming soon", es: "Próximamente" }),
  };

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `${base}/` },
    {
      name: pickLocale(locale, { en: "Features", es: "Funciones" }),
      url: `${base}/features`,
    },
  ]);

  return (
    <FeatureHubProvider payloads={allPopupPayloads(locale)} locale={locale}>
      {breadcrumb ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumb) }}
        />
      ) : null}

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
            {copy.eyebrow}
          </p>
          <h1
            className="plt-display mt-3 max-w-3xl"
            style={{
              fontSize: "clamp(2.1rem, 6vw, 3.5rem)",
              lineHeight: 1.04,
              color: "var(--plt-ink)",
            }}
          >
            {copy.title}
          </h1>
          <p
            className="plt-body mt-5 max-w-2xl"
            style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
          >
            {copy.lede}
          </p>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <FeaturePlateGrid groups={groups} locale={locale} comingLabel={copy.coming} />
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </FeatureHubProvider>
  );
}
