import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { PublicHeader } from "@/components/public-header";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { getRequestLocale } from "@/i18n/request-locale";
import type { Locale } from "@/i18n/config";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";
import { withLocalePath } from "@/i18n/pathnames";

export const dynamic = "force-dynamic";

type CmsPostPublic = {
  title: string;
  excerpt: string;
  body: string;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  locale: string;
  slug: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!slug?.trim()) return { title: "Not found" };

  const locale = await getRequestLocale();
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { title: "Not found" };

  const { data } = await supabase
    .from("cms_posts")
    .select(
      "title,meta_title,meta_description,og_image_url,noindex,locale,slug,excerpt",
    )
    .eq("locale", locale)
    .eq("slug", slug.trim().toLowerCase())
    .eq("status", "published")
    .maybeSingle();

  const post = data as CmsPostPublic | null;
  if (!post) return { title: "Not found" };

  const pathnameEn = `/posts/${post.slug}`;
  const alt = buildPublicLocaleAlternates(locale as Locale, pathnameEn);
  const title = post.meta_title?.trim() || post.title;
  const description = post.meta_description?.trim() || post.excerpt?.trim() || undefined;
  const openGraph = {
    title,
    description,
    ...(post.og_image_url ? { images: [{ url: post.og_image_url }] } : {}),
  };

  const altLinks = alt.alternates ?? {};

  return {
    metadataBase: alt.metadataBase,
    title,
    description,
    robots: post.noindex ? { index: false, follow: true } : undefined,
    alternates: {
      canonical: altLinks.canonical,
      languages: altLinks.languages,
    },
    openGraph,
  };
}

export default async function CmsPublicPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const clean = slug?.trim().toLowerCase();
  if (!clean) notFound();

  const locale = await getRequestLocale();
  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  const { data } = await supabase
    .from("cms_posts")
    .select("title,excerpt,body,slug")
    .eq("locale", locale)
    .eq("slug", clean)
    .eq("status", "published")
    .maybeSingle();

  if (!data) notFound();

  const post = data as { title: string; excerpt: string; body: string; slug: string };

  const backHref =
    locale === "es" ? withLocalePath("/directory", "es") : "/directory";

  return (
    <>
      <PublicHeader />
      <article className="mx-auto max-w-3xl flex-1 px-4 py-12 text-[var(--impronta-foreground)]">
        <p className="mb-6 text-sm text-muted-foreground">
          <a href={backHref} className="text-primary underline-offset-4 hover:underline">
            ← Directory
          </a>
        </p>
        <h1 className="font-[family-name:var(--font-cinzel)] text-3xl font-semibold tracking-wide">
          {post.title}
        </h1>
        {post.excerpt.trim() ? (
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{post.excerpt}</p>
        ) : null}
        <div className="mt-8 whitespace-pre-wrap leading-relaxed text-[var(--impronta-foreground)]">
          {post.body}
        </div>
      </article>
      <footer className="border-t border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <PublicCmsFooterNav locale={locale} />
        </div>
      </footer>
    </>
  );
}
