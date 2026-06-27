import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { withLocalePath } from "@/i18n/pathnames";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Journal",
    description: "Editorials, campaign stories, and news from Impronta.",
  };
}

type PostRow = {
  title: string;
  slug: string;
  excerpt: string | null;
  og_image_url: string | null;
  published_at: string | null;
};

export default async function PostsIndexPage() {
  const locale = await getRequestLocale();
  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();
  const publicScope = await getPublicTenantScope();
  if (!publicScope) notFound();

  const { data } = await supabase
    .rpc("cms_public_posts_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("title,slug,excerpt,og_image_url,published_at")
    .eq("locale", locale)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const posts = (data ?? []) as PostRow[];
  const postHref = (slug: string) => withLocalePath(`/posts/${slug}`, locale);
  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString(locale === "es" ? "es" : "en", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";

  return (
    <>
      <PublicHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6 lg:px-8"
      >
        <header className="mb-12 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-[var(--impronta-muted)]">
            Impronta
          </p>
          <h1 className="mt-3 font-display text-4xl font-medium tracking-wide text-foreground sm:text-5xl">
            Journal
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Editorials, campaign stories, and news from the agency.
          </p>
        </header>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-background/50 px-6 py-20 text-center text-muted-foreground">
            <p>New stories are on the way. Check back soon.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <li key={p.slug} className="group">
                <Link href={postHref(p.slug)} className="block">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-foreground/[0.04]">
                    {p.og_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.og_image_url}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-2xl uppercase tracking-[0.25em] text-foreground/25">
                        Impronta
                      </div>
                    )}
                  </div>
                  {p.published_at ? (
                    <p className="mt-4 text-xs uppercase tracking-[0.2em] text-[var(--impronta-muted)]">
                      {fmtDate(p.published_at)}
                    </p>
                  ) : null}
                  <h2 className="mt-2 font-display text-xl font-medium tracking-wide text-foreground underline-offset-4 group-hover:underline">
                    {p.title}
                  </h2>
                  {p.excerpt ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {p.excerpt}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PublicFooter />
    </>
  );
}
