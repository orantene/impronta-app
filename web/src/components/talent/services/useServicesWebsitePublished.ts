"use client";

import { useWebsiteFlow } from "@/components/talent/website-reward/useWebsiteFlow";
import { useTalentSiteDashboardInitialLoad } from "@/components/talent/site/TalentSiteDashboardProvider";
import { isWebsitePublished } from "@/lib/talent/website-published-truth";

/** Same published flag the top-bar website pill reads, so both always agree. */
export function useServicesWebsitePublished(): boolean {
  const flow = useWebsiteFlow();
  const siteLoad = useTalentSiteDashboardInitialLoad();
  return isWebsitePublished(flow.state, siteLoad?.ok ? siteLoad.state.site?.status ?? null : null);
}
