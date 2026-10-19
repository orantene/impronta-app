/**
 * Workspace site blog index: bare `/blog` (TUL-1003 / TUL-1006).
 *
 * The proxy's clean-URL rewrite already maps `/blog` to `/p/blog` (a root slug
 * the allow-list does not own, and `blog` is deliberately NOT a reserved slug,
 * so existing CMS pages slugged "blog" keep working). This static `p/blog`
 * segment wins over the `[[...slug]]` catch-all. Agency (workspace) hosts only; the tenant comes from the verified host header
 * via `resolveWorkspacePostSite`. A bare `/blog` used to be a clean-URL CMS slug
 * (`/p/blog`); a workspace that still has a CMS page slugged "blog" keeps it
 * (this route hands the request to the CMS page renderer), every other
 * workspace gets the post index. Data / markup / metadata: `lib/cms/blog-index.tsx`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getRequestLocale } from "@/i18n/request-locale";
import { BlogIndexView, buildBlogIndexMetadata, loadBlogIndex } from "@/lib/cms/blog-index";
import { parseBlogIndexPage } from "@/lib/cms/blog-index-model";
import { workspaceHasCmsBlogPage } from "@/lib/cms/blog-cms-page";
import { resolveWorkspacePostSite } from "@/lib/cms/posts-public-site";
import CmsPublicPage, { generateMetadata as cmsMetadata } from "../[[...slug]]/page";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const CMS_PARAMS = Promise.resolve({ slug: ["blog"] });

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [sp, locale, site] = await Promise.all([searchParams, getRequestLocale(), resolveWorkspacePostSite()]);
  if (!site) return { robots: { index: false, follow: false } };
  if (await workspaceHasCmsBlogPage(site.scope, locale)) return cmsMetadata({ params: CMS_PARAMS });
  return buildBlogIndexMetadata(site, locale, parseBlogIndexPage(sp.page));
}

export default async function WorkspaceBlogIndexPage({ searchParams }: Props) {
  const [sp, locale, site] = await Promise.all([searchParams, getRequestLocale(), resolveWorkspacePostSite()]);
  if (!site) notFound();
  if (await workspaceHasCmsBlogPage(site.scope, locale)) return CmsPublicPage({ params: CMS_PARAMS, searchParams });
  const data = await loadBlogIndex(site, locale, parseBlogIndexPage(sp.page));
  if (data.page.outOfRange) notFound();
  return (
    <>
      <PublicHeader />
      <main className="flex-1">
        <BlogIndexView site={site} locale={locale} data={data} />
      </main>
      <PublicFooter />
    </>
  );
}
