import type { Metadata } from "next";
import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  featureGroupLabel,
  featureGroupsInOrder,
  getFeatureContent,
} from "@/lib/marketing/features";

/**
 * The documentation shell.
 *
 * Deliberately a skeleton: the sidebar shows the shape the guides will take so
 * the promise is legible, and the body says plainly that they are not written
 * yet. It is `noindex` because an empty documentation site that ranks is worse
 * than one that does not exist, and it stays out of the sitemap for the same
 * reason. The feature pages link here, so it must resolve rather than 404.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Documentation", es: "Documentación" }),
    description: pickLocale(locale, {
      en: "Step by step guides for every Tulala feature.",
      es: "Guías paso a paso de cada función de Tulala.",
    }),
    robots: { index: false, follow: true },
  };
}

export default async function DocsPage() {
  const locale = await getRequestLocale();
  const groups = featureGroupsInOrder();
  const L = (href: string) => withLocaleHref(href, locale);

  const t = {
    eyebrow: pickLocale(locale, { en: "Documentation", es: "Documentación" }),
    title: pickLocale(locale, { en: "The guides are being written", es: "Las guías se están escribiendo" }),
    lede: pickLocale(locale, {
      en: "Every feature will get a step by step guide here. Until they are ready, the feature pages carry the full explanation, and a real person will answer if you get stuck.",
      es: "Cada función va a tener aquí su guía paso a paso. Mientras están listas, las páginas de funciones llevan la explicación completa, y una persona real te responde si te atoras.",
    }),
    planned: pickLocale(locale, { en: "Planned", es: "Planeado" }),
    features: pickLocale(locale, { en: "See the features", es: "Ver las funciones" }),
    support: pickLocale(locale, { en: "Talk to a person", es: "Habla con una persona" }),
  };

  return (
    <>
      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
            {t.eyebrow}
          </p>
          <h1
            className="plt-display mt-3 max-w-3xl"
            style={{ fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 1.06, color: "var(--plt-ink)" }}
          >
            {t.title}
          </h1>
          <p
            className="plt-body mt-5 max-w-2xl"
            style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
          >
            {t.lede}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <MarketingCta href={L("/features")} size="md" eventSource="docs" eventIntent="features">
              {t.features}
            </MarketingCta>
            <MarketingCta
              href={L("/features/premium-support")}
              size="md"
              variant="secondary"
              eventSource="docs"
              eventIntent="support"
            >
              {t.support}
            </MarketingCta>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(({ group, features }) => (
              <section key={group}>
                <h2 className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
                  {featureGroupLabel(group, locale)}
                </h2>
                <ul className="mt-3 flex flex-col">
                  {features.map((f) => (
                    <li
                      key={f.key}
                      className="flex items-center justify-between gap-3 py-2"
                      style={{ borderTop: "1px solid var(--plt-hairline)" }}
                    >
                      <span
                        className="plt-body"
                        style={{ fontSize: "0.9375rem", color: "var(--plt-muted)" }}
                      >
                        {getFeatureContent(f, locale).name}
                      </span>
                      <span
                        className="shrink-0"
                        style={{
                          fontSize: "0.625rem",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--plt-muted-soft)",
                        }}
                      >
                        {t.planned}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}
