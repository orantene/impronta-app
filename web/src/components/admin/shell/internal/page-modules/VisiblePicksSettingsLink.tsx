"use client";

/**
 * TUL-1687: Settings → Roster & profile fields → "Who stays visible", a next/link to
 * /admin/settings/visible-picks. The settings SPA has no per-section SSR loader, so,
 * like DiscoverExposureSection, it asks the server on mount (loadVisiblePicksLink) and
 * renders nothing unless HUB_PLAN_CAP_PICKS_ENABLED=1 and the caller may edit the roster.
 * While loading, or on any error, nothing shows: the link never appears by mistake.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { loadVisiblePicksLink } from "@/lib/server-actions/admin-visible-picks-link";
import { VISIBLE_PICKS_COPY } from "@/lib/service-hub/visible-picks";

import { Affordance } from "../primitives";

export function VisiblePicksSettingsLink({ adminBasePath }: { adminBasePath: string }) {
  const locale = useDashboardLocale() === "es" ? "es" : "en";
  const c = VISIBLE_PICKS_COPY[locale];
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadVisiblePicksLink()
      .then((r) => {
        if (!cancelled) setShow(r.show === true);
      })
      .catch(() => {
        if (!cancelled) setShow(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;
  return (
    <Link
      href={`${adminBasePath}/settings/visible-picks`}
      data-testid="settings-visible-picks-link"
      className="mb-[8px] flex items-center justify-between gap-[12px] rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[14px] font-admin-body transition-colors hover:border-admin-border-strong"
    >
      <div>
        <div className="text-[13px] font-semibold text-admin-ink">{c.title}</div>
        <div className="text-[12px] mt-0.5 text-admin-ink-muted">{c.settingsLinkDesc}</div>
      </div>
      <Affordance label={c.open} />
    </Link>
  );
}
