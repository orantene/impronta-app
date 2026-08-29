import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  FEATURE_GROUP_ORDER,
  featureGroupLabel,
  featuresForHomeSection,
  toPlatePayload,
  type FeatureGroup,
} from "@/lib/marketing/features";
import { FeaturePlateGrid, type PlateGroup } from "./feature-plate-grid";

/**
 * The two feature sections on the homepage.
 *
 * The split is the owner's: the first twelve features, then the rest, with
 * Premium Support closing BOTH. Support appearing twice is deliberate. It is
 * the promise behind every other card, and the one thing a competitor cannot
 * copy by shipping a feature.
 *
 * Both sections render inside the page's `FeatureHubProvider`, so a card here
 * opens the same popup as a card anywhere else.
 */

function bandsFor(section: "one" | "two", locale: string): PlateGroup[] {
  const features = featuresForHomeSection(section);
  const byGroup = new Map<FeatureGroup, PlateGroup>();
  for (const feature of features) {
    const existing = byGroup.get(feature.group);
    const plate = toPlatePayload(feature, locale);
    if (existing) existing.features.push(plate);
    else {
      byGroup.set(feature.group, {
        group: feature.group,
        stage: featureGroupLabel(feature.group, locale),
        features: [plate],
      });
    }
  }
  // Keep the lifecycle order. It is the story the page tells.
  return FEATURE_GROUP_ORDER.map((g) => byGroup.get(g)).filter(
    (b): b is PlateGroup => Boolean(b),
  );
}

export function HomeFeatureSectionOne({ locale }: { locale: string }) {
  const copy = {
    eyebrow: pickLocale(locale, { en: "What you get", es: "Lo que recibes" }),
    title: pickLocale(locale, {
      en: "Build it, get found, get booked",
      es: "Constrúyelo, que te encuentren, que te reserven",
    }),
    lede: pickLocale(locale, {
      en: "The first half of the journey. Everything you need to exist online properly and turn attention into work on your calendar.",
      es: "La primera mitad del camino. Todo lo que necesitas para existir bien en línea y convertir la atención en trabajo en tu calendario.",
    }),
    coming: pickLocale(locale, { en: "Coming soon", es: "Próximamente" }),
  };

  return (
    <MarketingSection spacing="default">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-3xl text-center">
          <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
            {copy.eyebrow}
          </p>
          <h2
            className="plt-display mt-4"
            style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", lineHeight: 1.06, color: "var(--plt-ink)" }}
          >
            {copy.title}
          </h2>
          <p
            className="plt-body mx-auto mt-4 max-w-2xl"
            style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
          >
            {copy.lede}
          </p>
        </div>
        <div className="mt-12">
          <FeaturePlateGrid
            groups={bandsFor("one", locale)}
            locale={locale}
            comingLabel={copy.coming}
          />
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

export function HomeFeatureSectionTwo({ locale }: { locale: string }) {
  const copy = {
    eyebrow: pickLocale(locale, { en: "And then", es: "Y después" }),
    title: pickLocale(locale, {
      en: "Get paid, and run the business",
      es: "Cobra, y opera el negocio",
    }),
    lede: pickLocale(locale, {
      en: "The half most tools leave you to solve alone. Money that reaches your bank, and the machinery that keeps a business running once the work starts arriving.",
      es: "La mitad que casi todas las herramientas te dejan resolver sola. Dinero que llega a tu banco, y la maquinaria que mantiene el negocio andando cuando el trabajo empieza a llegar.",
    }),
    all: pickLocale(locale, { en: "See all features", es: "Ver todas las funciones" }),
    coming: pickLocale(locale, { en: "Coming soon", es: "Próximamente" }),
  };

  return (
    <MarketingSection spacing="default" style={{ background: "var(--plt-bg-raised)" }}>
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-3xl text-center">
          <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
            {copy.eyebrow}
          </p>
          <h2
            className="plt-display mt-4"
            style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", lineHeight: 1.06, color: "var(--plt-ink)" }}
          >
            {copy.title}
          </h2>
          <p
            className="plt-body mx-auto mt-4 max-w-2xl"
            style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
          >
            {copy.lede}
          </p>
        </div>
        <div className="mt-12">
          <FeaturePlateGrid
            groups={bandsFor("two", locale)}
            locale={locale}
            comingLabel={copy.coming}
          />
        </div>
        <div className="mt-12 flex justify-center">
          <MarketingCta href={withLocaleHref("/features", locale)} size="md" eventSource="home" eventIntent="feature-hub">
            {copy.all}
          </MarketingCta>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
