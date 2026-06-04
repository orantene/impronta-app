export type ClientIntegrationCategory =
  | "social"
  | "professional"
  | "media";

export type ClientIntegrationConnectionMethod = "manual" | "oauth";

export type ClientIntegrationCapability =
  | "verify_account"
  | "profile_link"
  | "agency_trust_summary"
  | "talent_inquiry_badge";

export type ClientIntegrationDataScope =
  | "identity"
  | "profile"
  | "email"
  | "media"
  | "follower_counts";

export type ClientIntegrationControls = {
  trustSignalEnabled: boolean;
  agencyVisible: boolean;
  talentVisible: boolean;
  publicProfileEnabled: boolean;
  autoRefreshEnabled: boolean;
};

export type ClientIntegrationDef = {
  key: string;
  label: string;
  category: ClientIntegrationCategory;
  connectionMethods: ClientIntegrationConnectionMethod[];
  capabilities: ClientIntegrationCapability[];
  requestedScopes: ClientIntegrationDataScope[];
  defaultControls: ClientIntegrationControls;
  consentSummary: string;
  setupCopy: string[];
  fieldHints?: {
    profileUrl?: string;
  };
};

const OFF: ClientIntegrationControls = {
  trustSignalEnabled: false,
  agencyVisible: true,
  talentVisible: true,
  publicProfileEnabled: false,
  autoRefreshEnabled: false,
};

const SOCIAL_DEFAULTS: ClientIntegrationControls = {
  ...OFF,
  publicProfileEnabled: false,
};

export const INSTAGRAM_CLIENT_INTEGRATION_KEY = "instagram" as const;
export const TIKTOK_CLIENT_INTEGRATION_KEY = "tiktok" as const;
export const LINKEDIN_CLIENT_INTEGRATION_KEY = "linkedin" as const;
export const FACEBOOK_CLIENT_INTEGRATION_KEY = "facebook" as const;
export const YOUTUBE_CLIENT_INTEGRATION_KEY = "youtube" as const;
export const WEBSITE_CLIENT_INTEGRATION_KEY = "website" as const;

export const CLIENT_INTEGRATION_CATALOG = {
  [INSTAGRAM_CLIENT_INTEGRATION_KEY]: {
    key: INSTAGRAM_CLIENT_INTEGRATION_KEY,
    label: "Instagram",
    category: "social",
    connectionMethods: ["oauth", "manual"],
    capabilities: ["verify_account", "profile_link", "agency_trust_summary", "talent_inquiry_badge"],
    requestedScopes: ["identity", "profile", "follower_counts"],
    defaultControls: SOCIAL_DEFAULTS,
    consentSummary:
      "Tulala can confirm account ownership and show approved trust proof to agencies or talent when you allow it.",
    setupCopy: [
      "Manual Instagram links help coordinators recognize you, but do not verify identity.",
      "OAuth verification can become a trust signal once provider approval is enabled.",
    ],
    fieldHints: { profileUrl: "https://instagram.com/yourhandle" },
  },
  [TIKTOK_CLIENT_INTEGRATION_KEY]: {
    key: TIKTOK_CLIENT_INTEGRATION_KEY,
    label: "TikTok",
    category: "social",
    connectionMethods: ["oauth", "manual"],
    capabilities: ["verify_account", "profile_link", "agency_trust_summary", "talent_inquiry_badge"],
    requestedScopes: ["identity", "profile", "media"],
    defaultControls: SOCIAL_DEFAULTS,
    consentSummary:
      "Tulala can confirm the account belongs to you and surface a limited trusted-client proof on inquiries.",
    setupCopy: [
      "Manual TikTok links are saved as context only.",
      "Selected visibility switches decide whether agencies or talent see the connection label.",
    ],
    fieldHints: { profileUrl: "https://tiktok.com/@yourhandle" },
  },
  [LINKEDIN_CLIENT_INTEGRATION_KEY]: {
    key: LINKEDIN_CLIENT_INTEGRATION_KEY,
    label: "LinkedIn",
    category: "professional",
    connectionMethods: ["manual"],
    capabilities: ["profile_link", "agency_trust_summary", "talent_inquiry_badge"],
    requestedScopes: ["profile"],
    defaultControls: SOCIAL_DEFAULTS,
    consentSummary:
      "Tulala can store a public professional profile link and share it only where you opt in.",
    setupCopy: [
      "Paste a public LinkedIn profile or company profile URL.",
      "LinkedIn API verification is a later provider-approval step.",
    ],
    fieldHints: { profileUrl: "https://linkedin.com/in/yourname" },
  },
  [FACEBOOK_CLIENT_INTEGRATION_KEY]: {
    key: FACEBOOK_CLIENT_INTEGRATION_KEY,
    label: "Facebook",
    category: "social",
    connectionMethods: ["oauth", "manual"],
    capabilities: ["verify_account", "profile_link", "agency_trust_summary", "talent_inquiry_badge"],
    requestedScopes: ["identity", "profile"],
    defaultControls: SOCIAL_DEFAULTS,
    consentSummary:
      "Tulala can confirm account ownership and share a small proof summary when you allow it.",
    setupCopy: [
      "Manual profile links are available first.",
      "OAuth verification depends on provider approval and stores tokens encrypted.",
    ],
    fieldHints: { profileUrl: "https://facebook.com/yourname" },
  },
  [YOUTUBE_CLIENT_INTEGRATION_KEY]: {
    key: YOUTUBE_CLIENT_INTEGRATION_KEY,
    label: "YouTube",
    category: "media",
    connectionMethods: ["oauth", "manual"],
    capabilities: ["verify_account", "profile_link", "agency_trust_summary", "talent_inquiry_badge"],
    requestedScopes: ["identity", "profile"],
    defaultControls: SOCIAL_DEFAULTS,
    consentSummary:
      "Tulala can verify channel ownership and share that proof on inquiry trust summaries when you opt in.",
    setupCopy: [
      "Manual channel URLs are display context only.",
      "Connected account proof can later support client trust verification.",
    ],
    fieldHints: { profileUrl: "https://youtube.com/@yourchannel" },
  },
  [WEBSITE_CLIENT_INTEGRATION_KEY]: {
    key: WEBSITE_CLIENT_INTEGRATION_KEY,
    label: "Website",
    category: "professional",
    connectionMethods: ["manual"],
    capabilities: ["profile_link", "agency_trust_summary"],
    requestedScopes: ["profile"],
    defaultControls: {
      ...SOCIAL_DEFAULTS,
      trustSignalEnabled: false,
      talentVisible: false,
    },
    consentSummary:
      "Tulala can store a public website link for agency context. Website links are not verification proof by themselves.",
    setupCopy: [
      "Add a company, portfolio, or public identity website.",
      "Keep talent visibility off unless you want this shown on inquiry context later.",
    ],
    fieldHints: { profileUrl: "https://yourcompany.com" },
  },
} satisfies Record<string, ClientIntegrationDef>;

export type ClientIntegrationProviderKey = keyof typeof CLIENT_INTEGRATION_CATALOG;

export const CLIENT_INTEGRATION_KEYS = Object.keys(
  CLIENT_INTEGRATION_CATALOG,
) as ClientIntegrationProviderKey[];

export function getClientIntegrationCatalogList(): ClientIntegrationDef[] {
  return CLIENT_INTEGRATION_KEYS.map((key) => CLIENT_INTEGRATION_CATALOG[key]);
}

export function getClientIntegrationDef(
  key: string,
): ClientIntegrationDef | null {
  return CLIENT_INTEGRATION_CATALOG[key as ClientIntegrationProviderKey] ?? null;
}

export function isClientIntegrationProviderKey(
  key: string,
): key is ClientIntegrationProviderKey {
  return key in CLIENT_INTEGRATION_CATALOG;
}

export function defaultClientIntegrationControls(
  key: string,
): ClientIntegrationControls {
  return getClientIntegrationDef(key)?.defaultControls ?? OFF;
}
