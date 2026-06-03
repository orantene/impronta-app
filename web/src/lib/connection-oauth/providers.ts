import "server-only";

export type ConnectionOAuthProviderKey = "youtube";

export type ConnectionOAuthProvider = {
  key: ConnectionOAuthProviderKey;
  oauthProvider: "google";
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  talentProviderKey: string;
  clientProviderKey: string;
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
  },
};

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
