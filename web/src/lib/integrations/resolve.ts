import "server-only";

import {
  CAPTCHA_INTEGRATION_KEY,
  CUSTOM_CODE_INTEGRATION_KEY,
  GOOGLE_MAPS_INTEGRATION_KEY,
  getIntegrationDef,
  primarySecretField,
} from "@/lib/integrations/catalog";
import {
  getDecryptedSecret,
  getIntegrationEntitlements,
  getTenantIntegration,
  type TenantIntegrationRow,
} from "@/lib/integrations/repository";
import {
  platformConfigField,
  platformSecret,
} from "@/lib/integrations/platform-defaults";

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
 * client HTML / passed as a client component prop).
 *
 * Fallback order: platform-DB default (the super-admin's stored google_maps
 * api_key — a referer-restricted BROWSER key the platform owns, so it's safe to
 * ship to the client, same class of value as NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
 * → NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. The server-only GOOGLE_PLACES_API_KEY is
 * NEVER used on this path. When no platform-DB default is set the result is
 * identical to today's env-only behavior.
 */
async function platformGoogleMapsKeyForClient(): Promise<string | null> {
  const dbDefault = await platformSecret(GOOGLE_MAPS_INTEGRATION_KEY, "api_key");
  if (dbDefault) return dbDefault;
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;
}

/**
 * Platform-level Google Places key for SERVER-side Places API calls (route
 * handlers that fetch from Google directly and never serialize the key to the
 * browser).
 *
 * Fallback order: platform-DB default (the super-admin's stored google_maps
 * api_key) → server-only GOOGLE_PLACES_API_KEY → public
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. When no platform-DB default is set the result
 * is identical to today's env-only behavior.
 */
async function platformGoogleMapsKeyForServer(): Promise<string | null> {
  const dbDefault = await platformSecret(GOOGLE_MAPS_INTEGRATION_KEY, "api_key");
  if (dbDefault) return dbDefault;
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
    ? await platformGoogleMapsKeyForClient()
    : await platformGoogleMapsKeyForServer();
  if (!tenantId) return env;
  const { getSecret } = await resolveIntegration(tenantId, "google_maps", env);
  const resolved = await getSecret();
  if (resolved) return resolved;
  // DEV-ONLY: a tenant in custom mode stores its key encrypted with the
  // production AI_CREDENTIALS_ENCRYPTION_KEY, which local checkouts don't
  // have — decryption fails and the map panel dies on localhost while
  // working fine in prod. Fall back to the platform env key so the map is
  // QA-able locally. Never applies in production (tenant isolation holds).
  if (process.env.NODE_ENV === "development" && env) {
    // eslint-disable-next-line no-console -- dev-only diagnostic, never runs in prod
    console.warn(
      "[integrations/google-maps] tenant custom key unavailable locally — using platform env key (dev only).",
    );
    return env;
  }
  return null;
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

/**
 * Resolved custom-code snippets for a tenant's OWN storefront. Both blobs are
 * PUBLIC HTML the tenant authored; they are injected verbatim into the
 * storefront's <head> / end of <body>. Gated TWICE: the row must be 'connected'
 * AND the tenant must currently hold the custom_css_allowed entitlement — so a
 * plan downgrade silently stops injecting without losing the saved code.
 */
export type TenantCustomCode = {
  headHtml: string | null;
  bodyHtml: string | null;
};

export async function resolveTenantCustomCode(
  tenantId: string,
): Promise<TenantCustomCode> {
  const [row, ent] = await Promise.all([
    getTenantIntegration(tenantId, CUSTOM_CODE_INTEGRATION_KEY),
    getIntegrationEntitlements(tenantId),
  ]);
  if (!ent.custom_css_allowed) return { headHtml: null, bodyHtml: null };
  if (row?.status !== "connected") return { headHtml: null, bodyHtml: null };
  const config = (row.config_json ?? {}) as Record<string, unknown>;
  const head = typeof config.head_html === "string" ? config.head_html.trim() : "";
  const body = typeof config.body_html === "string" ? config.body_html.trim() : "";
  return {
    headHtml: head || null,
    bodyHtml: body || null,
  };
}

/**
 * Resolved captcha widget config for a tenant's storefront contact form.
 *
 * `siteKey`/`provider` are PUBLIC and used to render the client widget; the
 * platform env keys are the fallback so a tenant with no captcha still gets the
 * platform widget. `getSecret()` lazily decrypts the tenant's secret_key for
 * SERVER-side verification (falls back to the platform env secret when the
 * tenant configured none). Returns provider 'none' when neither tenant nor
 * platform has a usable key for the requested provider.
 */
export type TenantCaptchaConfig = {
  provider: "hcaptcha" | "turnstile" | "none";
  siteKey: string | null;
  /** True when the resolved key is the tenant's own (vs the platform fallback). */
  tenantOwned: boolean;
  /** Lazily resolves the server-side secret to verify a token with. */
  getSecret: () => Promise<string | null>;
};

async function platformCaptcha(): Promise<{
  provider: "hcaptcha" | "turnstile" | "none";
  siteKey: string | null;
  secret: string | null;
}> {
  // Platform-DB default FIRST: the super-admin's stored captcha (provider +
  // PUBLIC site_key in config_json + SECRET secret_key in the vault). When a
  // usable provider+siteKey pair is stored, it becomes the platform default
  // every tenant inherits. The secret is decrypted server-side only.
  const dbProvider = await platformConfigField(CAPTCHA_INTEGRATION_KEY, "provider");
  const dbSiteKey = await platformConfigField(CAPTCHA_INTEGRATION_KEY, "site_key");
  if (
    (dbProvider === "hcaptcha" || dbProvider === "turnstile") &&
    dbSiteKey
  ) {
    const dbSecret = await platformSecret(CAPTCHA_INTEGRATION_KEY, "secret_key");
    return { provider: dbProvider, siteKey: dbSiteKey, secret: dbSecret };
  }

  // No platform-DB default → EXACT current env behavior (zero regression).
  const hSite = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() || null;
  const hSecret = process.env.HCAPTCHA_SECRET?.trim() || null;
  const tSite = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
  const tSecret = process.env.TURNSTILE_SECRET?.trim() || null;
  if (hSite) return { provider: "hcaptcha", siteKey: hSite, secret: hSecret };
  if (tSite) return { provider: "turnstile", siteKey: tSite, secret: tSecret };
  return { provider: "none", siteKey: null, secret: null };
}

export async function resolveTenantCaptcha(
  tenantId: string,
): Promise<TenantCaptchaConfig> {
  const row = await getTenantIntegration(tenantId, CAPTCHA_INTEGRATION_KEY);
  const config = (row?.config_json ?? {}) as Record<string, unknown>;
  const provider =
    config.provider === "hcaptcha" || config.provider === "turnstile"
      ? config.provider
      : null;
  const siteKey =
    typeof config.site_key === "string" && config.site_key.trim()
      ? config.site_key.trim()
      : null;

  if (provider && siteKey) {
    return {
      provider,
      siteKey,
      tenantOwned: true,
      // Fail CLOSED: a decrypt error (corrupt ciphertext) resolves to null
      // rather than throwing — the caller treats a null secret on an active
      // provider as a hard reject, NOT a fall-through to the platform secret.
      getSecret: async () => {
        try {
          return (
            (await getDecryptedSecret(tenantId, CAPTCHA_INTEGRATION_KEY, "secret_key"))?.trim() ||
            null
          );
        } catch {
          return null;
        }
      },
    };
  }

  // No tenant captcha → fall back to the platform widget/secret.
  const plat = await platformCaptcha();
  return {
    provider: plat.provider,
    siteKey: plat.siteKey,
    tenantOwned: false,
    getSecret: async () => plat.secret,
  };
}
