import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";
import { getHelpArticle, HELP_ARTICLES } from "@/lib/support/help-articles";

/**
 * TUL-1392: how-to articles for the first Edition pillars. The text is the same
 * corpus the support assistant reads (lib/support/help-articles.ts), in ES and EN.
 */

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const article = getHelpArticle(slug, locale);
  if (!article) return { title: "Help · Tulala" };
  return {
    title: `${article.title} · Tulala`,
    description: article.summary,
    ...buildMarketingLocaleAlternates(locale, `/help/articles/${slug}`),
  };
}

export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const article = getHelpArticle(slug, locale);
  if (!article) notFound();
  const es = locale === "es";

  return (
    <MarketingSection spacing="tight">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-3xl">
          <Link
            href={withLocaleHref("/help", locale)}
            className="plt-body underline underline-offset-2"
            style={{ fontSize: "0.875rem", color: "var(--plt-forest)" }}
          >
            {es ? "← Toda la ayuda" : "← All help"}
          </Link>
          <h1
            className="plt-display mt-4"
            style={{ fontSize: "clamp(1.75rem, 4.5vw, 2.5rem)", lineHeight: 1.1, color: "var(--plt-ink)" }}
          >
            {article.title}
          </h1>
          <p
            className="plt-body mt-4"
            style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
          >
            {article.summary}
          </p>

          {article.sections.map((s) => (
            <section key={s.key} className="mt-10">
              <h2 className="plt-display" style={{ fontSize: "1.25rem", color: "var(--plt-ink)" }}>
                {s.category}
              </h2>
              <p
                className="plt-body mt-2"
                style={{ fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
              >
                {s.purpose}
              </p>
              <h3 className="plt-body mt-5" style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--plt-ink)" }}>
                {es ? "Qué puedes hacer" : "What you can do"}
              </h3>
              <ul
                className="plt-body mt-2 list-disc pl-5"
                style={{ fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
              >
                {s.youCanHere.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {s.faqs.length > 0 ? (
                <div className="mt-6 flex flex-col gap-4">
                  {s.faqs.map((f) => (
                    <div
                      key={f.q}
                      className="rounded-[14px] p-5"
                      style={{ background: "var(--plt-bg-raised)", border: "1px solid var(--plt-hairline)" }}
                    >
                      <h3 className="plt-body" style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--plt-ink)" }}>
                        {f.q}
                      </h3>
                      <p
                        className="plt-body mt-2"
                        style={{ fontSize: "0.9375rem", lineHeight: 1.65, color: "var(--plt-ink-soft)" }}
                      >
                        {f.a}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ))}

          <p className="plt-body mt-12" style={{ fontSize: "0.9375rem", color: "var(--plt-ink-soft)" }}>
            {es ? "¿No lo encuentras? " : "Cannot find it? "}
            <Link
              href={withLocaleHref("/contact", locale)}
              className="underline underline-offset-2"
              style={{ color: "var(--plt-forest)" }}
            >
              {es ? "Escríbenos" : "Write to us"}
            </Link>
            .
          </p>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
