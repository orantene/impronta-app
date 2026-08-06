"use client";

/**
 * "Where your talent is shown" — the workspace's own veto over Discover.
 *
 * Rendered as the live control inside Settings → Tulala Discover
 * (WorkspacePageView), alongside the read-only plan-benefit rows. Same shape as
 * RegistrationSection: the settings SPA has no per-section SSR loader, so this
 * loads its data client-side via loadDiscoverExposure().
 *
 * The standalone /admin/settings/discover page renders the same control with
 * server-loaded props; this is the copy admins actually reach from the nav.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";

import {
  loadDiscoverExposure,
  type HubOption,
} from "@/lib/server-actions/admin-discover-exposure";
import type { TenantDiscoverExposure } from "@/lib/saas/discover-exposure";
import { DiscoverExposureControl } from "@/app/(workspace)/[tenantSlug]/admin/settings/discover/DiscoverExposureControl";

export function DiscoverExposureSection() {
  const t = useT();
  const [data, setData] = useState<TenantDiscoverExposure | null>(null);
  const [hubs, setHubs] = useState<HubOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadDiscoverExposure()
      .then((res) => {
        if (cancelled || !res.ok) return;
        setData(res.data);
        setHubs(res.hubs);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="px-[14px] pb-3 pt-2.5 text-[12px] text-admin-ink-muted">
        {t("dashboard.adminDiscoverSettings.exposureLoading")}
      </div>
    );
  }
  if (!data) return null;

  return (
    <DiscoverExposureControl
      initial={data}
      hubs={hubs}
      copy={{
        sectionTitle: t("dashboard.adminDiscoverSettings.exposureTitle"),
        platformLabel: t("dashboard.adminDiscoverSettings.exposurePlatformLabel"),
        platformHelp: t("dashboard.adminDiscoverSettings.exposurePlatformHelp"),
        optedOutNote: t("dashboard.adminDiscoverSettings.exposureOptedOut"),
        hubsTitle: t("dashboard.adminDiscoverSettings.exposureHubsTitle"),
        hubsHelp: t("dashboard.adminDiscoverSettings.exposureHubsHelp"),
        allHubs: t("dashboard.adminDiscoverSettings.exposureAllHubs"),
        chosenHubs: t("dashboard.adminDiscoverSettings.exposureChosenHubs"),
        noHubsYet: t("dashboard.adminDiscoverSettings.exposureNoHubs"),
        save: t("dashboard.adminDiscoverSettings.exposureSave"),
        saving: t("dashboard.adminDiscoverSettings.exposureSaving"),
        saved: t("dashboard.adminDiscoverSettings.exposureSaved"),
        refreshNote: t("dashboard.adminDiscoverSettings.exposureRefreshNote"),
      }}
    />
  );
}
