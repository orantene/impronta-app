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

export type IntegrationConnection = "inherit" | "manual" | "oauth";

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

/**
 * Offline format checks for the PUBLIC analytics identifiers. These are
 * plausibility/shape gates, NOT live API calls — they catch a wrong-id-type
 * paste (e.g. a GTM container id pasted into the GA4 field) before we write it
 * to config_json. All inputs are trimmed first.
 */

/** GA4 Measurement ID — "G-" + alphanumerics (e.g. G-XXXXXXXXXX). */
function testGa4MeasurementId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^G-[A-Z0-9]+$/.test(v)) return { ok: false, reason: "expected_G-XXXX" };
  return { ok: true };
}

/** GTM container ID — "GTM-" + alphanumerics (e.g. GTM-XXXXXXX). */
function testGtmContainerId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^GTM-[A-Z0-9]+$/.test(v)) return { ok: false, reason: "expected_GTM-XXXX" };
  return { ok: true };
}

/** Meta (Facebook) Pixel ID — a numeric string, typically 15-16 digits. */
function testMetaPixelId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^\d{8,20}$/.test(v)) return { ok: false, reason: "expected_numeric_id" };
  return { ok: true };
}

/** TikTok Pixel ID — alphanumeric handle (e.g. C4A1B2C3D4E5...). */
function testTikTokPixelId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^[A-Z0-9]{10,40}$/i.test(v)) return { ok: false, reason: "expected_alnum_id" };
  return { ok: true };
}

/** LinkedIn Insight Tag — numeric Partner ID. */
function testLinkedInPartnerId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^\d{4,12}$/.test(v)) return { ok: false, reason: "expected_numeric_id" };
  return { ok: true };
}

export const GOOGLE_MAPS_INTEGRATION_KEY = "google_maps" as const;
export const GA4_INTEGRATION_KEY = "ga4" as const;
export const META_PIXEL_INTEGRATION_KEY = "meta_pixel" as const;
export const TIKTOK_PIXEL_INTEGRATION_KEY = "tiktok_pixel" as const;
export const LINKEDIN_INSIGHT_INTEGRATION_KEY = "linkedin_insight" as const;
export const GTM_INTEGRATION_KEY = "gtm" as const;

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

  // ─── Analytics — PUBLIC identifiers only (stored in config_json) ──────────
  // None of these need a secret or the tenant_integration_secrets table: GA4
  // measurement IDs, pixel IDs, and GTM container IDs are all public values that
  // ship to the browser in <script> tags anyway. ONLY GA4 is inheritable — it
  // falls back to the platform GA id (NEXT_PUBLIC_GA_MEASUREMENT_ID) so platform
  // analytics keep working when a tenant supplies none. The other four (GTM,
  // Meta, TikTok, LinkedIn) are tenant-only: there is no platform identity to
  // fall back to; a tenant either supplies its own or that network stays off.
  [GA4_INTEGRATION_KEY]: {
    key: GA4_INTEGRATION_KEY,
    label: "Google Analytics 4",
    category: "analytics",
    connection: "manual",
    inheritable: true,
    description:
      "Track visits to your public site with Google Analytics 4. Paste your GA4 Measurement ID and the gtag.js snippet is injected on your storefront (consent-gated).",
    instructions: [
      "Open Google Analytics → Admin (gear, bottom-left).",
      'Under the Property column choose "Data streams", then select (or create) your Web stream.',
      'Copy the "Measurement ID" at the top right of the stream details — it starts with "G-".',
      "Paste the Measurement ID (e.g. G-XXXXXXXXXX) here.",
    ],
    fields: [
      {
        name: "measurement_id",
        label: "GA4 Measurement ID",
        secret: false,
        public: true,
        test: testGa4MeasurementId,
      },
    ],
  },

  [META_PIXEL_INTEGRATION_KEY]: {
    key: META_PIXEL_INTEGRATION_KEY,
    label: "Meta Pixel",
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Measure conversions and build audiences for Facebook / Instagram ads. Paste your Meta (Facebook) Pixel ID and the base pixel code is injected on your storefront (consent-gated).",
    instructions: [
      "Open Meta Events Manager (business.facebook.com/events_manager).",
      "Select your pixel / dataset in the Data Sources list on the left.",
      'Find the "Dataset ID" (Pixel ID) near the top — it is a long number.',
      "Paste the numeric Pixel ID here.",
    ],
    fields: [
      {
        name: "pixel_id",
        label: "Meta Pixel ID",
        secret: false,
        public: true,
        test: testMetaPixelId,
      },
    ],
  },

  [TIKTOK_PIXEL_INTEGRATION_KEY]: {
    key: TIKTOK_PIXEL_INTEGRATION_KEY,
    label: "TikTok Pixel",
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Track conversions from TikTok ads. Paste your TikTok Pixel ID and the pixel base code is injected on your storefront (consent-gated).",
    instructions: [
      "Open TikTok Ads Manager → Assets → Events.",
      'Under "Web Events", open (or create) your pixel.',
      'Copy the "Pixel ID" shown in the pixel\'s details — an alphanumeric code.',
      "Paste the Pixel ID here.",
    ],
    fields: [
      {
        name: "pixel_id",
        label: "TikTok Pixel ID",
        secret: false,
        public: true,
        test: testTikTokPixelId,
      },
    ],
  },

  [LINKEDIN_INSIGHT_INTEGRATION_KEY]: {
    key: LINKEDIN_INSIGHT_INTEGRATION_KEY,
    label: "LinkedIn Insight Tag",
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Measure LinkedIn ad conversions and retarget visitors. Paste your LinkedIn Partner ID and the Insight Tag is injected on your storefront (consent-gated).",
    instructions: [
      "Open LinkedIn Campaign Manager → Analyze → Insight Tag.",
      'Choose "Install my Insight Tag" / "Manage Insight Tag".',
      'Copy your "Partner ID" — a short numeric value.',
      "Paste the numeric Partner ID here.",
    ],
    fields: [
      {
        name: "partner_id",
        label: "LinkedIn Partner ID",
        secret: false,
        public: true,
        test: testLinkedInPartnerId,
      },
    ],
  },

  [GTM_INTEGRATION_KEY]: {
    key: GTM_INTEGRATION_KEY,
    label: "Google Tag Manager",
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Manage all your marketing tags from one container without editing the site. Paste your GTM Container ID and the container snippet is injected on your storefront (consent-gated).",
    instructions: [
      "Open Google Tag Manager (tagmanager.google.com).",
      "Select your account and the container for this website.",
      'Copy the Container ID shown near the top — it starts with "GTM-".',
      "Paste the Container ID (e.g. GTM-XXXXXXX) here.",
    ],
    fields: [
      {
        name: "container_id",
        label: "GTM Container ID",
        secret: false,
        public: true,
        test: testGtmContainerId,
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

/** All integration defs (stable iteration order: catalog insertion order). */
export function listIntegrationDefs(): IntegrationDef[] {
  return Object.values(INTEGRATION_CATALOG);
}

/** All integration defs in a given category. */
export function listIntegrationDefsByCategory(
  category: IntegrationCategory,
): IntegrationDef[] {
  return listIntegrationDefs().filter((d) => d.category === category);
}

/** True when the integration has at least one encrypted (secret) field. */
export function integrationHasSecret(key: string): boolean {
  return primarySecretField(key) !== null;
}
