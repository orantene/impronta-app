/**
 * Promo share link on the hub: `/t/<profileCode>/p/<slug>`. Same landing as the
 * talent host route; `p` is a static segment so it wins over `[pageSlug]`
 * (and `p` is a reserved page slug, so no page can shadow it).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { promoPageMetadata, renderPromoPage, type PromoPageInput } from "@/lib/promos/share/promo-page";

type Props = {
  params: Promise<{ profileCode: string; slug: string }>;
  searchParams: Promise<{ via?: string; t?: string }>;
};

async function build(props: Props): Promise<PromoPageInput> {
  const [{ profileCode, slug }, searchParams, locale] = await Promise.all([
    props.params, props.searchParams, getRequestLocale(),
  ]);
  return {
    scope: { kind: "code", profileCode },
    slug,
    lang: locale === "en" ? "en" : "es",
    searchParams,
    homeHref: (code) => `/t/${encodeURIComponent(code || profileCode)}`,
    canonicalPath: (code) => `/t/${encodeURIComponent(code || profileCode)}`,
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  return promoPageMetadata(await build(props));
}

export default async function HubPromoPage(props: Props) {
  if (!isSupabaseConfigured()) notFound();
  return renderPromoPage(await build(props));
}
