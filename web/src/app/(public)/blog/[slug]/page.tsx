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
import { resolveBlogSite } from "@/lib/cms/platform-blog-site";
import { PlatformBlogFrame } from "@/components/marketing/platform-blog-frame";
import { getPublicHostContext } from "@/lib/saas/scope";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveBlogSite()]);
  if (!site) return { robots: { index: false, follow: false } };
  return buildPostMetadata(site, locale, slug);
}

export default async function WorkspaceBlogPostPage({ params }: Params) {
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveBlogSite()]);
  if (!site) notFound();
  const loaded = await loadPostPage(site, locale, slug);
  if (loaded.kind === "redirect") permanentRedirect(loaded.to);
  if (loaded.kind !== "render") notFound();
  const article = <PostArticleView site={site} post={loaded.post} expired={loaded.state.state === "expired"} locale={locale} />;
  // TUL-1399: on the marketing host the product blog wears the marketing chrome.
  if ((await getPublicHostContext()).kind === "marketing") return <PlatformBlogFrame>{article}</PlatformBlogFrame>;
  return (
    <>
      <PublicHeader />
      <main className="flex-1">{article}</main>
      <PublicFooter />
    </>
  );
}
