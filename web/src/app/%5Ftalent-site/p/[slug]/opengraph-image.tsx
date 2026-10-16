import { headers } from "next/headers";

import { getRequestLocale } from "@/i18n/request-locale";
import { PROMO_OG_SIZE } from "@/lib/promos/share/visuals";
import { renderPromoOg } from "@/lib/promos/share/promo-page";
import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";

export const alt = "Promo";
export const size = PROMO_OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const h = await headers();
  const profileId = resolveGatedTalentProfileId({
    hostContext: h.get(HOST_CONTEXT_HEADER),
    talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER),
  });
  const [{ slug }, locale] = await Promise.all([params, getRequestLocale()]);
  // No gated host: resolve nothing, so the generic card renders.
  return renderPromoOg({ kind: "profile", profileId: profileId ?? "" }, slug, locale === "en" ? "en" : "es");
}
