/** Workspace site category page — `/blog/c/<category>` (Posts v1, TUL-1009). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildCategoryMetadata, PostCategoryView } from "@/lib/cms/posts-public-page";
import { resolveWorkspacePostSite } from "@/lib/cms/posts-public-site";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [{ category }, locale, site] = await Promise.all([params, getRequestLocale(), resolveWorkspacePostSite()]);
  if (!site) return { robots: { index: false, follow: false } };
  return buildCategoryMetadata(site, locale, category);
}

export default async function WorkspaceBlogCategoryPage({ params }: Params) {
  const [{ category }, locale, site] = await Promise.all([params, getRequestLocale(), resolveWorkspacePostSite()]);
  if (!site) notFound();
  const view = await PostCategoryView({ site, locale, categorySlug: category });
  if (!view) notFound();
  return (
    <>
      <PublicHeader />
      <main className="flex-1">{view}</main>
      <PublicFooter />
    </>
  );
}
