import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { MarketingCta } from "@/components/marketing/cta-link";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  featureGroupLabel,
  featureHubPathForLocale,
  featurePathForLocale,
  getFeatureByKey,
  getFeatureContent,
  toPlatePayload,
  type Feature,
} from "@/lib/marketing/features";
import { FeatureIcon } from "./feature-icons";
import { FeatureProse } from "./feature-prose";
import { FeatureSectionNav } from "./feature-section-nav";
import { RelatedFeatures } from "./related-features";

/**
 * A feature page, read as an editorial feature rather than a spec sheet.
 *
 * The prose measure stays narrow on purpose: this page exists to be read by a
 * person deciding whether to trust us with their business, and a full width
 * paragraph is the fastest way to make that person stop reading.
 *
 * Media slots are deliberately absent rather than empty. Version one ships
 * with icons and type, and a grey rectangle labelled "video coming" would say
 * the page is unfinished. Screenshots get added per feature, and the layout
 * does not change shape when they arrive.
 */
export function FeaturePageBody({ feature, locale }: { feature: Feature; locale: string }) {
  const c = getFeatureContent(feature, locale);
  const isComing = feature.status === "coming";
  const stage = featureGroupLabel(feature.group, locale);

  const t = {
    comingTitle: pickLocale(locale, {
      en: "This one is not shipped yet",
      es: "Esta función todavía no se lanza",
    }),
    comingBody: pickLocale(locale, {
      en: "It is being built. Join the waitlist and you will hear the day it opens, before it is announced anywhere else.",
      es: "Se está construyendo. Únete a la lista y te avisamos el día que abra, antes de anunciarlo en cualquier otro lado.",
    }),
    waitlistCta: pickLocale(locale, { en: "Join the waitlist", es: "Unirme a la lista" }),
    startCta: pickLocale(locale, { en: "Start free", es: "Empieza gratis" }),
    allFeatures: pickLocale(locale, { en: "All features", es: "Todas las funciones" }),
    whatYouGet: pickLocale(locale, { en: "What you get", es: "Lo que incluye" }),
    faqTitle: pickLocale(locale, { en: "Questions", es: "Preguntas" }),
    onThisPage: pickLocale(locale, { en: "On this page", es: "En esta página" }),
  };

  // Index based so the anchor survives a copy edit and is identical in both
  // languages, which keeps a shared link working across locales.
  const sectionNav = c.sections.map((section, i) => ({
    id: `s-${i + 1}`,
    heading: section.heading,
  }));

  return (
    <>
      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          {/* Breadcrumb back to the hub, so a page is never a dead end. */}
          <a
            href={withLocaleHref(featureHubPathForLocale(locale), locale)}
            className="plt-eyebrow inline-flex items-center gap-2"
            style={{ color: "var(--plt-muted)" }}
          >
            <span aria-hidden>&larr;</span>
            {t.allFeatures}
          </a>

          <div className="mt-8 flex items-start gap-6">
            <span className="inline-flex shrink-0" style={{ color: "var(--plt-forest)" }}>
              <FeatureIcon featureKey={feature.key} size={60} strokeWidth={1.25} />
            </span>
            <div className="min-w-0">
              <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
                {stage}
              </p>
              <h1
                className="plt-display mt-2"
                style={{
                  fontSize: "clamp(2rem, 5.5vw, 3.25rem)",
                  lineHeight: 1.05,
                  color: "var(--plt-ink)",
                }}
              >
                {c.title}
              </h1>
              <p
                className="plt-display-serif mt-4 italic"
                style={{ fontSize: "clamp(1.05rem, 2.4vw, 1.35rem)", color: "var(--plt-forest)" }}
              >
                {c.promise}
              </p>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-5">
            <MarketingCta
              href={withLocaleHref(
                isComing ? `/waitlist?feature=${feature.key}` : "/get-started",
                locale,
              )}
              size="md"
              eventSource={`feature:${feature.key}`}
              eventIntent={isComing ? "waitlist" : "signup"}
            >
              {isComing ? t.waitlistCta : t.startCta}
            </MarketingCta>
          </div>
        </MarketingContainer>
      </MarketingSection>

      {isComing ? (
        <MarketingContainer size="wide">
          <div
            className="rounded-[var(--tl-radius-md)] px-6 py-5"
            style={{
              background: "var(--tl-warning-bg)",
              border: "1px solid var(--tl-hairline)",
            }}
          >
            <p className="plt-display" style={{ fontSize: "1rem", color: "var(--plt-ink)" }}>
              {t.comingTitle}
            </p>
            <p
              className="plt-body mt-1"
              style={{ fontSize: "0.9375rem", color: "var(--plt-ink-soft)", lineHeight: 1.6 }}
            >
              {t.comingBody}
            </p>
          </div>
        </MarketingContainer>
      ) : null}

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="gap-14 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
            {/* Sticky contents on desktop. A long page a reader cannot navigate
                is a long page they leave. */}
            <aside className="hidden lg:block">
              <FeatureSectionNav items={sectionNav} label={t.onThisPage} />
            </aside>

            <div className="max-w-2xl">
            <FeatureProse
              paras={c.intro}
              locale={locale}
              className="flex flex-col gap-4 plt-body"
              style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
            />

            <div className="mt-12 flex flex-col gap-11">
              {c.sections.map((section, i) => (
                <section key={i} id={`s-${i + 1}`} className="scroll-mt-28">
                  <h2
                    className="plt-display"
                    style={{ fontSize: "clamp(1.25rem, 3vw, 1.6rem)", color: "var(--plt-ink)" }}
                  >
                    {section.heading}
                  </h2>
                  <FeatureProse
                    paras={section.body}
                    locale={locale}
                    className="mt-3 flex flex-col gap-3 plt-body"
                    style={{ fontSize: "1rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
                  />
                </section>
              ))}
            </div>

            {c.highlights.length > 0 ? (
              <div className="mt-14">
                <h2 className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
                  {t.whatYouGet}
                </h2>
                <ul className="mt-4 flex flex-col">
                  {c.highlights.map((h, i) => (
                    <li
                      key={i}
                      className="plt-body py-3"
                      style={{
                        borderTop: "1px solid var(--plt-hairline)",
                        fontSize: "0.9375rem",
                        color: "var(--plt-ink-soft)",
                      }}
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {c.faq.length > 0 ? (
              <div className="mt-14">
                <h2 className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
                  {t.faqTitle}
                </h2>
                <div className="mt-4 flex flex-col">
                  {c.faq.map((item, i) => (
                    <div
                      key={i}
                      className="py-5"
                      style={{ borderTop: "1px solid var(--plt-hairline)" }}
                    >
                      <h3
                        className="plt-display"
                        style={{ fontSize: "1rem", color: "var(--plt-ink)" }}
                      >
                        {item.q}
                      </h3>
                      <p
                        className="plt-body mt-2"
                        style={{
                          fontSize: "0.9375rem",
                          lineHeight: 1.65,
                          color: "var(--plt-ink-soft)",
                        }}
                      >
                        {item.a}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <RelatedFeatures
        related={feature.related
          .map((key) => getFeatureByKey(key))
          .filter((f): f is Feature => Boolean(f))
          .map((f) => ({
            plate: toPlatePayload(f, locale),
            href: featurePathForLocale(f, locale),
          }))}
        locale={locale}
      />

      <FinalCtaSection />
    </>
  );
}
