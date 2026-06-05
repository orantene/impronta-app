import "server-only";

import {
  GA4_INTEGRATION_KEY,
  GTM_INTEGRATION_KEY,
  LINKEDIN_INSIGHT_INTEGRATION_KEY,
  META_PIXEL_INTEGRATION_KEY,
  TIKTOK_PIXEL_INTEGRATION_KEY,
} from "@/lib/integrations/catalog";
import { sanitizeAnalyticsId } from "@/lib/integrations/analytics-id-guard";
import { getTenantIntegration } from "@/lib/integrations/repository";
import { platformConfigField } from "@/lib/integrations/platform-defaults";

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
 * Inheritance: GA4 IS inheritable — when a tenant has no GA4 measurement id the
 * component falls back to the platform GA id (NEXT_PUBLIC_GA_MEASUREMENT_ID) so
 * platform analytics keep working. The other four networks (GTM, Meta, TikTok,
 * LinkedIn) are tenant-only — there is no platform-level fallback; a tenant
 * without a row simply has no injection for that network.
 *
 * Every returned id is run through {@link sanitizeAnalyticsId} (whitelist +
 * catalog test) before it leaves here, so even a future unvalidated writer to
 * config_json can never inject a character into the script body downstream.
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

  // GA4 platform-DB default: when the tenant has no connected GA4 of its own,
  // inherit the super-admin's stored platform GA4 measurement id (if any). This
  // is ADDITIVE — when no platform-DB default is set this resolves to null and
  // the component's existing NEXT_PUBLIC_GA_MEASUREMENT_ID env fallback applies
  // unchanged (zero regression). Re-sanitized at this boundary like every id.
  const tenantGaId = isConnected(ga4Row)
    ? sanitizeAnalyticsId(
        configField(ga4Row?.config_json, "measurement_id"),
        GA4_INTEGRATION_KEY,
        "measurement_id",
      )
    : null;
  const platformGaDefault = tenantGaId
    ? null
    : sanitizeAnalyticsId(
        await platformConfigField(GA4_INTEGRATION_KEY, "measurement_id"),
        GA4_INTEGRATION_KEY,
        "measurement_id",
      );

  // Re-validate every id at the resolver boundary (whitelist + catalog test) so
  // an unvalidated config_json writer can never reach the raw script-string
  // interpolation in AnalyticsScripts. The GA4 env fallback (when neither the
  // tenant NOR the platform DB has an id) is applied + re-sanitized inside the
  // component, where the env value lives.
  return {
    gaId: tenantGaId ?? platformGaDefault,
    gtmId: isConnected(gtmRow)
      ? sanitizeAnalyticsId(
          configField(gtmRow?.config_json, "container_id"),
          GTM_INTEGRATION_KEY,
          "container_id",
        )
      : null,
    metaPixelId: isConnected(metaRow)
      ? sanitizeAnalyticsId(
          configField(metaRow?.config_json, "pixel_id"),
          META_PIXEL_INTEGRATION_KEY,
          "pixel_id",
        )
      : null,
    tiktokPixelId: isConnected(tiktokRow)
      ? sanitizeAnalyticsId(
          configField(tiktokRow?.config_json, "pixel_id"),
          TIKTOK_PIXEL_INTEGRATION_KEY,
          "pixel_id",
        )
      : null,
    linkedInPartnerId: isConnected(linkedinRow)
      ? sanitizeAnalyticsId(
          configField(linkedinRow?.config_json, "partner_id"),
          LINKEDIN_INSIGHT_INTEGRATION_KEY,
          "partner_id",
        )
      : null,
  };
}
