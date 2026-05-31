import type { Metadata } from "next";
import {
  AgencyHubDiscovery,
  normalizeDiscoveryFilters,
  type DiscoverySearchParams,
} from "@/components/marketing/agency-hub-discovery";
import { getAppUrl } from "@/lib/auth-flow";

export const metadata: Metadata = {
  title: "Discover agencies and hubs",
  description:
    "Browse Tulala agencies and hubs by category, location, and application mode, then apply from your talent dashboard.",
};

export default async function DiscoverAgenciesPage({
  searchParams,
}: {
  searchParams: Promise<DiscoverySearchParams>;
}) {
  const filters = normalizeDiscoveryFilters(await searchParams);
  const appDiscoverHref = `${getAppUrl()}/login?next=/talent/discover-agencies`;
  return <AgencyHubDiscovery appDiscoverHref={appDiscoverHref} filters={filters} />;
}
