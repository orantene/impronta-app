import type { Metadata } from "next";
import { AgencyHomeStorefront } from "@/components/home/agency-home-storefront";
import { AppLanding } from "@/components/home/app-landing";
import { HubLanding } from "@/components/home/hub-landing";
import { MarketingLanding } from "@/components/home/marketing-landing";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";

/** Server reads cookies (Supabase / host-context header); must not be statically prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const ctx = await getPublicHostContext();

  if (ctx.kind === "agency") {
    return {
      title: t("public.meta.homeTitle"),
      description: t("public.meta.homeDescription"),
      ...buildPublicLocaleAlternates(locale, "/"),
    };
  }

  if (ctx.kind === "hub") {
    return { title: "Impronta — Agencies on the platform" };
  }

  if (ctx.kind === "marketing") {
    return { title: "Impronta — Booking engine for modeling & talent agencies" };
  }

  // app / unknown — internal workspace host, no SEO surface.
  return { title: "Impronta Workspace", robots: { index: false, follow: false } };
}

export default async function HomePage() {
  const ctx = await getPublicHostContext();

  switch (ctx.kind) {
    case "agency":
      return <AgencyHomeStorefront tenantId={ctx.tenantId} />;
    case "hub":
      return <HubLanding />;
    case "marketing":
      return <MarketingLanding />;
    case "app":
    default:
      // `unknown` only happens outside a real request (build / tests).
      // Render the app landing — it has no tenant reads and is safe.
      return <AppLanding />;
  }
}
