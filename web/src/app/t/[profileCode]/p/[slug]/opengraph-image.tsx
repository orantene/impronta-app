import { getRequestLocale } from "@/i18n/request-locale";
import { PROMO_OG_SIZE } from "@/lib/promos/share/visuals";
import { renderPromoOg } from "@/lib/promos/share/promo-page";

export const alt = "Promo";
export const size = PROMO_OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ profileCode: string; slug: string }> }) {
  const [{ profileCode, slug }, locale] = await Promise.all([params, getRequestLocale()]);
  return renderPromoOg({ kind: "code", profileCode }, slug, locale === "en" ? "en" : "es");
}
