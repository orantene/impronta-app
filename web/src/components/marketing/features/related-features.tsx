import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  featureGroupLabel,
  featureGroupsInOrder,
  toPlatePayload,
  type FeaturePlatePayload,
} from "@/lib/marketing/features";
import { FeatureIcon } from "./feature-icons";
import { FeaturePlateGrid } from "./feature-plate-grid";

/**
 * The foot of every feature page: where next.
 *
 * Three things in order of closeness. The features most related to this one as
 * wide cards, then the whole catalogue so the page is a hub rather than a cul
 * de sac, then the documentation slot which is honestly marked as not built.
 */
export function RelatedFeatures({
  related,
  locale,
}: {
  related: { plate: FeaturePlatePayload; href: string }[];
  locale: string;
}) {
  const groups = featureGroupsInOrder().map(({ group, features }) => ({
    group,
    stage: featureGroupLabel(group, locale),
    features: features.map((f) => toPlatePayload(f, locale)),
  }));

  const t = {
    relatedTitle: pickLocale(locale, { en: "Works with", es: "Funciona con" }),
    everything: pickLocale(locale, {
      en: "Everything Tulala gives you",
      es: "Todo lo que Tulala te da",
    }),
    docsTitle: pickLocale(locale, { en: "Documentation", es: "Documentación" }),
    docsBody: pickLocale(locale, {
      en: "Step by step guides for every feature. We are writing them now.",
      es: "Guías paso a paso de cada función. Las estamos escribiendo.",
    }),
    comingSoon: pickLocale(locale, { en: "Coming soon", es: "Próximamente" }),
    coming: pickLocale(locale, { en: "Coming soon", es: "Próximamente" }),
  };

  return (
    <MarketingSection spacing="default" style={{ background: "var(--plt-bg-raised)" }}>
      <MarketingContainer size="wide">
        {related.length > 0 ? (
          <>
            <h2 className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
              {t.relatedTitle}
            </h2>
            <div
              className="mt-5 grid grid-cols-1 gap-px sm:grid-cols-2"
              style={{ background: "var(--plt-hairline)" }}
            >
              {related.map(({ plate, href }) => (
                <a
                  key={plate.key}
                  href={withLocaleHref(href, locale)}
                  className="mkt-plate group flex items-start gap-4 p-6"
                  style={{ background: "var(--plt-bg)" }}
                >
                  <span
                    aria-hidden
                    className="mkt-plate-number plt-numeral leading-none"
                    style={{ fontSize: "1.35rem", color: "var(--plt-hairline-strong)" }}
                  >
                    {String(plate.plate).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="plt-display block"
                      style={{ fontSize: "1rem", color: "var(--plt-ink)" }}
                    >
                      {plate.name}
                    </span>
                    <span
                      className="plt-display-serif mt-1 block italic"
                      style={{ fontSize: "0.875rem", color: "var(--plt-muted)" }}
                    >
                      {plate.promise}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0" style={{ color: "var(--plt-forest)" }}>
                    <FeatureIcon featureKey={plate.key} size={22} />
                  </span>
                </a>
              ))}
            </div>
          </>
        ) : null}

        <div className="mt-16">
          <h2
            className="plt-display"
            style={{ fontSize: "clamp(1.35rem, 3vw, 1.75rem)", color: "var(--plt-ink)" }}
          >
            {t.everything}
          </h2>
          <div className="mt-8">
            <FeaturePlateGrid groups={groups} locale={locale} comingLabel={t.coming} />
          </div>
        </div>

        {/* The documentation slot. A shell, and it says so. */}
        <a
          href={withLocaleHref("/docs", locale)}
          className="mkt-plate mt-12 flex items-center justify-between gap-4 p-6"
          style={{ background: "var(--plt-bg)", border: "1px solid var(--plt-hairline)" }}
        >
          <span>
            <span className="plt-display block" style={{ fontSize: "1rem", color: "var(--plt-ink)" }}>
              {t.docsTitle}
            </span>
            <span
              className="plt-body mt-1 block"
              style={{ fontSize: "0.875rem", color: "var(--plt-muted)" }}
            >
              {t.docsBody}
            </span>
          </span>
          <span
            className="shrink-0 rounded-full px-3 py-1"
            style={{
              background: "var(--tl-warning-bg)",
              color: "var(--tl-warning)",
              fontSize: "0.6875rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {t.comingSoon}
          </span>
        </a>
      </MarketingContainer>
    </MarketingSection>
  );
}
