import Link from "next/link";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import {
  getArticleContent,
  getResourceArticle,
  RESOURCE_ARTICLES,
  type ResourceArticle,
} from "@/lib/marketing/resources";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { EditorialFrame } from "./editorial-image";
import { FinalCtaSection } from "./final-cta-section";
import { SimplePageHero } from "./simple-page-hero";
import { SubscribeModule } from "./subscribe-module";

/**
 * Renderer for `/resources/{slug}` articles.
 *
 * Prose is constrained to a readable measure rather than the full grid: these
 * pages are read, not scanned. The FAQ block is rendered visibly because the
 * route also emits FAQPage JSON-LD from the same array.
 */
export function ResourceArticleBody({
  article,
  locale,
}: {
  article: ResourceArticle;
  locale: string;
}) {
  const c = getArticleContent(article, locale);

  const labels = pickLocale(locale, {
    en: {
      faq: "Common questions",
      more: "Keep reading",
      start: "Start free",
      glossary: "Glossary of terms",
    },
    es: {
      faq: "Preguntas frecuentes",
      more: "Sigue leyendo",
      start: "Empieza gratis",
      glossary: "Glosario de términos",
    },
  });

  const related = article.related
    .map((slug) => {
      const sibling = getResourceArticle(slug);
      if (!sibling) return null;
      return { slug, title: getArticleContent(sibling, locale).title };
    })
    .filter((x): x is { slug: string; title: string } => x !== null);

  return (
    <>
      <SimplePageHero
        eyebrow={c.eyebrow}
        title={c.title}
        subtitle={c.subtitle}
        sourcePage={`resources-${article.slug}`}
        primary={{ label: labels.start, href: "/get-started", intent: "get-started" }}
        secondary={{ label: labels.glossary, href: "/resources/glossary", intent: "glossary" }}
      />

      <MarketingSection>
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl">
            <EditorialFrame photo={article.photo} aspect="wide" size="lg" />

            <p
              className="mt-10 text-[1.0625rem] leading-[1.75] sm:text-[1.125rem]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              {c.intro}
            </p>

            {c.sections.map((section) => (
              <section key={section.heading} className="mt-12">
                <h2
                  className="text-[1.375rem] font-semibold leading-snug tracking-[-0.01em] sm:text-[1.5rem]"
                  style={{ color: "var(--plt-ink-strong)" }}
                >
                  {section.heading}
                </h2>
                {section.body.map((para) => (
                  <p
                    key={para.slice(0, 48)}
                    className="mt-4 text-[1rem] leading-[1.75]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {para}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Visible FAQ. Mirrored into FAQPage JSON-LD by the route. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl">
            <MarketingEyebrow>{labels.faq}</MarketingEyebrow>
            <dl className="mt-8">
              {c.faq.map((item) => (
                <div key={item.q} className="mt-7 first:mt-0">
                  <dt
                    className="text-[1.0625rem] font-semibold leading-snug"
                    style={{ color: "var(--plt-ink-strong)" }}
                  >
                    {item.q}
                  </dt>
                  <dd
                    className="mt-2 text-[0.9375rem] leading-[1.7]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </MarketingContainer>
      </MarketingSection>

      {related.length > 0 ? (
        <MarketingSection spacing="tight">
          <MarketingContainer size="wide">
            <div className="mx-auto max-w-2xl">
              <MarketingEyebrow>{labels.more}</MarketingEyebrow>
              <ul className="mt-6 flex flex-col gap-3">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={withLocaleHref(`/resources/${r.slug}`, locale)}
                      className="text-[1rem] leading-snug underline-offset-4 hover:underline"
                      style={{ color: "var(--plt-ink-strong)" }}
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </MarketingContainer>
        </MarketingSection>
      ) : null}

      <SubscribeModule locale={locale} source="resources-article" />

      <FinalCtaSection />
    </>
  );
}

/** Card list used by the `/resources` hub. */
export function ResourceArticleList({ locale }: { locale: string }) {
  return (
    <ul className="grid gap-6 md:grid-cols-2 md:gap-8">
      {RESOURCE_ARTICLES.map((article) => {
        const c = getArticleContent(article, locale);
        return (
          <li key={article.slug}>
            <Link
              href={withLocaleHref(`/resources/${article.slug}`, locale)}
              className="group flex h-full flex-col rounded-[22px] p-6 transition-transform duration-300 sm:p-7"
              style={{
                background: "var(--plt-bg-elevated)",
                border: "1px solid var(--plt-hairline)",
              }}
            >
              <span
                className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
                style={{ color: "var(--plt-muted)" }}
              >
                {c.eyebrow}
              </span>
              <h2
                className="mt-3 text-[1.1875rem] font-semibold leading-snug"
                style={{ color: "var(--plt-ink-strong)" }}
              >
                {c.title}
              </h2>
              <p
                className="mt-3 text-[0.9375rem] leading-[1.6]"
                style={{ color: "var(--plt-muted)" }}
              >
                {c.subtitle}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
