/** Auto OG image for a talent-site post without a cover (Posts v1, TUL-1010). */
import { getRequestLocale } from "@/i18n/request-locale";
import { postOgImageResponse } from "@/lib/cms/posts-og-image";
import { resolveTalentPostSite } from "@/lib/cms/posts-public-site";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, locale, site] = await Promise.all([params, getRequestLocale(), resolveTalentPostSite()]);
  return postOgImageResponse(site, locale, slug);
}
