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

export type IntegrationCategory =
  | "website"
  | "analytics"
  | "social"
  | "captcha"
  | "email"
  | "security"
  | "comms"
  | "money";

/**
 * How an integration connects:
 *   - inherit | manual | oauth — credential-bearing integrations configured in
 *     the per-integration drawer.
 *   - link — a "surfaced" integration that has NO drawer and NO credential here;
 *     the hub renders it as a card that NAVIGATES to an existing in-app settings
 *     route (Stripe payouts, custom domain, AI provider). Its live status is
 *     resolved separately by the loader.
 */
export type IntegrationConnection = "inherit" | "manual" | "oauth" | "link";

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

/**
 * Plan-entitlement column on `agency_entitlements` that must be TRUE for a
 * tenant to configure this integration. When set and the entitlement is false,
 * the hub renders the integration in a LOCKED state and the write actions
 * refuse. Undefined → always available.
 */
export type IntegrationEntitlement = "custom_css_allowed" | "white_label_email";

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
  /** Plan-entitlement gate (agency_entitlements column). Undefined = always on. */
  entitlement?: IntegrationEntitlement;
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

/**
 * Captcha site key (PUBLIC) — hCaptcha keys look like a UUID; Turnstile keys
 * start with "0x". We accept both shapes (and any other non-empty token without
 * whitespace) as a plausibility gate — this guards against a blank/garbled paste,
 * not authenticity.
 */
function testCaptchaSiteKey(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v.length < 8) return { ok: false, reason: "implausible_length" };
  if (/\s/.test(v)) return { ok: false, reason: "contains_whitespace" };
  return { ok: true };
}

/** Captcha secret key (SECRET → vault). Same offline plausibility gate. */
function testCaptchaSecretKey(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v.length < 8) return { ok: false, reason: "implausible_length" };
  if (/\s/.test(v)) return { ok: false, reason: "contains_whitespace" };
  return { ok: true };
}

/** Captcha provider — one of the two supported values. */
function testCaptchaProvider(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v !== "hcaptcha" && v !== "turnstile") {
    return { ok: false, reason: "expected_hcaptcha_or_turnstile" };
  }
  return { ok: true };
}

/**
 * Sending domain (or sub-domain) — a bare hostname like `mail.example.com`.
 * No scheme, no path, at least one dot. Plausibility gate only.
 */
function testEmailDomain(value: string): IntegrationFieldTestResult {
  const v = value.trim().toLowerCase();
  if (!v) return { ok: false, reason: "empty" };
  if (/\s/.test(v)) return { ok: false, reason: "contains_whitespace" };
  if (/^https?:\/\//.test(v) || v.includes("/") || v.includes("@")) {
    return { ok: false, reason: "expected_bare_hostname" };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) {
    return { ok: false, reason: "expected_hostname" };
  }
  return { ok: true };
}

/**
 * YouTube channel URL or @handle — plausibility gate for the manual fallback
 * field. Accepts a bare @handle / handle (2-80 chars) or any youtube.com /
 * youtu.be URL. The one-click OAuth path supplies the verified channel; this
 * gate only guards the manual paste.
 */
function testYouTubeProfileUrl(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  const handle = v.replace(/^@/, "");
  if (/^[A-Za-z0-9._-]{2,80}$/.test(handle)) return { ok: true };
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
      return { ok: true };
    }
  } catch {
    // Fall through to the shape error below.
  }
  return { ok: false, reason: "expected_youtube_url_or_handle" };
}

export const GOOGLE_MAPS_INTEGRATION_KEY = "google_maps" as const;
export const GA4_INTEGRATION_KEY = "ga4" as const;
export const META_PIXEL_INTEGRATION_KEY = "meta_pixel" as const;
export const TIKTOK_PIXEL_INTEGRATION_KEY = "tiktok_pixel" as const;
export const LINKEDIN_INSIGHT_INTEGRATION_KEY = "linkedin_insight" as const;
export const GTM_INTEGRATION_KEY = "gtm" as const;
export const CUSTOM_CODE_INTEGRATION_KEY = "custom_code" as const;
export const CAPTCHA_INTEGRATION_KEY = "captcha" as const;
export const EMAIL_DOMAIN_INTEGRATION_KEY = "email_domain" as const;
export const YOUTUBE_INTEGRATION_KEY = "youtube" as const;

// Surfaced (link-only) integrations — no drawer, no credential here; the hub
// renders them as cards that navigate to an existing in-app settings route.
export const STRIPE_CONNECT_INTEGRATION_KEY = "stripe_connect" as const;
export const CUSTOM_DOMAIN_INTEGRATION_KEY = "custom_domain" as const;
export const AI_PROVIDER_INTEGRATION_KEY = "ai_provider" as const;

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

  // ─── Website — custom storefront code (entitlement: custom_css_allowed) ────
  // Two PUBLIC HTML blobs (head_html + body_html) injected into the tenant's
  // OWN storefront only — never admin/auth pages, never another tenant. Not a
  // secret (it ships to the browser by definition). Gated behind the
  // custom_css_allowed plan entitlement.
  [CUSTOM_CODE_INTEGRATION_KEY]: {
    key: CUSTOM_CODE_INTEGRATION_KEY,
    label: "Custom code",
    category: "website",
    connection: "manual",
    inheritable: false,
    entitlement: "custom_css_allowed",
    description:
      "Inject your own HTML / <script> into your public storefront — add a chat widget, a font, a verification meta tag, or any third-party snippet. Runs on your storefront only, never the admin.",
    instructions: [
      "Paste markup destined for the page <head> (meta tags, <link> stylesheets, analytics loaders) into the Head field.",
      "Paste markup destined for the end of <body> (chat widgets, deferred <script> tags) into the Body field.",
      "Only add code you trust — it runs on every page of your public storefront with full access to the page.",
      "Save. Your storefront re-renders with the snippets injected; the admin and other tenants are never affected.",
    ],
    fields: [
      {
        name: "head_html",
        label: "Head HTML",
        secret: false,
        public: true,
      },
      {
        name: "body_html",
        label: "Body HTML",
        secret: false,
        public: true,
      },
    ],
  },

  // ─── Security — captcha (provider + PUBLIC site key + SECRET secret key) ───
  // provider + site_key are PUBLIC (config_json, shipped to the browser to
  // render the widget); secret_key is a true SECRET (vault). Verified
  // server-side at the contact-form submit boundary with the tenant's secret.
  [CAPTCHA_INTEGRATION_KEY]: {
    key: CAPTCHA_INTEGRATION_KEY,
    label: "Captcha",
    category: "security",
    connection: "manual",
    inheritable: false,
    description:
      "Protect your storefront contact forms from spam with hCaptcha or Cloudflare Turnstile. Bring your own keys; the widget renders on your forms and submissions are verified server-side.",
    instructions: [
      "Pick a provider — hCaptcha (hcaptcha.com) or Cloudflare Turnstile (dash.cloudflare.com → Turnstile).",
      "Create a site for your storefront domain and copy the Site key (public) and Secret key (private).",
      "Paste the Site key and Secret key below and choose the matching provider.",
      "Save. Your contact forms render the widget and reject submissions that fail verification.",
    ],
    fields: [
      {
        name: "provider",
        label: "Provider",
        secret: false,
        public: true,
        test: testCaptchaProvider,
      },
      {
        name: "site_key",
        label: "Site key",
        secret: false,
        public: true,
        test: testCaptchaSiteKey,
      },
      {
        name: "secret_key",
        label: "Secret key",
        secret: true,
        public: false,
        test: testCaptchaSecretKey,
      },
    ],
  },

  // ─── Comms — white-label email sending domain (entitlement: white_label_email)
  // domain (PUBLIC) + Resend domain id + verification status + DNS records are
  // all stored in config_json (no secret here — verification uses the PLATFORM
  // Resend API key). When verified + entitled, outbound email uses
  // noreply@<domain> as the From.
  [EMAIL_DOMAIN_INTEGRATION_KEY]: {
    key: EMAIL_DOMAIN_INTEGRATION_KEY,
    label: "Email domain",
    category: "comms",
    connection: "manual",
    inheritable: false,
    entitlement: "white_label_email",
    description:
      "Send client emails from your own domain (e.g. noreply@yourbrand.com) instead of the platform default. Add your domain, drop the DNS records we generate, and verify.",
    instructions: [
      "Enter the sending domain you want email to come from (e.g. mail.yourbrand.com) and Save.",
      "We register it with our email provider and show you the DNS records to add.",
      "Add each record (SPF / DKIM / DMARC) at your DNS host exactly as shown.",
      "Click Verify — once DNS propagates the status flips to Verified and your email sends from your domain.",
    ],
    fields: [
      {
        name: "domain",
        label: "Sending domain",
        secret: false,
        public: true,
        test: testEmailDomain,
      },
    ],
  },

  // ─── Social — workspace YouTube (OAuth, verified channel on the public site) ─
  // OAuth-connected: the one-click "Connect with Google" flow verifies channel
  // ownership and stores the public channel label (config_json) + encrypted
  // OAuth tokens (vault). A manual paste of a channel URL / @handle is the
  // fallback when OAuth is not configured. On connect/disconnect the verified
  // channel is mirrored into agency_business_identity.social_youtube so the
  // public site header/footer can render it.
  [YOUTUBE_INTEGRATION_KEY]: {
    key: YOUTUBE_INTEGRATION_KEY,
    label: "YouTube",
    category: "social",
    connection: "oauth",
    inheritable: false,
    description:
      "Connect the workspace YouTube channel, verify ownership with Google, and show the verified channel on the public site header and footer.",
    instructions: [
      "Use one-click connect to sign in with the Google account that owns the channel.",
      "Tulala stores the public channel label and encrypted OAuth tokens so the connection can stay verified.",
      "Manual fallback is available: paste a YouTube channel URL or @handle if one-click OAuth is not configured yet.",
    ],
    fields: [
      {
        name: "profile_url",
        label: "YouTube channel URL or @handle",
        secret: false,
        public: true,
        test: testYouTubeProfileUrl,
      },
    ],
  },
};

/**
 * Surfaced (link-only) integrations. These are NOT in INTEGRATION_CATALOG —
 * they have no fields, no drawer, and no credential stored here. The hub
 * renders them as cards that navigate to the existing in-app settings route
 * (`hrefPath`, joined with the tenant slug by the loader) and shows a live
 * status the loader resolves separately. Kept catalog-driven so adding another
 * surfaced integration is one entry.
 */
export type SurfacedIntegrationDef = {
  key: string;
  label: string;
  category: IntegrationCategory;
  connection: "link";
  description: string;
  /** In-app path under `/<tenantSlug>` the card navigates to. */
  hrefPath: string;
};

export const SURFACED_INTEGRATIONS: Record<string, SurfacedIntegrationDef> = {
  [STRIPE_CONNECT_INTEGRATION_KEY]: {
    key: STRIPE_CONNECT_INTEGRATION_KEY,
    label: "Stripe payouts",
    category: "money",
    connection: "link",
    description:
      "Connect Stripe to receive booking payments and pay out your roster. Managed in Payouts.",
    hrefPath: "/admin/payouts",
  },
  [CUSTOM_DOMAIN_INTEGRATION_KEY]: {
    key: CUSTOM_DOMAIN_INTEGRATION_KEY,
    label: "Custom domain",
    category: "website",
    connection: "link",
    description:
      "Run your storefront at your own domain. Managed in Settings → Domain.",
    hrefPath: "/admin/settings",
  },
  [AI_PROVIDER_INTEGRATION_KEY]: {
    key: AI_PROVIDER_INTEGRATION_KEY,
    label: "AI provider",
    category: "website",
    connection: "link",
    description:
      "Bring your own AI provider key for assisted imports and copy. Managed in Settings.",
    hrefPath: "/admin/settings",
  },
};

/** All surfaced (link-only) integration defs in catalog order. */
export function listSurfacedIntegrations(): SurfacedIntegrationDef[] {
  return Object.values(SURFACED_INTEGRATIONS);
}

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
