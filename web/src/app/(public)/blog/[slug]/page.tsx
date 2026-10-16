/**
 * Workspace site post — `/blog/<slug>` (Posts v1, TUL-1009).
 *
 * Agency (workspace) hosts only; the tenant comes from the verified host
 * header via `resolveWorkspacePostSite`. Shared logic, state mapping and the
 * 404-vs-410 choice: `lib/cms/posts-public-page.tsx`. Talent sites have their
 * own twin under `app/%5Ftalent-site/blog/`.
 */
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildPostMetadata, loadPostPage, PostArticleView } from "@/lib/cms/posts-public-page";
import { resolveWorkspacePostSite } from "@/lib/cms/posts-public-site";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveWorkspacePostSite()]);
  if (!site) return { robots: { index: false, follow: false } };
  return buildPostMetadata(site, locale, slug);
}

export default async function WorkspaceBlogPostPage({ params }: Params) {
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveWorkspacePostSite()]);
  if (!site) notFound();
  const loaded = await loadPostPage(site, locale, slug);
  if (loaded.kind === "redirect") permanentRedirect(loaded.to);
  if (loaded.kind !== "render") notFound();
  return (
    <>
      <PublicHeader />
      <main className="flex-1">
        <PostArticleView site={site} post={loaded.post} expired={loaded.state.state === "expired"} locale={locale} />
      </main>
      <PublicFooter />
    </>
  );
}
