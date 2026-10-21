import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { withLocaleHref } from "@/i18n/pathnames";
import {
  categoriesOf,
  filterByCategory,
  formatEntryDate,
  isChangelogLive,
  loadChangelogRow,
  loadChangelogRows,
  shareText,
  toEntryView,
  viewEntries,
  type ChangelogEntryView,
  type ChangelogLocale,
} from "@/lib/changelog/public-read";
import { changelogOrigin } from "@/lib/changelog/request-origin";
import { publicOrigin } from "@/lib/storefront/request-context";

/**
 * Server components for tulala.digital/changelog (EN) and /es/novedades (ES)
 * (TUL-1394). Both routes render these. Reads the synced table only.
 */

async function requestOrigin(): Promise<string> {
  return changelogOrigin(await publicOrigin());
}

/** The two URL families. Index and entry paths per language. */
export function changelogPaths(locale: ChangelogLocale) {
  return locale === "es"
    ? { index: "/novedades", entry: (id: string) => `/novedades/${id}` }
    : { index: "/changelog", entry: (id: string) => `/changelog/${id}` };
}

const COPY = {
  en: {
    eyebrow: "Changelog",
    title: "What's new at Tulala",
    lede: "Every week we ship improvements for the people who use Tulala. Here is what changed and how to use it.",
    all: "All",
    empty: "Nothing published yet. Check back soon.",
    howTo: "How to use it",
    back: "← All updates",
    rss: "RSS feed",
    share: "Text to share with your clients",
    fallback: "This update is not translated yet. Showing it in Spanish.",
    status: "System status",
    support: "Support",
  },
  es: {
    eyebrow: "Novedades",
    title: "Novedades de Tulala",
    lede: "Cada semana lanzamos mejoras para quienes usan Tulala. Aquí está lo que cambió y cómo usarlo.",
    all: "Todas",
    empty: "Todavía no hay novedades publicadas. Vuelve pronto.",
    howTo: "Cómo usarlo",
    back: "← Todas las novedades",
    rss: "Feed RSS",
    share: "Texto para compartir con tus clientes",
    fallback: "Esta novedad aún no está traducida. La mostramos en inglés.",
    status: "Estado del sistema",
    support: "Soporte",
  },
} as const;

export async function changelogIndexMetadata(locale: ChangelogLocale): Promise<Metadata> {
  const c = COPY[locale];
  const launched = await isChangelogLive();
  const origin = await requestOrigin();
  return {
    title: `${c.title} · Tulala`,
    description: c.lede,
    metadataBase: new URL(origin),
    alternates: {
      canonical: locale === "es" ? "/es/novedades" : "/changelog",
      languages: { en: "/changelog", es: "/es/novedades" },
      types: { "application/rss+xml": locale === "es" ? "/es/novedades/feed.xml" : "/changelog/feed.xml" },
    },
    robots: launched ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: c.title, description: c.lede, type: "website" },
  };
}

export async function changelogEntryMetadata(id: string, locale: ChangelogLocale): Promise<Metadata> {
  const row = await loadChangelogRow(id);
  const launched = await isChangelogLive();
  const origin = await requestOrigin();
  const robots = launched ? { index: true, follow: true } : { index: false, follow: true };
  if (!row) return { title: `${COPY[locale].title} · Tulala`, robots: { index: false, follow: false } };
  const e = toEntryView(row, locale);
  return {
    title: `${e.title} · Tulala`,
    description: e.summary.slice(0, 200),
    metadataBase: new URL(origin),
    alternates: {
      canonical: locale === "es" ? `/es/novedades/${id}` : `/changelog/${id}`,
      languages: { en: `/changelog/${id}`, es: `/es/novedades/${id}` },
    },
    robots,
    openGraph: {
      title: e.title,
      description: e.summary.slice(0, 200),
      type: "article",
      ...(e.coverImageUrl ? { images: [{ url: e.coverImageUrl }] } : {}),
    },
  };
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="plt-body inline-block rounded-full px-2.5 py-0.5"
      style={{ fontSize: "0.75rem", background: "var(--plt-bg-deep)", color: "var(--plt-ink-soft)", border: "1px solid var(--plt-hairline)" }}
    >
      {children}
    </span>
  );
}

function EntryHeader({ e, locale, href }: { e: ChangelogEntryView; locale: ChangelogLocale; href?: string }) {
  const date = formatEntryDate(e.date, locale);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {date ? (
          <time dateTime={e.date ?? undefined} className="plt-body" style={{ fontSize: "0.8125rem", color: "var(--plt-muted)" }}>
            {date}
          </time>
        ) : null}
        {e.badge ? <Pill>{e.badge}</Pill> : null}
        {e.audience.map((a) => (
          <Pill key={`a-${a}`}>{a}</Pill>
        ))}
        {e.plans.map((p) => (
          <Pill key={`p-${p}`}>{p}</Pill>
        ))}
      </div>
      <h2 className="plt-display mt-2" style={{ fontSize: "1.375rem", lineHeight: 1.2, color: "var(--plt-ink)" }}>
        {href ? (
          <Link href={href} className="hover:underline">
            {e.title}
          </Link>
        ) : (
          e.title
        )}
      </h2>
    </>
  );
}

export async function ChangelogIndex({ locale, category }: { locale: ChangelogLocale; category: string | null }) {
  const c = COPY[locale];
  const paths = changelogPaths(locale);
  const all = viewEntries(await loadChangelogRows(), locale);
  const entries = filterByCategory(all, category);
  const categories = categoriesOf(all);

  return (
    <MarketingSection spacing="tight">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-3xl">
          <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
            {c.eyebrow}
          </p>
          <h1 className="plt-display mt-3" style={{ fontSize: "clamp(2rem, 5vw, 2.75rem)", lineHeight: 1.08, color: "var(--plt-ink)" }}>
            {c.title}
          </h1>
          <p className="plt-body mt-4" style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}>
            {c.lede}
          </p>
          <p className="plt-body mt-3 flex flex-wrap gap-4" style={{ fontSize: "0.875rem" }}>
            <a href={locale === "es" ? "/es/novedades/feed.xml" : "/changelog/feed.xml"} className="underline underline-offset-2" style={{ color: "var(--plt-forest)" }}>
              {c.rss}
            </a>
            <Link href={withLocaleHref("/status", locale)} className="underline underline-offset-2" style={{ color: "var(--plt-forest)" }}>
              {c.status}
            </Link>
            <Link href={withLocaleHref("/support", locale)} className="underline underline-offset-2" style={{ color: "var(--plt-forest)" }}>
              {c.support}
            </Link>
          </p>

          {categories.length > 0 ? (
            <nav className="mt-6 flex flex-wrap gap-2" aria-label={c.eyebrow}>
              <Link href={withLocaleHref(paths.index, locale)} aria-current={category ? undefined : "page"}>
                <Pill>{c.all}</Pill>
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={withLocaleHref(`${paths.index}?category=${encodeURIComponent(cat)}`, locale)}
                  aria-current={category === cat ? "page" : undefined}
                >
                  <Pill>{cat}</Pill>
                </Link>
              ))}
            </nav>
          ) : null}

          {entries.length === 0 ? (
            <p className="plt-body mt-10" style={{ color: "var(--plt-muted)" }}>
              {c.empty}
            </p>
          ) : (
            <ol className="mt-10 flex flex-col gap-10">
              {entries.map((e) => (
                <li key={e.id} className="rounded-[18px] p-6" style={{ background: "var(--plt-bg-raised)", border: "1px solid var(--plt-hairline)" }}>
                  <EntryHeader e={e} locale={locale} href={withLocaleHref(paths.entry(e.id), locale)} />
                  {e.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote changelog bucket image, size unknown
                    <img src={e.coverImageUrl} alt="" loading="lazy" className="mt-4 w-full rounded-[12px]" />
                  ) : null}
                  <p className="plt-body mt-3" style={{ fontSize: "0.9375rem", lineHeight: 1.65, color: "var(--plt-ink-soft)" }}>
                    {e.summary}
                  </p>
                  {e.helpUrl ? (
                    <a href={e.helpUrl} className="plt-body mt-3 inline-block underline underline-offset-2" style={{ fontSize: "0.9375rem", color: "var(--plt-forest)" }}>
                      {c.howTo}
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

export async function ChangelogEntryPage({ id, locale }: { id: string; locale: ChangelogLocale }) {
  const row = await loadChangelogRow(id);
  if (!row) notFound();
  const c = COPY[locale];
  const paths = changelogPaths(locale);
  const e = toEntryView(row, locale);
  const url = `${await requestOrigin()}${locale === "es" ? "/es" : ""}${paths.entry(e.id)}`;

  return (
    <MarketingSection spacing="tight">
      <MarketingContainer size="wide">
        <article className="mx-auto max-w-3xl">
          <Link href={withLocaleHref(paths.index, locale)} className="plt-body underline underline-offset-2" style={{ fontSize: "0.875rem", color: "var(--plt-forest)" }}>
            {c.back}
          </Link>
          <div className="mt-4">
            <EntryHeader e={e} locale={locale} />
          </div>
          {e.fellBack ? (
            <p className="plt-body mt-3" style={{ fontSize: "0.8125rem", color: "var(--plt-muted)" }}>
              {c.fallback}
            </p>
          ) : null}
          {e.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote changelog bucket image, size unknown
            <img src={e.coverImageUrl} alt="" className="mt-5 w-full rounded-[12px]" />
          ) : null}
          <p className="plt-body mt-4" style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}>
            {e.summary}
          </p>
          {e.bodyHtml ? (
            // Body HTML is rendered to a safe subset by the Notion sync (lib/changelog/notion-render.ts).
            <div className="plt-body mt-6" style={{ fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }} dangerouslySetInnerHTML={{ __html: e.bodyHtml }} />
          ) : null}
          {e.helpUrl ? (
            <p className="mt-6">
              <a href={e.helpUrl} className="plt-body underline underline-offset-2" style={{ color: "var(--plt-forest)" }}>
                {c.howTo}
              </a>
            </p>
          ) : null}
          <section className="mt-10 rounded-[14px] p-5" style={{ background: "var(--plt-bg-deep)", border: "1px solid var(--plt-hairline)" }}>
            <h3 className="plt-body" style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--plt-ink)" }}>
              {c.share}
            </h3>
            <p className="plt-body mt-2 select-all" style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--plt-ink-soft)" }}>
              {shareText(e, locale, url)}
            </p>
          </section>
        </article>
      </MarketingContainer>
    </MarketingSection>
  );
}
