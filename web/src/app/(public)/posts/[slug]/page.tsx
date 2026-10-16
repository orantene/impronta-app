/**
 * Legacy `/posts/<slug>` → 301 → `/blog/<slug>` (Posts v1, TUL-1009).
 *
 * The post itself renders at `app/(public)/blog/[slug]`. The redirect keeps
 * the request's locale and path-based workspace prefix (via the site's URL
 * grammar), so `/es/posts/x` lands on `/es/blog/x`.
 */
import { notFound, permanentRedirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { blogPostPath } from "@/lib/cms/posts-public-model";
import { postSiteHref, resolveWorkspacePostSite } from "@/lib/cms/posts-public-site";

export const dynamic = "force-dynamic";

export default async function LegacyPostRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveWorkspacePostSite()]);
  const clean = slug?.trim().toLowerCase();
  if (!clean) notFound();
  permanentRedirect(site ? postSiteHref(site, blogPostPath(clean), locale) : blogPostPath(clean));
}
