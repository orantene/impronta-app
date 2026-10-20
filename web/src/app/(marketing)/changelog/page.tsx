import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  changelogPublicLaunch,
  changelogRobots,
  visibleChangelogPosts,
} from "@/lib/marketing/changelog";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

// The switch is an env read; never bake it in at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const alternates = buildMarketingLocaleAlternates(locale, "/changelog");
  return {
    title: pickLocale(locale, { en: "Changelog", es: "Registro de cambios" }),
    description: pickLocale(locale, {
      en: "What we shipped, in plain language.",
      es: "Lo que publicamos, en lenguaje simple.",
    }),
    ...alternates,
    robots: changelogRobots(changelogPublicLaunch()),
  };
}

export default async function ChangelogPage() {
  // Off must equal today: the route does not exist until launch.
  if (!changelogPublicLaunch()) notFound();
  const locale = await getRequestLocale();
  const posts = visibleChangelogPosts(true);
  const loc = locale === "es" ? "es" : "en";
  return (
    <>
      <SimplePageHero
        eyebrow={pickLocale(locale, { en: "Changelog", es: "Cambios" })}
        title={pickLocale(locale, { en: "What we shipped", es: "Lo que publicamos" })}
        subtitle={pickLocale(locale, {
          en: "Short, plain notes on every release.",
          es: "Notas breves y claras de cada versión.",
        })}
        sourcePage="changelog"
      />
      <MarketingSection>
        <MarketingContainer size="wide">
          {posts.map((post) => (
            <article key={post.slug} className="mx-auto max-w-3xl">
              <time dateTime={post.date}>{post.date}</time>
              <h2>{post.copy[loc].title}</h2>
              {post.copy[loc].body.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </article>
          ))}
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}
