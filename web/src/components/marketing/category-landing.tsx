import Link from "next/link";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import {
  getCategoryContent,
  getTalentCategory,
  TALENT_CATEGORIES,
  type TalentCategory,
} from "@/lib/marketing/talent-categories";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { EditorialFrame } from "./editorial-image";
import { FinalCtaSection } from "./final-cta-section";
import { SimplePageHero } from "./simple-page-hero";

/**
 * Renderer for the `/for/{category}` talent-category landing pages.
 *
 * One component, one content model (`lib/marketing/talent-categories.ts`), so
 * every category page has the same shape and a new category is a data entry
 * rather than a new page build. The FAQ block is rendered visibly on purpose:
 * the page also emits FAQPage JSON-LD from the same array, and Google only
 * credits FAQ markup that matches content a visitor can actually read.
 */
/**
 * Compact row of links to every talent-category page. Used on pages that
 * speak to independent talent so the category pillar is reachable from the
 * existing surface, not only from the sitemap.
 */
export function TalentCategoryLinks({ locale }: { locale: string }) {
  const labels = pickLocale(locale, {
    en: {
      eyebrow: "Built for your craft",
      sub: "The same booking flow, shaped around the work you actually do.",
    },
    es: {
      eyebrow: "Hecho para tu oficio",
      sub: "El mismo flujo de reservas, adaptado al trabajo que realmente haces.",
    },
  });

  return (
    <MarketingSection spacing="tight">
      <MarketingContainer size="wide">
        <MarketingEyebrow>{labels.eyebrow}</MarketingEyebrow>
        <p
          className="mt-3 text-[0.9375rem] leading-[1.6]"
          style={{ color: "var(--plt-muted)" }}
        >
          {labels.sub}
        </p>
        <ul className="mt-6 flex flex-wrap gap-3">
          {TALENT_CATEGORIES.map((cat) => (
            <li key={cat.slug}>
              <Link
                href={withLocaleHref(`/for/${cat.slug}`, locale)}
                className="inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] transition-colors"
                style={{
                  border: "1px solid var(--plt-hairline-strong)",
                  color: "var(--plt-ink-strong)",
                }}
              >
                {getCategoryContent(cat, locale).eyebrow}
              </Link>
            </li>
          ))}
        </ul>
      </MarketingContainer>
    </MarketingSection>
  );
}

export function CategoryLanding({
  category,
  locale,
}: {
  category: TalentCategory;
  locale: string;
}) {
  const c = getCategoryContent(category, locale);

  const labels = pickLocale(locale, {
    en: {
      how: "How a booking works",
      faq: "Common questions",
      related: "Other kinds of work",
      relatedSub: "The same booking flow, shaped around a different craft.",
      start: "Start free",
      how2: "See how it works",
    },
    es: {
      how: "Cómo funciona una reserva",
      faq: "Preguntas frecuentes",
      related: "Otros tipos de trabajo",
      relatedSub: "El mismo flujo de reservas, adaptado a otro oficio.",
      start: "Empieza gratis",
      how2: "Mira cómo funciona",
    },
  });

  const related = category.related
    .map((slug) => {
      const sibling = getTalentCategory(slug);
      if (!sibling) return null;
      return { slug, label: getCategoryContent(sibling, locale).eyebrow };
    })
    .filter((x): x is { slug: string; label: string } => x !== null);

  return (
    <>
      <SimplePageHero
        eyebrow={c.eyebrow}
        title={c.title}
        subtitle={c.subtitle}
        sourcePage={`for-${category.slug}`}
        primary={{ label: labels.start, href: "/get-started", intent: "get-started" }}
        secondary={{ label: labels.how2, href: "/how-it-works", intent: "how-it-works" }}
      />

      {/* Intro + a real editorial photo for the category. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <p
              className="text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.intro}
            </p>
            <EditorialFrame photo={category.photo} aspect="landscape" size="lg" />
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* What a booking looks like for this category. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <MarketingEyebrow>{labels.how}</MarketingEyebrow>
          <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {c.steps.map((step, i) => (
              <div key={step.title}>
                <div
                  className="plt-mono text-[0.75rem] font-semibold tracking-[0.2em]"
                  style={{ color: "var(--plt-accent, #ff8332)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3
                  className="mt-3 text-[1.125rem] font-semibold leading-snug"
                  style={{ color: "var(--plt-ink-strong)" }}
                >
                  {step.title}
                </h3>
                <p
                  className="mt-2 text-[0.9375rem] leading-[1.65]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Visible FAQ. Mirrored into FAQPage JSON-LD by the route. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <MarketingEyebrow>{labels.faq}</MarketingEyebrow>
          <dl className="mt-10 grid gap-8 md:grid-cols-2 md:gap-x-12">
            {c.faq.map((item) => (
              <div key={item.q}>
                <dt
                  className="text-[1.0625rem] font-semibold leading-snug"
                  style={{ color: "var(--plt-ink-strong)" }}
                >
                  {item.q}
                </dt>
                <dd
                  className="mt-2 text-[0.9375rem] leading-[1.65]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </MarketingContainer>
      </MarketingSection>

      {/* Sibling category links: internal linking across the pillar. */}
      {related.length > 0 ? (
        <MarketingSection spacing="tight">
          <MarketingContainer size="wide">
            <MarketingEyebrow>{labels.related}</MarketingEyebrow>
            <p
              className="mt-3 text-[0.9375rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {labels.relatedSub}
            </p>
            <ul className="mt-6 flex flex-wrap gap-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={withLocaleHref(`/for/${r.slug}`, locale)}
                    className="inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] transition-colors"
                    style={{
                      border: "1px solid var(--plt-hairline-strong)",
                      color: "var(--plt-ink-strong)",
                    }}
                  >
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </MarketingContainer>
        </MarketingSection>
      ) : null}

      <FinalCtaSection />
    </>
  );
}
