"use client";

import { useEffect } from "react";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { trackProductEvent } from "@/lib/analytics/track-client";

/**
 * SitePageViewAnalytics — the ONE shared first-party page-view component for
 * every public surface (storefront, talent-profile, talent-site). Mounted in
 * the render path of each surface; fires `view_site_page` exactly once per
 * render with `{surface, tenant_id, page_id?, page_slug?, referrer}`.
 *
 * The `tenant_id` is forwarded to the events route (which writes it to
 * `analytics_events.tenant_id`, not payload-only) so per-tenant admin queries
 * (`loadWebsiteAnalytics`, admin-data.ts `.eq('tenant_id')`) return real rows.
 * `referrer` (document.referrer) powers the top-referrers grouping.
 *
 * Replaces the profile-only `ProfileViewAnalytics`. The `talent-profile`
 * surface ALSO emits the legacy `view_talent_profile` event (via `emitLegacy
 * ProfileView`) so the existing inquiry-funnel loaders keep counting profile
 * views — the two event names never double-count in any single loader.
 */
export type SitePageSurface = "storefront" | "talent-site" | "talent-profile";

export function SitePageViewAnalytics({
  surface,
  tenantId,
  pageId,
  pageSlug,
  locale,
  /**
   * talent-profile only — the talent whose profile this is, kept so the legacy
   * `view_talent_profile` event still carries `talent_id` for the inquiry funnel.
   */
  talentId,
  /**
   * How the surface was presented — "page" (canonical route render) or
   * "modal" (directory quick-open overlay). Totals stay unified; this is a
   * breakdown dimension only. Omitted → no key in the payload (legacy rows).
   */
  viewContext,
  /**
   * Emit the legacy `view_talent_profile` event in addition to `view_site_page`.
   * Defaults true ONLY for the `talent-profile` surface so the existing funnel
   * loaders (loadFunnelEventCounts / loadExecutiveOverviewInternal) keep working
   * while the unified loader reads the new event. Other surfaces never emitted a
   * legacy page-view, so they fire `view_site_page` only.
   */
  emitLegacyProfileView,
}: {
  surface: SitePageSurface;
  tenantId?: string | null;
  pageId?: string | null;
  pageSlug?: string | null;
  locale: string;
  talentId?: string | null;
  viewContext?: "page" | "modal";
  emitLegacyProfileView?: boolean;
}) {
  const legacy =
    emitLegacyProfileView ?? (surface === "talent-profile" && Boolean(talentId));

  useEffect(() => {
    const referrer =
      typeof document !== "undefined" && document.referrer
        ? document.referrer
        : undefined;

    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.view_site_page, {
      surface,
      locale,
      ...(tenantId ? { tenant_id: tenantId } : {}),
      ...(pageId ? { page_id: pageId } : {}),
      ...(pageSlug ? { page_slug: pageSlug } : {}),
      ...(viewContext ? { view_context: viewContext } : {}),
      ...(referrer ? { referrer } : {}),
    });

    // Legacy profile-view event — distinct name, so it feeds the inquiry funnel
    // loaders without double-counting against `view_site_page`.
    if (legacy && talentId) {
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.view_talent_profile, {
        talent_id: talentId,
        locale,
        ...(pageSlug ? { source_page: pageSlug } : {}),
        ...(viewContext ? { view_context: viewContext } : {}),
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });
    }
    // Fire-once-per-mount semantics, keyed on the identifying inputs.
  }, [surface, tenantId, pageId, pageSlug, locale, talentId, legacy, viewContext]);

  return null;
}
