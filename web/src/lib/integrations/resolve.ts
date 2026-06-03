import "server-only";

import {
  getIntegrationDef,
  primarySecretField,
} from "@/lib/integrations/catalog";
import {
  getDecryptedSecret,
  getTenantIntegration,
  type TenantIntegrationRow,
} from "@/lib/integrations/repository";

/**
 * Tenant Integrations — runtime credential resolution.
 *
 * Mirrors the AI subsystem's resolveKeyForMode(mode, dbKey, envKey): the
 * tenant's custom secret wins when credential_mode='custom' and a secret is
 * stored; otherwise we fall back to the platform env key (inherit). The same
 * resolver shape generalizes across integrations; a thin maps-specific helper
 * (resolveGoogleMapsKey) wires the env fallback for the Maps key.
 */

export type IntegrationCredentialMode = "inherit" | "custom";

/**
 * Generic resolver. Returns the effective mode, the (public) config, and a lazy
 * getSecret() that resolves the decrypted custom secret (custom mode) or the
 * supplied platform env fallback (inherit / no custom secret).
 *
 * @param envFallback platform-level key for this integration's secret field
 *                    (e.g. process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY). When the
 *                    integration is inheritable, this is used in inherit mode.
 */
export async function resolveIntegration(
  tenantId: string,
  key: string,
  envFallback: string | null = null,
): Promise<{
  mode: IntegrationCredentialMode;
  config: Record<string, unknown>;
  row: TenantIntegrationRow | null;
  getSecret: () => Promise<string | null>;
}> {
  const def = getIntegrationDef(key);
  const row = await getTenantIntegration(tenantId, key);
  const mode: IntegrationCredentialMode = row?.credential_mode ?? "inherit";
  const config = row?.config_json ?? {};
  const inheritable = def?.inheritable ?? true;
  const secretField = primarySecretField(key);

  const env = envFallback?.trim() || null;

  const getSecret = async (): Promise<string | null> => {
    if (mode === "custom" && secretField) {
      const custom = await getDecryptedSecret(tenantId, key, secretField);
      const c = custom?.trim() || null;
      // Mirror the AI resolveKeyForMode 'agency'/custom semantics: a tenant that
      // has explicitly chosen credential_mode='custom' must NOT silently fall
      // back to the platform env key — that would defeat tenant isolation. When
      // custom is selected but no usable secret is stored, resolve to null.
      return c;
    }
    // inherit mode (or no secret field / no row): platform env key when inheritable.
    return inheritable ? env : null;
  };

  return { mode, config, row, getSecret };
}

/**
 * Platform-level Google Maps key destined for the BROWSER (serialized into
 * client HTML / passed as a client component prop). This MUST use only the
 * public NEXT_PUBLIC_ var — the server-only GOOGLE_PLACES_API_KEY must never be
 * shipped to the client.
 */
function platformGoogleMapsKeyForClient(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;
}

/**
 * Platform-level Google Places key for SERVER-side Places API calls (route
 * handlers that fetch from Google directly and never serialize the key to the
 * browser). Prefer the server-only GOOGLE_PLACES_API_KEY, falling back to the
 * public var if only that is set.
 */
function platformGoogleMapsKeyForServer(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

/**
 * Resolve the effective Google Maps / Places key for a tenant: the tenant's
 * custom key when credential_mode='custom' and a secret exists; when the tenant
 * is in inherit mode (or has no integration row) the platform env key. A tenant
 * that selected custom mode but stored no usable secret resolves to null — it
 * does NOT fall back to the platform key (tenant isolation). Returns null when
 * nothing resolves (caller keeps its graceful "map unavailable" fallback box).
 *
 * Pass `null` tenantId (e.g. cross-tenant / platform-root surfaces) to get the
 * platform env key directly.
 *
 * @param forClient when true, the platform fallback is the public-only browser
 *   key (no server-only GOOGLE_PLACES_API_KEY leak); when false it's the
 *   server-side Places key. Prefer the named helpers below.
 */
export async function resolveGoogleMapsKey(
  tenantId: string | null,
  forClient = true,
): Promise<string | null> {
  const env = forClient
    ? platformGoogleMapsKeyForClient()
    : platformGoogleMapsKeyForServer();
  if (!tenantId) return env;
  const { getSecret } = await resolveIntegration(tenantId, "google_maps", env);
  return getSecret();
}

/**
 * CLIENT-safe resolver: the resolved key is serialized into the browser (map
 * embed / location-map apiKey prop). Platform fallback is the public key only.
 */
export async function resolveGoogleMapsKeyForClient(
  tenantId: string | null,
): Promise<string | null> {
  return resolveGoogleMapsKey(tenantId, true);
}

/**
 * SERVER-only resolver: the resolved key is used by server-side Places API
 * route handlers and never leaves the server. Platform fallback prefers the
 * server-only GOOGLE_PLACES_API_KEY.
 */
export async function resolveGoogleMapsKeyForServer(
  tenantId: string | null,
): Promise<string | null> {
  return resolveGoogleMapsKey(tenantId, false);
}
