export type TalentIntegrationCategory =
  | "calendar"
  | "social"
  | "media"
  | "music"
  | "professional";

export type TalentIntegrationConnectionMethod =
  | "manual"
  | "oauth"
  | "embed"
  | "calendar_feed";

export type TalentIntegrationCapability =
  | "verify_account"
  | "profile_link"
  | "media_import"
  | "personal_site_embed"
  | "public_profile_badge"
  | "availability_read"
  | "booking_write";

export type TalentIntegrationDataScope =
  | "identity"
  | "profile"
  | "email"
  | "media"
  | "calendar_read"
  | "calendar_write"
  | "follower_counts";

export type TalentIntegrationControls = {
  publicBadgeEnabled: boolean;
  agencyVisible: boolean;
  publicProfileEnabled: boolean;
  personalSiteEnabled: boolean;
  autoRefreshEnabled: boolean;
  calendarAvailabilityEnabled: boolean;
  calendarWriteEnabled: boolean;
};

export type TalentIntegrationDef = {
  key: string;
  label: string;
  category: TalentIntegrationCategory;
  connectionMethods: TalentIntegrationConnectionMethod[];
  capabilities: TalentIntegrationCapability[];
  requestedScopes: TalentIntegrationDataScope[];
  defaultControls: TalentIntegrationControls;
  consentSummary: string;
  setupCopy: string[];
  fieldHints?: {
    profileUrl?: string;
  };
};

const OFF: TalentIntegrationControls = {
  publicBadgeEnabled: false,
  agencyVisible: true,
  publicProfileEnabled: false,
  personalSiteEnabled: false,
  autoRefreshEnabled: false,
  calendarAvailabilityEnabled: false,
  calendarWriteEnabled: false,
};

const PROFILE_AND_SITE_DEFAULTS: TalentIntegrationControls = {
  ...OFF,
  publicProfileEnabled: false,
  personalSiteEnabled: false,
};

const CALENDAR_DEFAULTS: TalentIntegrationControls = {
  ...OFF,
  agencyVisible: true,
  calendarAvailabilityEnabled: false,
  calendarWriteEnabled: false,
};

export const GOOGLE_CALENDAR_TALENT_INTEGRATION_KEY = "google_calendar" as const;
export const YOUTUBE_TALENT_INTEGRATION_KEY = "youtube" as const;
export const SPOTIFY_TALENT_INTEGRATION_KEY = "spotify" as const;
export const SOUNDCLOUD_TALENT_INTEGRATION_KEY = "soundcloud" as const;
export const VIMEO_TALENT_INTEGRATION_KEY = "vimeo" as const;
export const INSTAGRAM_TALENT_INTEGRATION_KEY = "instagram" as const;
export const TIKTOK_TALENT_INTEGRATION_KEY = "tiktok" as const;
export const LINKEDIN_TALENT_INTEGRATION_KEY = "linkedin" as const;
export const PINTEREST_TALENT_INTEGRATION_KEY = "pinterest" as const;

export const TALENT_INTEGRATION_CATALOG = {
  [GOOGLE_CALENDAR_TALENT_INTEGRATION_KEY]: {
    key: GOOGLE_CALENDAR_TALENT_INTEGRATION_KEY,
    label: "Google Calendar",
    category: "calendar",
    connectionMethods: ["oauth", "calendar_feed"],
    capabilities: ["availability_read", "booking_write"],
    requestedScopes: ["calendar_read", "calendar_write"],
    defaultControls: CALENDAR_DEFAULTS,
    consentSummary:
      "Tulala can read busy/free blocks to prevent booking conflicts. Writing confirmed bookings is a separate switch.",
    setupCopy: [
      "Connect Google Calendar to sync availability.",
      "Keep booking writes off unless you want confirmed Tulala bookings added to your calendar.",
    ],
  },
  [YOUTUBE_TALENT_INTEGRATION_KEY]: {
    key: YOUTUBE_TALENT_INTEGRATION_KEY,
    label: "YouTube",
    category: "media",
    connectionMethods: ["oauth", "manual", "embed"],
    capabilities: ["verify_account", "profile_link", "media_import", "personal_site_embed", "public_profile_badge"],
    requestedScopes: ["identity", "profile", "media"],
    defaultControls: PROFILE_AND_SITE_DEFAULTS,
    consentSummary:
      "Tulala can confirm channel ownership, import selected videos, and let you choose where they appear.",
    setupCopy: [
      "Connect YouTube for ownership verification and selected video imports.",
      "Manual links are supported for display but do not count as verified identity.",
    ],
    fieldHints: { profileUrl: "https://youtube.com/@yourchannel" },
  },
  [SPOTIFY_TALENT_INTEGRATION_KEY]: {
    key: SPOTIFY_TALENT_INTEGRATION_KEY,
    label: "Spotify",
    category: "music",
    connectionMethods: ["oauth", "manual", "embed"],
    capabilities: ["profile_link", "media_import", "personal_site_embed"],
    requestedScopes: ["identity", "profile", "media"],
    defaultControls: PROFILE_AND_SITE_DEFAULTS,
    consentSummary:
      "Tulala can show selected artist, playlist, or track embeds on your public profile or personal site.",
    setupCopy: [
      "Connect Spotify or paste a public Spotify URL.",
      "Choose which items, if any, appear on your Tulala pages.",
    ],
    fieldHints: { profileUrl: "https://open.spotify.com/artist/..." },
  },
  [SOUNDCLOUD_TALENT_INTEGRATION_KEY]: {
    key: SOUNDCLOUD_TALENT_INTEGRATION_KEY,
    label: "SoundCloud",
    category: "music",
    connectionMethods: ["manual", "embed"],
    capabilities: ["profile_link", "personal_site_embed"],
    requestedScopes: ["profile", "media"],
    defaultControls: PROFILE_AND_SITE_DEFAULTS,
    consentSummary:
      "Tulala can embed public SoundCloud tracks or profiles that you choose.",
    setupCopy: [
      "Paste a public SoundCloud profile or track URL.",
      "Manual links are display-only until provider OAuth is enabled.",
    ],
    fieldHints: { profileUrl: "https://soundcloud.com/yourname" },
  },
  [VIMEO_TALENT_INTEGRATION_KEY]: {
    key: VIMEO_TALENT_INTEGRATION_KEY,
    label: "Vimeo",
    category: "media",
    connectionMethods: ["oauth", "manual", "embed"],
    capabilities: ["verify_account", "profile_link", "media_import", "personal_site_embed"],
    requestedScopes: ["identity", "profile", "media"],
    defaultControls: PROFILE_AND_SITE_DEFAULTS,
    consentSummary:
      "Tulala can verify ownership and display selected Vimeo videos when you opt in.",
    setupCopy: [
      "Connect Vimeo for ownership verification and selected video imports.",
      "Use manual links for display-only embeds while OAuth is pending.",
    ],
    fieldHints: { profileUrl: "https://vimeo.com/yourname" },
  },
  [INSTAGRAM_TALENT_INTEGRATION_KEY]: {
    key: INSTAGRAM_TALENT_INTEGRATION_KEY,
    label: "Instagram",
    category: "social",
    connectionMethods: ["oauth", "manual"],
    capabilities: ["verify_account", "profile_link", "public_profile_badge"],
    requestedScopes: ["identity", "profile", "follower_counts"],
    defaultControls: PROFILE_AND_SITE_DEFAULTS,
    consentSummary:
      "Tulala can confirm the account belongs to you and show a verified social badge when you turn it on.",
    setupCopy: [
      "Connect Instagram for account verification once app review is approved.",
      "Manual links can still be shown on your profile but are not verification evidence.",
    ],
    fieldHints: { profileUrl: "https://instagram.com/yourhandle" },
  },
  [TIKTOK_TALENT_INTEGRATION_KEY]: {
    key: TIKTOK_TALENT_INTEGRATION_KEY,
    label: "TikTok",
    category: "social",
    connectionMethods: ["oauth", "manual"],
    capabilities: ["verify_account", "profile_link", "public_profile_badge"],
    requestedScopes: ["identity", "profile", "media"],
    defaultControls: PROFILE_AND_SITE_DEFAULTS,
    consentSummary:
      "Tulala can confirm account ownership and use selected public TikTok content only after you opt in.",
    setupCopy: [
      "Connect TikTok for identity confirmation once provider approval is complete.",
      "Manual profile links are available first as display-only connections.",
    ],
    fieldHints: { profileUrl: "https://tiktok.com/@yourhandle" },
  },
  [LINKEDIN_TALENT_INTEGRATION_KEY]: {
    key: LINKEDIN_TALENT_INTEGRATION_KEY,
    label: "LinkedIn",
    category: "professional",
    connectionMethods: ["manual"],
    capabilities: ["profile_link"],
    requestedScopes: ["profile"],
    defaultControls: PROFILE_AND_SITE_DEFAULTS,
    consentSummary:
      "Tulala can store a public LinkedIn profile link for professional context when you choose to show it.",
    setupCopy: [
      "Paste your public LinkedIn profile URL.",
      "LinkedIn API access is treated as a later provider-approval step.",
    ],
    fieldHints: { profileUrl: "https://linkedin.com/in/yourname" },
  },
  [PINTEREST_TALENT_INTEGRATION_KEY]: {
    key: PINTEREST_TALENT_INTEGRATION_KEY,
    label: "Pinterest",
    category: "media",
    connectionMethods: ["oauth", "manual"],
    capabilities: ["profile_link", "media_import", "personal_site_embed"],
    requestedScopes: ["profile", "media"],
    defaultControls: PROFILE_AND_SITE_DEFAULTS,
    consentSummary:
      "Tulala can import or link selected public boards for visual references after you approve it.",
    setupCopy: [
      "Connect Pinterest for selected boards later, or paste a public board/profile link now.",
      "Nothing appears publicly until the display switches are on.",
    ],
    fieldHints: { profileUrl: "https://pinterest.com/yourname" },
  },
} satisfies Record<string, TalentIntegrationDef>;

export type TalentIntegrationProviderKey = keyof typeof TALENT_INTEGRATION_CATALOG;

export const TALENT_INTEGRATION_KEYS = Object.keys(
  TALENT_INTEGRATION_CATALOG,
) as TalentIntegrationProviderKey[];

export function getTalentIntegrationCatalogList(): TalentIntegrationDef[] {
  return TALENT_INTEGRATION_KEYS.map((key) => TALENT_INTEGRATION_CATALOG[key]);
}

export function getTalentIntegrationDef(
  key: string,
): TalentIntegrationDef | null {
  return TALENT_INTEGRATION_CATALOG[key as TalentIntegrationProviderKey] ?? null;
}

export function isTalentIntegrationProviderKey(
  key: string,
): key is TalentIntegrationProviderKey {
  return key in TALENT_INTEGRATION_CATALOG;
}

export function defaultTalentIntegrationControls(
  key: string,
): TalentIntegrationControls {
  return {
    ...(getTalentIntegrationDef(key)?.defaultControls ?? OFF),
  };
}
