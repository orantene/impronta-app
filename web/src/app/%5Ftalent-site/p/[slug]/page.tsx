/**
 * Promo share link on a talent host: `<site>/p/<slug>` (internal rewrite target
 * `/_talent-site/p/<slug>`; a static segment, so it wins over the catch-all).
 *
 * ANONYMOUS like the rest of the host route: the profile id comes ONLY from the
 * proxy-set header, gated on host-context `talent_site`. Never reads a session.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { getRequestLocale } from "@/i18n/request-locale";
import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { promoPageMetadata, renderPromoPage, type PromoPageInput } from "@/lib/promos/share/promo-page";

export const revalidate = 60;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ via?: string; t?: string }>;
};

async function build(props: Props): Promise<PromoPageInput | null> {
  const h = await headers();
  const profileId = resolveGatedTalentProfileId({
    hostContext: h.get(HOST_CONTEXT_HEADER),
    talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER),
  });
  if (!profileId) return null;
  const [{ slug }, searchParams, locale] = await Promise.all([props.params, props.searchParams, getRequestLocale()]);
  return {
    scope: { kind: "profile", profileId },
    slug,
    lang: locale === "en" ? "en" : "es",
    searchParams,
    homeHref: () => "/",
    canonicalPath: () => "/",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const input = await build(props);
  return input ? promoPageMetadata(input) : { robots: { index: false, follow: false } };
}

export default async function TalentHostPromoPage(props: Props) {
  if (!isSupabaseConfigured()) notFound();
  const input = await build(props);
  if (!input) notFound();
  return renderPromoPage(input);
}
