import type { IntegrationDef } from "./catalog";

/**
 * Social feed provider definitions (Instagram + TikTok).
 *
 * Split out of `catalog.ts` when the two entries pushed that file past the
 * 800-line max-lines cap. Pure data — merged back into INTEGRATION_CATALOG at
 * its definition site, so consumers still read one catalog.
 */

// MUST match catalog.ts — a divergent namespace renders raw keys in the UI.
const NS = "dashboard.adminIntegrationsCatalog.items";

export const SOCIAL_FEED_INTEGRATIONS: Record<string, IntegrationDef> = {
  // ─── Social — Instagram (OAuth, powers the live social_feed source) ───────
  // "Instagram API with Instagram Login": the account authenticates with
  // Instagram directly, no linked Facebook Page required. Business/Creator
  // accounts only — personal accounts CANNOT connect, so the card says so
  // before the operator clicks rather than after a failed OAuth round-trip.
  instagram: {
    key: "instagram",
    label: "Instagram",
    labelKey: `${NS}.instagram.label`,
    category: "social",
    connection: "oauth",
    inheritable: false,
    description:
      "Connect the workspace Instagram account to show your latest posts and reels on the public site.",
    descriptionKey: `${NS}.instagram.description`,
    instructions: [
      "Your Instagram must be a Business or Creator account: personal accounts cannot be connected.",
      "Use one-click connect to sign in with Instagram and approve read access to your posts.",
      "Tulala stores an encrypted long-lived token and refreshes it automatically so the feed keeps updating.",
    ],
    instructionKeys: [
      `${NS}.instagram.steps.s1`,
      `${NS}.instagram.steps.s2`,
      `${NS}.instagram.steps.s3`,
    ],
    fields: [
      {
        name: "profile_url",
        label: "Instagram profile URL or @handle",
        labelKey: `${NS}.instagram.fields.profile_url`,
        secret: false,
        public: true,
      },
    ],
  },
  // ─── Social — TikTok (OAuth, Display API) ─────────────────────────────────
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    labelKey: `${NS}.tiktok.label`,
    category: "social",
    connection: "oauth",
    inheritable: false,
    description:
      "Connect the workspace TikTok account to show your latest videos on the public site.",
    descriptionKey: `${NS}.tiktok.description`,
    instructions: [
      "Use one-click connect to sign in with TikTok and approve read access to your videos.",
      "TikTok only shares each video's cover image and share link, so feed tiles link out to TikTok rather than playing inline.",
      "Tulala stores encrypted tokens and refreshes them automatically.",
    ],
    instructionKeys: [
      `${NS}.tiktok.steps.s1`,
      `${NS}.tiktok.steps.s2`,
      `${NS}.tiktok.steps.s3`,
    ],
    fields: [
      {
        name: "profile_url",
        label: "TikTok profile URL or @handle",
        labelKey: `${NS}.tiktok.fields.profile_url`,
        secret: false,
        public: true,
      },
    ],
  },
};
