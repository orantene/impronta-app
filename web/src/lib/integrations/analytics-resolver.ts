import "server-only";

import {
  GA4_INTEGRATION_KEY,
  GTM_INTEGRATION_KEY,
  LINKEDIN_INSIGHT_INTEGRATION_KEY,
  META_PIXEL_INTEGRATION_KEY,
  TIKTOK_PIXEL_INTEGRATION_KEY,
} from "@/lib/integrations/catalog";
import { getTenantIntegration } from "@/lib/integrations/repository";

/**
 * Resolved analytics identifiers for a tenant, all safe to pass to the browser.
 * Null when the integration is absent or not connected.
 */
export interface TenantAnalyticsConfig {
  /** GA4 Measurement ID (e.g. G-XXXXXXXXXX). Null = analytics off. */
  gaId: string | null;
  /** GTM Container ID (e.g. GTM-XXXXXXX). Null = GTM off. */
  gtmId: string | null;
  /** Meta Pixel ID. Null = pixel off. */
  metaPixelId: string | null;
  /** TikTok Pixel ID. Null = pixel off. */
  tiktokPixelId: string | null;
  /** LinkedIn Insight Tag Partner ID. Null = tag off. */
  linkedInPartnerId: string | null;
}

/**
 * Extract a string field from a config_json blob. Returns null when the field
 * is absent, not a string, or an empty string.
 */
function configField(
  config: Record<string, unknown> | null | undefined,
  field: string,
): string | null {
  if (!config) return null;
  const v = config[field];
  if (typeof v !== "string") return null;
  return v.trim() || null;
}

/**
 * True only when the row is present and its status is 'connected'. Analytics
 * integrations are non-inheritable: absence of a row or a non-connected status
 * means the integration is off for this tenant.
 */
function isConnected(
  row: { status: string } | null | undefined,
): boolean {
  return row?.status === "connected";
}

/**
 * Server-side resolver: fetch all analytics integration rows for a tenant in
 * parallel and return the effective public IDs to inject into the page. Only
 * rows with status='connected' and a non-empty config_json field are returned;
 * all others resolve to null (analytics off for that integration).
 *
 * Analytics integrations are NOT inheritable — there is no platform-level
 * fallback for GA4, GTM, Meta, TikTok, or LinkedIn. A tenant without a row
 * simply has no analytics injection for that network.
 *
 * This is the ONLY place that reads from the analytics integration rows for
 * injection purposes. Do not call getTenantIntegration() for analytics directly
 * in layout.tsx — import this resolver instead.
 */
export async function resolveTenantAnalytics(
  tenantId: string,
): Promise<TenantAnalyticsConfig> {
  const [ga4Row, gtmRow, metaRow, tiktokRow, linkedinRow] = await Promise.all([
    getTenantIntegration(tenantId, GA4_INTEGRATION_KEY),
    getTenantIntegration(tenantId, GTM_INTEGRATION_KEY),
    getTenantIntegration(tenantId, META_PIXEL_INTEGRATION_KEY),
    getTenantIntegration(tenantId, TIKTOK_PIXEL_INTEGRATION_KEY),
    getTenantIntegration(tenantId, LINKEDIN_INSIGHT_INTEGRATION_KEY),
  ]);

  return {
    gaId: isConnected(ga4Row)
      ? configField(ga4Row?.config_json, "measurement_id")
      : null,
    gtmId: isConnected(gtmRow)
      ? configField(gtmRow?.config_json, "container_id")
      : null,
    metaPixelId: isConnected(metaRow)
      ? configField(metaRow?.config_json, "pixel_id")
      : null,
    tiktokPixelId: isConnected(tiktokRow)
      ? configField(tiktokRow?.config_json, "pixel_id")
      : null,
    linkedInPartnerId: isConnected(linkedinRow)
      ? configField(linkedinRow?.config_json, "partner_id")
      : null,
  };
}
