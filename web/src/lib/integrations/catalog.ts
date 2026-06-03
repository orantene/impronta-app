/**
 * Tenant Integrations — typed catalog (registry).
 *
 * Phase 0 ships ONE integration: google_maps. The catalog is the single source
 * of truth for what fields an integration has, whether each field is a SECRET
 * (encrypted in tenant_integration_secrets) or a PUBLIC identifier (stored in
 * tenant_integrations.config_json), how it connects, and whether it can inherit
 * the platform credential.
 *
 * Mirrors the AI subsystem's provider-registry shape: small, typed, declarative.
 * UI is intentionally absent in Phase 0 — this registry is consumed only by the
 * server-side repository + resolver for now.
 */

export type IntegrationCategory = "website" | "analytics" | "captcha" | "email";

export type IntegrationConnection = "manual" | "oauth";

/** Outcome of a lightweight (non-live) validity check on a supplied value. */
export type IntegrationFieldTestResult = {
  ok: boolean;
  /** Short machine reason when !ok (e.g. "empty", "implausible"). */
  reason?: string;
};

export type IntegrationField = {
  /** Stable field name; the secret_field / config_json key. */
  name: string;
  label: string;
  /** true → encrypted in tenant_integration_secrets. */
  secret: boolean;
  /** true → a PUBLIC identifier safe to store in config_json (and ship to the browser). */
  public: boolean;
  /**
   * Lightweight, offline validity check. NOT a live API call — Phase 0 keeps
   * this to a plausibility gate (non-empty + shape). A full live geocode/Places
   * probe is a TODO for a later phase.
   */
  test?: (value: string) => IntegrationFieldTestResult;
};

export type IntegrationDef = {
  /** Stable integration_key persisted on tenant_integrations. */
  key: string;
  label: string;
  category: IntegrationCategory;
  connection: IntegrationConnection;
  /** true → may fall back to the platform env credential when mode='inherit'. */
  inheritable: boolean;
  /** Short human description for an eventual settings UI. */
  description: string;
  /** Ordered setup steps for the tenant (rendered later in the UI). */
  instructions: string[];
  fields: IntegrationField[];
};

/**
 * Lightweight Maps-key plausibility check. Google Maps browser keys are ~39
 * chars and conventionally start with "AIza". We accept the "AIza" shape but
 * also tolerate other non-empty keys (Google has issued other prefixes) — this
 * is a guard against blank/obviously-wrong paste, NOT an authenticity check.
 * TODO(phase-later): real live validation via a Maps JS / Places probe call.
 */
function testGoogleMapsApiKey(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v.length < 20) return { ok: false, reason: "implausible_length" };
  if (/\s/.test(v)) return { ok: false, reason: "contains_whitespace" };
  return { ok: true };
}

export const GOOGLE_MAPS_INTEGRATION_KEY = "google_maps" as const;

export const INTEGRATION_CATALOG: Record<string, IntegrationDef> = {
  [GOOGLE_MAPS_INTEGRATION_KEY]: {
    key: GOOGLE_MAPS_INTEGRATION_KEY,
    label: "Google Maps",
    category: "website",
    connection: "manual",
    inheritable: true,
    description:
      "Powers the location / orbit map and city autocomplete (Maps JavaScript + Places). Supply your own referer-restricted key to use the map on your own custom domain; otherwise the platform key is used.",
    instructions: [
      "In Google Cloud Console, create (or pick) a project with billing enabled.",
      'Enable the "Maps JavaScript API" and the "Places API" for that project.',
      'Create an API key under APIs & Services → Credentials, then restrict it: Application restrictions → "HTTP referrers" → add your custom domain (e.g. https://your-domain.com/*).',
      'Under API restrictions, limit the key to "Maps JavaScript API" and "Places API", then paste the key here.',
    ],
    fields: [
      {
        name: "api_key",
        label: "Google Maps API key",
        secret: true,
        public: false,
        test: testGoogleMapsApiKey,
      },
    ],
  },
};

/** Lookup helper. Returns null for an unknown key. */
export function getIntegrationDef(key: string): IntegrationDef | null {
  return INTEGRATION_CATALOG[key] ?? null;
}

/** The single secret field name for an integration (Phase 0 integrations have at most one). */
export function primarySecretField(key: string): string | null {
  const def = getIntegrationDef(key);
  if (!def) return null;
  return def.fields.find((f) => f.secret)?.name ?? null;
}
