import type { ReactNode } from "react";

import { WebOfficeSocialStrip } from "@/components/talent-site/WebOfficeSocialStrip";
import { siteAddressOf, webOfficeLinks, withSourceWhatsapp, type SocialRecord } from "@/lib/talent-site/web-office-social";

/** Set only for a talent on the paid Web Office plan; null keeps the Free render exactly as it was. */
export type WebOfficeCtx = { address: string };

/** The Web Office context for a render, or null (Free). `enabled` comes from `webOfficeSocialEnabled(planKey)`. */
export function webOfficeCtxFor(
  enabled: boolean,
  site: { canonicalOrigin?: string | null; canonicalPath?: string | null; siteSlug?: string | null },
): WebOfficeCtx | null {
  return enabled ? { address: siteAddressOf(site) } : null;
}

/**
 * Footer data for a Web Office site. A footer that already has a social_links node keeps it (its WhatsApp
 * link gets the source text); otherwise a small strip is added. Free (`ctx` null): records pass through.
 */
export function webOfficeFooter(
  ctx: WebOfficeCtx | null | undefined,
  records: SocialRecord[],
  hasSocialNode: boolean,
  locale: string,
): { records: SocialRecord[]; strip: ReactNode } {
  if (!ctx) return { records, strip: null };
  if (hasSocialNode) return { records: withSourceWhatsapp(records, locale, ctx.address), strip: null };
  const links = webOfficeLinks(records, locale, ctx.address);
  return { records, strip: links.length ? <WebOfficeSocialStrip links={links} locale={locale} /> : null };
}
