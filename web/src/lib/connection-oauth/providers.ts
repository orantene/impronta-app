import "server-only";

export type ConnectionOAuthProviderKey = "youtube" | "instagram" | "tiktok";

/**
 * The OAuth vendor a provider authenticates against. This is NOT the same as the
 * provider key: the callback route is per-VENDOR (`/callback/{vendor}`) because
 * each vendor has its own token exchange and profile shape, while a vendor can
 * in principle serve several provider keys.
 */
export type ConnectionOAuthVendor = "google" | "instagram" | "tiktok";

export type ConnectionOAuthProvider = {
  key: ConnectionOAuthProviderKey;
  oauthProvider: ConnectionOAuthVendor;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  talentProviderKey: string;
  clientProviderKey: string;
  workspaceIntegrationKey: string;
  /**
   * Extra authorization-URL params this vendor requires. Google needs offline
   * access + consent prompt to get a refresh token; Instagram and TikTok do not
   * use those and reject unknown params on some endpoints.
   */
  authorizationParams: Record<string, string>;
  /** Env var names carrying this vendor's client credentials. */
  clientIdEnv: string;
  clientSecretEnv: string;
};

export type GoogleConnectionOAuthConfig = {
  clientId: string;
  clientSecret: string;
};

export const CONNECTION_OAUTH_PROVIDERS: Record<
  ConnectionOAuthProviderKey,
  ConnectionOAuthProvider
> = {
  youtube: {
    key: "youtube",
    oauthProvider: "google",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    talentProviderKey: "youtube",
    clientProviderKey: "youtube",
    workspaceIntegrationKey: "youtube",
    authorizationParams: {
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
    },
    clientIdEnv: "GOOGLE_CONNECTION_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CONNECTION_OAUTH_CLIENT_SECRET",
  },
  // ─── Instagram — "Instagram API with Instagram Login" ──────────────────────
  // NOT Basic Display (shut down 2024-12) and NOT "Instagram API with Facebook
  // Login": the Instagram-Login variant lets a Business/Creator account connect
  // WITHOUT a linked Facebook Page, which is the difference between a one-click
  // connect and a support ticket.
  //
  // `instagram_business_basic` is the ONLY scope we request. Publishing,
  // messaging and insights scopes each add App Review scrutiny and a rejection
  // risk, and a read-only feed widget needs none of them.
  instagram: {
    key: "instagram",
    oauthProvider: "instagram",
    authorizationUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_business_basic"],
    talentProviderKey: "instagram",
    clientProviderKey: "instagram",
    workspaceIntegrationKey: "instagram",
    authorizationParams: {},
    clientIdEnv: "INSTAGRAM_OAUTH_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_OAUTH_CLIENT_SECRET",
  },
  // ─── TikTok — Login Kit + Display API ──────────────────────────────────────
  // `video.list` returns the authenticated user's own recent videos. TikTok
  // calls the client id "client_key" (not client_id) in the authorize call.
  tiktok: {
    key: "tiktok",
    oauthProvider: "tiktok",
    authorizationUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.list"],
    talentProviderKey: "tiktok",
    clientProviderKey: "tiktok",
    workspaceIntegrationKey: "tiktok",
    authorizationParams: {},
    clientIdEnv: "TIKTOK_OAUTH_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_OAUTH_CLIENT_SECRET",
  },
};

/**
 * Credentials for a provider's vendor, or a reason they are unavailable.
 *
 * Returning a REASON (rather than throwing) is what lets the Settings card show
 * an honest "Setup required" state instead of rendering a Connect button that
 * 500s when the app has not been registered yet.
 */
export function getConnectionOAuthClientConfig(
  provider: ConnectionOAuthProvider,
):
  | { ok: true; clientId: string; clientSecret: string }
  | { ok: false; error: string } {
  const clientId = process.env[provider.clientIdEnv]?.trim();
  const clientSecret = process.env[provider.clientSecretEnv]?.trim();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: `${provider.key} OAuth is not configured.`,
    };
  }
  return { ok: true, clientId, clientSecret };
}

/** True when this provider can actually run a connect flow on this deployment. */
export function isConnectionOAuthConfigured(
  key: ConnectionOAuthProviderKey,
): boolean {
  const provider = CONNECTION_OAUTH_PROVIDERS[key];
  if (!provider) return false;
  return getConnectionOAuthClientConfig(provider).ok;
}

/**
 * Vendor-generic authorization URL.
 *
 * TikTok names the client id `client_key`; everyone else uses `client_id`.
 */
export function buildConnectionAuthorizationUrl(input: {
  provider: ConnectionOAuthProvider;
  state: string;
  redirectUri: string;
}): { ok: true; url: string } | { ok: false; error: string } {
  const creds = getConnectionOAuthClientConfig(input.provider);
  if (!creds.ok) return creds;
  const url = new URL(input.provider.authorizationUrl);
  const clientIdParam =
    input.provider.oauthProvider === "tiktok" ? "client_key" : "client_id";
  url.searchParams.set(clientIdParam, creds.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.provider.scopes.join(" "));
  url.searchParams.set("state", input.state);
  for (const [k, v] of Object.entries(input.provider.authorizationParams)) {
    url.searchParams.set(k, v);
  }
  return { ok: true, url: url.toString() };
}

/**
 * The redirect URI a provider's flow registers with its vendor. Per-VENDOR,
 * because the callback route is per-vendor: `/callback/google` for YouTube,
 * `/callback/instagram`, `/callback/tiktok`. Every owner branch of the start
 * route and every callback must build the URI through this one function; the
 * workspace branch once hard-coded the Google route for all providers, which
 * sent an Instagram connect to Google's consent screen.
 */
export function getConnectionOAuthRedirectUri(
  provider: ConnectionOAuthProvider,
  appUrl: string,
): string {
  return `${appUrl.replace(/\/$/, "")}/api/connections/oauth/callback/${provider.oauthProvider}`;
}

/**
 * The full authorization redirect for a provider: vendor redirect URI plus the
 * vendor-generic authorization URL. One code path for every provider and every
 * owner kind, so no branch can pick another vendor's route.
 */
export function buildConnectionAuthorizationRedirect(input: {
  provider: ConnectionOAuthProvider;
  state: string;
  appUrl: string;
}): { ok: true; url: string; redirectUri: string } | { ok: false; error: string } {
  const redirectUri = getConnectionOAuthRedirectUri(input.provider, input.appUrl);
  const auth = buildConnectionAuthorizationUrl({
    provider: input.provider,
    state: input.state,
    redirectUri,
  });
  if (!auth.ok) return auth;
  return { ok: true, url: auth.url, redirectUri };
}

export function getConnectionOAuthProvider(
  key: string,
): ConnectionOAuthProvider | null {
  return CONNECTION_OAUTH_PROVIDERS[key as ConnectionOAuthProviderKey] ?? null;
}

export function getGoogleConnectionOAuthConfig():
  | { ok: true; config: GoogleConnectionOAuthConfig }
  | { ok: false; error: string } {
  const clientId = process.env.GOOGLE_CONNECTION_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CONNECTION_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: "Google connection OAuth is not configured.",
    };
  }
  return { ok: true, config: { clientId, clientSecret } };
}

export function getConnectionOAuthStateSecret():
  | { ok: true; secret: string }
  | { ok: false; error: string } {
  const secret = process.env.CONNECTION_OAUTH_STATE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    return {
      ok: false,
      error: "Connection OAuth state secret is not configured.",
    };
  }
  return { ok: true, secret };
}
