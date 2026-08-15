import { SOCIAL_FEED_INTEGRATIONS } from "./catalog-social";

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

// Field plausibility checks live in the sibling leaf module so this file stays
// inside its line budget. Same functions, same semantics.
import {
  testCaptchaProvider,
  testCaptchaSecretKey,
  testCaptchaSiteKey,
  testEmailDomain,
  testGa4MeasurementId,
  testGoogleMapsApiKey,
  testGoogleSiteVerificationToken,
  testGtmContainerId,
  testLinkedInPartnerId,
  testMetaPixelId,
  testTikTokPixelId,
  testYouTubeProfileUrl,
} from "./catalog-field-tests";

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
  /**
   * Catalog key mirroring {@link IntegrationField.label}. UI surfaces MUST
   * render `t(labelKey)`; `label` stays English as the fallback for non-UI
   * consumers (server validation messages, logs, tests).
   */
  labelKey: string;
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
  /**
   * Catalog keys mirroring `label` / `description` / `instructions`. The English
   * strings stay as the fallback for non-UI consumers (docs, logs, tests); every
   * UI surface MUST render `t(labelKey)` / `t(descriptionKey)` /
   * `instructionKeys.map(t)` so the integrations hub follows the dashboard
   * locale. `instructionKeys` is index-aligned with `instructions`.
   */
  labelKey: string;
  category: IntegrationCategory;
  connection: IntegrationConnection;
  /** true → may fall back to the platform env credential when mode='inherit'. */
  inheritable: boolean;
  /** Short human description for an eventual settings UI. */
  description: string;
  descriptionKey: string;
  /** Ordered setup steps for the tenant (rendered later in the UI). */
  instructions: string[];
  instructionKeys: string[];
  fields: IntegrationField[];
  /** Plan-entitlement gate (agency_entitlements column). Undefined = always on. */
  entitlement?: IntegrationEntitlement;
};

export const GOOGLE_MAPS_INTEGRATION_KEY = "google_maps" as const;
export const GA4_INTEGRATION_KEY = "ga4" as const;
export const META_PIXEL_INTEGRATION_KEY = "meta_pixel" as const;
export const TIKTOK_PIXEL_INTEGRATION_KEY = "tiktok_pixel" as const;
export const LINKEDIN_INSIGHT_INTEGRATION_KEY = "linkedin_insight" as const;
export const GTM_INTEGRATION_KEY = "gtm" as const;
export const SEARCH_CONSOLE_INTEGRATION_KEY = "search_console" as const;
export const CUSTOM_CODE_INTEGRATION_KEY = "custom_code" as const;
export const CAPTCHA_INTEGRATION_KEY = "captcha" as const;
export const EMAIL_DOMAIN_INTEGRATION_KEY = "email_domain" as const;
export const YOUTUBE_INTEGRATION_KEY = "youtube" as const;
export const INSTAGRAM_INTEGRATION_KEY = "instagram" as const;
export const TIKTOK_INTEGRATION_KEY = "tiktok" as const;

// Surfaced (link-only) integrations — no drawer, no credential here; the hub
// renders them as cards that navigate to an existing in-app settings route.
export const STRIPE_CONNECT_INTEGRATION_KEY = "stripe_connect" as const;
export const CUSTOM_DOMAIN_INTEGRATION_KEY = "custom_domain" as const;
export const AI_PROVIDER_INTEGRATION_KEY = "ai_provider" as const;

/**
 * Root of the i18n namespace that mirrors this catalog. Keys live under
 * `<CATALOG_I18N_NS>.items.<integration_key>.…` and `<CATALOG_I18N_NS>.status.…`
 * in `web/messages/*.json`.
 */
const NS = "dashboard.adminIntegrationsCatalog.items";

export const INTEGRATION_CATALOG: Record<string, IntegrationDef> = {
  [GOOGLE_MAPS_INTEGRATION_KEY]: {
    key: GOOGLE_MAPS_INTEGRATION_KEY,
    label: "Google Maps",
    labelKey: `${NS}.google_maps.label`,
    category: "website",
    connection: "manual",
    inheritable: true,
    description:
      "Powers the location / orbit map and city autocomplete (Maps JavaScript + Places). Supply your own referer-restricted key to use the map on your own custom domain; otherwise the platform key is used.",
    descriptionKey: `${NS}.google_maps.description`,
    instructions: [
      "In Google Cloud Console, create (or pick) a project with billing enabled.",
      'Enable the "Maps JavaScript API" and the "Places API" for that project.',
      'Create an API key under APIs & Services → Credentials, then restrict it: Application restrictions → "HTTP referrers" → add your custom domain (e.g. https://your-domain.com/*).',
      'Under API restrictions, limit the key to "Maps JavaScript API" and "Places API", then paste the key here.',
    ],
    instructionKeys: [
      `${NS}.google_maps.steps.s1`,
      `${NS}.google_maps.steps.s2`,
      `${NS}.google_maps.steps.s3`,
      `${NS}.google_maps.steps.s4`,
    ],
    fields: [
      {
        name: "api_key",
        label: "Google Maps API key",
        labelKey: `${NS}.google_maps.fields.api_key`,
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
    labelKey: `${NS}.ga4.label`,
    category: "analytics",
    connection: "manual",
    inheritable: true,
    description:
      "Track visits to your public site with Google Analytics 4. Paste your GA4 Measurement ID and the gtag.js snippet is injected on your storefront (consent-gated).",
    descriptionKey: `${NS}.ga4.description`,
    instructions: [
      "Open Google Analytics → Admin (gear, bottom-left).",
      'Under the Property column choose "Data streams", then select (or create) your Web stream.',
      'Copy the "Measurement ID" at the top right of the stream details. It starts with "G-".',
      "Paste the Measurement ID (e.g. G-XXXXXXXXXX) here.",
    ],
    instructionKeys: [
      `${NS}.ga4.steps.s1`,
      `${NS}.ga4.steps.s2`,
      `${NS}.ga4.steps.s3`,
      `${NS}.ga4.steps.s4`,
    ],
    fields: [
      {
        name: "measurement_id",
        label: "GA4 Measurement ID",
        labelKey: `${NS}.ga4.fields.measurement_id`,
        secret: false,
        public: true,
        test: testGa4MeasurementId,
      },
    ],
  },

  [META_PIXEL_INTEGRATION_KEY]: {
    key: META_PIXEL_INTEGRATION_KEY,
    label: "Meta Pixel",
    labelKey: `${NS}.meta_pixel.label`,
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Measure conversions and build audiences for Facebook / Instagram ads. Paste your Meta (Facebook) Pixel ID and the base pixel code is injected on your storefront (consent-gated).",
    descriptionKey: `${NS}.meta_pixel.description`,
    instructions: [
      "Open Meta Events Manager (business.facebook.com/events_manager).",
      "Select your pixel / dataset in the Data Sources list on the left.",
      'Find the "Dataset ID" (Pixel ID) near the top. It is a long number.',
      "Paste the numeric Pixel ID here.",
    ],
    instructionKeys: [
      `${NS}.meta_pixel.steps.s1`,
      `${NS}.meta_pixel.steps.s2`,
      `${NS}.meta_pixel.steps.s3`,
      `${NS}.meta_pixel.steps.s4`,
    ],
    fields: [
      {
        name: "pixel_id",
        label: "Meta Pixel ID",
        labelKey: `${NS}.meta_pixel.fields.pixel_id`,
        secret: false,
        public: true,
        test: testMetaPixelId,
      },
    ],
  },

  [TIKTOK_PIXEL_INTEGRATION_KEY]: {
    key: TIKTOK_PIXEL_INTEGRATION_KEY,
    label: "TikTok Pixel",
    labelKey: `${NS}.tiktok_pixel.label`,
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Track conversions from TikTok ads. Paste your TikTok Pixel ID and the pixel base code is injected on your storefront (consent-gated).",
    descriptionKey: `${NS}.tiktok_pixel.description`,
    instructions: [
      "Open TikTok Ads Manager → Assets → Events.",
      'Under "Web Events", open (or create) your pixel.',
      'Copy the "Pixel ID" shown in the pixel\'s details, an alphanumeric code.',
      "Paste the Pixel ID here.",
    ],
    instructionKeys: [
      `${NS}.tiktok_pixel.steps.s1`,
      `${NS}.tiktok_pixel.steps.s2`,
      `${NS}.tiktok_pixel.steps.s3`,
      `${NS}.tiktok_pixel.steps.s4`,
    ],
    fields: [
      {
        name: "pixel_id",
        label: "TikTok Pixel ID",
        labelKey: `${NS}.tiktok_pixel.fields.pixel_id`,
        secret: false,
        public: true,
        test: testTikTokPixelId,
      },
    ],
  },

  [LINKEDIN_INSIGHT_INTEGRATION_KEY]: {
    key: LINKEDIN_INSIGHT_INTEGRATION_KEY,
    label: "LinkedIn Insight Tag",
    labelKey: `${NS}.linkedin_insight.label`,
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Measure LinkedIn ad conversions and retarget visitors. Paste your LinkedIn Partner ID and the Insight Tag is injected on your storefront (consent-gated).",
    descriptionKey: `${NS}.linkedin_insight.description`,
    instructions: [
      "Open LinkedIn Campaign Manager → Analyze → Insight Tag.",
      'Choose "Install my Insight Tag" / "Manage Insight Tag".',
      'Copy your "Partner ID", a short numeric value.',
      "Paste the numeric Partner ID here.",
    ],
    instructionKeys: [
      `${NS}.linkedin_insight.steps.s1`,
      `${NS}.linkedin_insight.steps.s2`,
      `${NS}.linkedin_insight.steps.s3`,
      `${NS}.linkedin_insight.steps.s4`,
    ],
    fields: [
      {
        name: "partner_id",
        label: "LinkedIn Partner ID",
        labelKey: `${NS}.linkedin_insight.fields.partner_id`,
        secret: false,
        public: true,
        test: testLinkedInPartnerId,
      },
    ],
  },

  [GTM_INTEGRATION_KEY]: {
    key: GTM_INTEGRATION_KEY,
    label: "Google Tag Manager",
    labelKey: `${NS}.gtm.label`,
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Manage all your marketing tags from one container without editing the site. Paste your GTM Container ID and the container snippet is injected on your storefront (consent-gated).",
    descriptionKey: `${NS}.gtm.description`,
    instructions: [
      "Open Google Tag Manager (tagmanager.google.com).",
      "Select your account and the container for this website.",
      'Copy the Container ID shown near the top. It starts with "GTM-".',
      "Paste the Container ID (e.g. GTM-XXXXXXX) here.",
    ],
    instructionKeys: [
      `${NS}.gtm.steps.s1`,
      `${NS}.gtm.steps.s2`,
      `${NS}.gtm.steps.s3`,
      `${NS}.gtm.steps.s4`,
    ],
    fields: [
      {
        name: "container_id",
        label: "GTM Container ID",
        labelKey: `${NS}.gtm.fields.container_id`,
        secret: false,
        public: true,
        test: testGtmContainerId,
      },
    ],
  },

  // ─── SEO — Google Search Console site-ownership verification ──────────────
  // PUBLIC token only (config_json.verification_token). Emitted as a real
  // <meta name="google-site-verification"> in the storefront <head> via the
  // per-tenant generateMetadata in (public)/layout.tsx — NOT via custom_code
  // (which is entitlement-gated and lands in <body>, where Google won't read
  // it). No entitlement gate: verification is a baseline capability every plan
  // gets. Uniform across subdomains and custom domains (no DNS required).
  [SEARCH_CONSOLE_INTEGRATION_KEY]: {
    key: SEARCH_CONSOLE_INTEGRATION_KEY,
    label: "Google Search Console",
    labelKey: `${NS}.search_console.label`,
    category: "analytics",
    connection: "manual",
    inheritable: false,
    description:
      "Verify ownership of your storefront in Google Search Console to track how you rank in Search and submit your sitemap. Paste the verification token and the meta tag is added to your site's <head>.",
    descriptionKey: `${NS}.search_console.description`,
    instructions: [
      "Open Google Search Console (search.google.com/search-console) and add a property.",
      'Choose the "URL prefix" property type and enter your exact storefront address (e.g. https://your-agency.tulala.digital, or your custom domain).',
      'Pick the "HTML tag" verification method. Google shows a tag like <meta name="google-site-verification" content="TOKEN" />.',
      'Copy ONLY the token — the value inside content="…" — paste it below and Save.',
      'Back in Search Console, click Verify. Once verified, submit your sitemap at /sitemap.xml (e.g. https://your-agency.tulala.digital/sitemap.xml).',
    ],
    instructionKeys: [
      `${NS}.search_console.steps.s1`,
      `${NS}.search_console.steps.s2`,
      `${NS}.search_console.steps.s3`,
      `${NS}.search_console.steps.s4`,
      `${NS}.search_console.steps.s5`,
    ],
    fields: [
      {
        name: "verification_token",
        label: "Search Console verification token",
        labelKey: `${NS}.search_console.fields.verification_token`,
        secret: false,
        public: true,
        test: testGoogleSiteVerificationToken,
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
    labelKey: `${NS}.custom_code.label`,
    category: "website",
    connection: "manual",
    inheritable: false,
    entitlement: "custom_css_allowed",
    description:
      "Inject your own HTML / <script> into your public storefront: add a chat widget, a font, a verification meta tag, or any third-party snippet. Runs on your storefront only, never the admin.",
    descriptionKey: `${NS}.custom_code.description`,
    instructions: [
      "Paste markup destined for the page <head> (meta tags, <link> stylesheets, analytics loaders) into the Head field.",
      "Paste markup destined for the end of <body> (chat widgets, deferred <script> tags) into the Body field.",
      "Only add code you trust. It runs on every page of your public storefront with full access to the page.",
      "Save. Your storefront re-renders with the snippets injected; the admin and other tenants are never affected.",
    ],
    instructionKeys: [
      `${NS}.custom_code.steps.s1`,
      `${NS}.custom_code.steps.s2`,
      `${NS}.custom_code.steps.s3`,
      `${NS}.custom_code.steps.s4`,
    ],
    fields: [
      {
        name: "head_html",
        label: "Head HTML",
        labelKey: `${NS}.custom_code.fields.head_html`,
        secret: false,
        public: true,
      },
      {
        name: "body_html",
        label: "Body HTML",
        labelKey: `${NS}.custom_code.fields.body_html`,
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
    labelKey: `${NS}.captcha.label`,
    category: "security",
    connection: "manual",
    inheritable: false,
    description:
      "Protect your storefront contact forms from spam with hCaptcha or Cloudflare Turnstile. Bring your own keys; the widget renders on your forms and submissions are verified server-side.",
    descriptionKey: `${NS}.captcha.description`,
    instructions: [
      "Pick a provider: hCaptcha (hcaptcha.com) or Cloudflare Turnstile (dash.cloudflare.com → Turnstile).",
      "Create a site for your storefront domain and copy the Site key (public) and Secret key (private).",
      "Paste the Site key and Secret key below and choose the matching provider.",
      "Save. Your contact forms render the widget and reject submissions that fail verification.",
    ],
    instructionKeys: [
      `${NS}.captcha.steps.s1`,
      `${NS}.captcha.steps.s2`,
      `${NS}.captcha.steps.s3`,
      `${NS}.captcha.steps.s4`,
    ],
    fields: [
      {
        name: "provider",
        label: "Provider",
        labelKey: `${NS}.captcha.fields.provider`,
        secret: false,
        public: true,
        test: testCaptchaProvider,
      },
      {
        name: "site_key",
        label: "Site key",
        labelKey: `${NS}.captcha.fields.site_key`,
        secret: false,
        public: true,
        test: testCaptchaSiteKey,
      },
      {
        name: "secret_key",
        label: "Secret key",
        labelKey: `${NS}.captcha.fields.secret_key`,
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
    labelKey: `${NS}.email_domain.label`,
    category: "comms",
    connection: "manual",
    inheritable: false,
    entitlement: "white_label_email",
    description:
      "Send client emails from your own domain (e.g. noreply@yourbrand.com) instead of the platform default. Add your domain, drop the DNS records we generate, and verify.",
    descriptionKey: `${NS}.email_domain.description`,
    instructions: [
      "Enter the sending domain you want email to come from (e.g. mail.yourbrand.com) and Save.",
      "We register it with our email provider and show you the DNS records to add.",
      "Add each record (SPF / DKIM / DMARC) at your DNS host exactly as shown.",
      "Click Verify. Once DNS propagates the status flips to Verified and your email sends from your domain.",
    ],
    instructionKeys: [
      `${NS}.email_domain.steps.s1`,
      `${NS}.email_domain.steps.s2`,
      `${NS}.email_domain.steps.s3`,
      `${NS}.email_domain.steps.s4`,
    ],
    fields: [
      {
        name: "domain",
        label: "Sending domain",
        labelKey: `${NS}.email_domain.fields.domain`,
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
  ...SOCIAL_FEED_INTEGRATIONS,
  [YOUTUBE_INTEGRATION_KEY]: {
    key: YOUTUBE_INTEGRATION_KEY,
    label: "YouTube",
    labelKey: `${NS}.youtube.label`,
    category: "social",
    connection: "oauth",
    inheritable: false,
    description:
      "Connect the workspace YouTube channel, verify ownership with Google, and show the verified channel on the public site header and footer.",
    descriptionKey: `${NS}.youtube.description`,
    instructions: [
      "Use one-click connect to sign in with the Google account that owns the channel.",
      "Tulala stores the public channel label and encrypted OAuth tokens so the connection can stay verified.",
      "Manual fallback is available: paste a YouTube channel URL or @handle if one-click OAuth is not configured yet.",
    ],
    instructionKeys: [
      `${NS}.youtube.steps.s1`,
      `${NS}.youtube.steps.s2`,
      `${NS}.youtube.steps.s3`,
    ],
    fields: [
      {
        name: "profile_url",
        label: "YouTube channel URL or @handle",
        labelKey: `${NS}.youtube.fields.profile_url`,
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
  /**
   * Catalog keys mirroring `label` / `description`. English stays the fallback
   * for non-UI consumers; the hub renders `t(labelKey)` / `t(descriptionKey)`.
   */
  labelKey: string;
  category: IntegrationCategory;
  connection: "link";
  description: string;
  descriptionKey: string;
  /** In-app path under `/<tenantSlug>` the card navigates to. */
  hrefPath: string;
};

export const SURFACED_INTEGRATIONS: Record<string, SurfacedIntegrationDef> = {
  [STRIPE_CONNECT_INTEGRATION_KEY]: {
    key: STRIPE_CONNECT_INTEGRATION_KEY,
    label: "Stripe payouts",
    labelKey: `${NS}.stripe_connect.label`,
    category: "money",
    connection: "link",
    description:
      "Connect Stripe to receive booking payments and pay out your roster. Managed in Payouts.",
    descriptionKey: `${NS}.stripe_connect.description`,
    hrefPath: "/admin/payouts",
  },
  [CUSTOM_DOMAIN_INTEGRATION_KEY]: {
    key: CUSTOM_DOMAIN_INTEGRATION_KEY,
    label: "Custom domain",
    labelKey: `${NS}.custom_domain.label`,
    category: "website",
    connection: "link",
    description:
      "Run your storefront at your own domain. Managed in Settings → Domain.",
    descriptionKey: `${NS}.custom_domain.description`,
    hrefPath: "/admin/settings",
  },
  [AI_PROVIDER_INTEGRATION_KEY]: {
    key: AI_PROVIDER_INTEGRATION_KEY,
    label: "AI provider",
    labelKey: `${NS}.ai_provider.label`,
    category: "website",
    connection: "link",
    description:
      "Bring your own AI provider key for assisted imports and copy. Managed in Settings.",
    descriptionKey: `${NS}.ai_provider.description`,
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
