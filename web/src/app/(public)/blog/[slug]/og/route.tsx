/** Auto OG image for a workspace post without a cover (Posts v1, TUL-1010). */
import { getRequestLocale } from "@/i18n/request-locale";
import { postOgImageResponse } from "@/lib/cms/posts-og-image";
import { resolveBlogSite } from "@/lib/cms/platform-blog-site";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveBlogSite()]);
  return postOgImageResponse(site, locale, slug);
}
