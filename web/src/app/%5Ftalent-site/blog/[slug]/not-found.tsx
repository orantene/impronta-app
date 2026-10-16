/** Soft "ya no está disponible" page on a talent site (404 + noindex), inside the site shell when it renders. */
import { getRequestLocale } from "@/i18n/request-locale";
import { PostUnavailableView } from "@/lib/cms/posts-public-page";
import { postSiteHref, resolveTalentPostSite } from "@/lib/cms/posts-public-site";
import { renderTalentBlogShell } from "../talent-blog-shell";

export default async function TalentBlogPostNotFound() {
  const [locale, site] = await Promise.all([getRequestLocale(), resolveTalentPostSite()]);
  const body = <PostUnavailableView locale={locale} homeHref={site ? postSiteHref(site, "/", locale) : "/"} />;
  if (!site) return body;
  return (await renderTalentBlogShell(site, locale, "/", body).catch(() => null)) ?? body;
}
