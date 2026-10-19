/** Soft "ya no está disponible" page for a taken-down / unpublished / missing post (404 + noindex). */
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getRequestLocale } from "@/i18n/request-locale";
import { PostUnavailableView } from "@/lib/cms/posts-public-page";
import { postSiteHref, resolveWorkspacePostSite } from "@/lib/cms/posts-public-site";

export default async function WorkspaceBlogPostNotFound() {
  const [locale, site] = await Promise.all([getRequestLocale(), resolveWorkspacePostSite()]);
  return (
    <>
      <PublicHeader />
      <main className="flex-1">
        <PostUnavailableView locale={locale} homeHref={site ? postSiteHref(site, "/", locale) : "/"} />
      </main>
      <PublicFooter />
    </>
  );
}
