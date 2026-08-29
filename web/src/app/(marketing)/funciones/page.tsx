import type { Metadata } from "next";
import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { FeatureHubProvider } from "@/components/marketing/features/feature-hub";
import { FeaturePlateGrid } from "@/components/marketing/features/feature-plate-grid";
import { withLocalePath } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  FEATURE_HUB_PATHS,
  allPopupPayloads,
  featureGroupLabel,
  featureGroupsInOrder,
  toPlatePayload,
} from "@/lib/marketing/features";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { breadcrumbJsonLdToString, buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-json-ld";
import { buildCrossSlugMarketingAlternates } from "@/lib/seo/spanish-named-routes";

/** The Spanish hub index. Pinned to Spanish by the `/funciones` prefix. */

const LOCALE = "es";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: pickLocale(LOCALE, {
      en: "Everything Tulala gives you",
      es: "Todo lo que Tulala te da",
    }),
    description: pickLocale(LOCALE, {
      en: "Website, storefront, bookings, payments, clients and support.",
      es: "Sitio web, vitrina, reservas, pagos, clientes y soporte. Las veintiún cosas que recibes, y cómo funcionan juntas.",
    }),
    ...buildCrossSlugMarketingAlternates(LOCALE, FEATURE_HUB_PATHS),
  };
}

export default async function FeatureHubPageEs() {
  const base = `https://${PLATFORM_BRAND.domain}`;

  const groups = featureGroupsInOrder().map(({ group, features }) => ({
    group,
    stage: featureGroupLabel(group, LOCALE),
    features: features.map((f) => toPlatePayload(f, LOCALE)),
  }));

  const copy = {
    eyebrow: "La plataforma",
    title: "Todo lo que necesitas para vender lo que haces",
    lede: "La mayoría de las herramientas te da una pieza y te deja conectar el resto. Esto es el camino completo, desde la primera página que construyes hasta el dinero en tu cuenta, en un solo lugar y con una sola cuenta.",
    coming: "Próximamente",
  };

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `${base}/` },
    { name: "Funciones", url: `${base}${withLocalePath("/funciones", LOCALE)}` },
  ]);

  return (
    <FeatureHubProvider payloads={allPopupPayloads(LOCALE)} locale={LOCALE}>
      {breadcrumb ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumb) }}
        />
      ) : null}

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-3xl text-center">
            <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
              {copy.eyebrow}
            </p>
            <h1
              className="plt-display mt-4"
              style={{
                fontSize: "clamp(2.1rem, 6vw, 3.5rem)",
                lineHeight: 1.04,
                color: "var(--plt-ink)",
              }}
            >
              {copy.title}
            </h1>
            <p
              className="plt-body mx-auto mt-5 max-w-2xl"
              style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
            >
              {copy.lede}
            </p>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <FeaturePlateGrid
            groups={groups}
            locale={LOCALE}
            comingLabel={copy.coming}
            showStageNav
          />
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </FeatureHubProvider>
  );
}
