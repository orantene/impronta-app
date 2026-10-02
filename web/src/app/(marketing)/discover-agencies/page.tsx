import type { Metadata } from "next";
import {
  AgencyHubDiscovery,
  normalizeDiscoveryFilters,
  type DiscoverySearchParams,
} from "@/components/marketing/agency-hub-discovery";
import { getAppUrl } from "@/lib/auth-flow";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Talent agencies and hubs to join",
      es: "Agencias de talento y redes para unirte",
    }),
    description: pickLocale(locale, {
      en: "Browse Tulala talent agencies and hubs by category and location, see how each one takes applications, and apply from your talent dashboard.",
      es: "Explora agencias de talento y redes en Tulala por categoría y ubicación, mira cómo recibe solicitudes cada una y aplica desde tu panel de talento.",
    }),
    // Self-canonical without the filter query string, so faceted variants
    // (?category=...&location=...) consolidate onto the one listing URL.
    ...buildMarketingLocaleAlternates(locale, "/discover-agencies"),
  };
}

export default async function DiscoverAgenciesPage({
  searchParams,
}: {
  searchParams: Promise<DiscoverySearchParams>;
}) {
  const filters = normalizeDiscoveryFilters(await searchParams);
  const appDiscoverHref = `${getAppUrl()}/login?next=/talent/discover-agencies`;
  return <AgencyHubDiscovery appDiscoverHref={appDiscoverHref} filters={filters} />;
}
