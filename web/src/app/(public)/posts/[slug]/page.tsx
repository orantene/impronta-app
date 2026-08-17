import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { getRequestLocale } from "@/i18n/request-locale";
import type { Locale } from "@/i18n/config";
import { buildTenantLocaleAlternates } from "@/lib/seo/locale-alternates";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { pickLocale } from "@/lib/i18n/pick-locale";

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

  const publicScope = await getPublicTenantScope();
  if (!publicScope) return { title: "Not found" };

  // Every published locale of this slug, not just the requested one — the
  // hreflang set must name only translations that actually exist (an untranslated
  // post `notFound()`s at `/es/posts/<slug>`).
  const { data } = await supabase
    .rpc("cms_public_posts_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select(
      "title,meta_title,meta_description,og_image_url,noindex,locale,slug,excerpt",
    )
    .eq("slug", slug.trim().toLowerCase());

  const publishedRows = (data ?? []) as unknown as CmsPostPublic[];
  const post = publishedRows.find((row) => row.locale === locale) ?? null;
  if (!post) return { title: "Not found" };

  // Locale-free, prefix-free path; the builder adds the locale segment and the
  // path-based tenant prefix from the request.
  const alt = await buildTenantLocaleAlternates(locale, `/posts/${post.slug}`, {
    availableLocales: publishedRows.map((row) => row.locale),
  });
  const title = post.meta_title?.trim() || post.title;
  const description = post.meta_description?.trim() || post.excerpt?.trim() || undefined;
  const openGraph = {
    title,
    description,
    ...(post.og_image_url ? { images: [{ url: post.og_image_url }] } : {}),
  };

  return {
    ...alt,
    title,
    description,
    robots: post.noindex ? { index: false, follow: true } : undefined,
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

  const publicScope = await getPublicTenantScope();
  if (!publicScope) notFound();

  const { data } = await supabase
    .rpc("cms_public_posts_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("title,excerpt,body,slug")
    .eq("locale", locale)
    .eq("slug", clean)
    .maybeSingle();

  if (!data) notFound();

  const post = data as { title: string; excerpt: string; body: string; slug: string };

  const backHref = pickLocale(locale, { en: "/directory", es: withLocalePath("/directory", "es") });

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
      <PublicFooter />
    </>
  );
}
