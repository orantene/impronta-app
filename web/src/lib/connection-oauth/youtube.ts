import "server-only";

import {
  buildConnectionAuthorizationUrl,
  getConnectionOAuthProvider,
  getGoogleConnectionOAuthConfig,
} from "./providers";

export type GoogleOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type YouTubeChannelProof = {
  channelId: string;
  title: string;
  description: string | null;
  customUrl: string | null;
  thumbnailUrl: string | null;
  profileUrl: string;
};

type YouTubeChannelsListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
  }>;
};

function youtubeProvider() {
  const provider = getConnectionOAuthProvider("youtube");
  if (!provider) throw new Error("YouTube connection provider missing.");
  return provider;
}

/**
 * Thin wrapper kept so existing callers do not change. The URL is now built by
 * the vendor-generic builder in `providers.ts` — one code path for every
 * provider, so Instagram/TikTok cannot drift from the proven YouTube shape.
 */
export function buildGoogleConnectionAuthorizationUrl(input: {
  state: string;
  redirectUri: string;
}): { ok: true; url: string } | { ok: false; error: string } {
  return buildConnectionAuthorizationUrl({
    provider: youtubeProvider(),
    state: input.state,
    redirectUri: input.redirectUri,
  });
}

export async function exchangeGoogleConnectionCode(input: {
  code: string;
  redirectUri: string;
}): Promise<
  | { ok: true; token: GoogleOAuthTokenResponse; expiresAt: string | null }
  | { ok: false; error: string }
> {
  const oauth = getGoogleConnectionOAuthConfig();
  if (!oauth.ok) return oauth;
  const provider = youtubeProvider();

  const body = new URLSearchParams();
  body.set("code", input.code);
  body.set("client_id", oauth.config.clientId);
  body.set("client_secret", oauth.config.clientSecret);
  body.set("redirect_uri", input.redirectUri);
  body.set("grant_type", "authorization_code");

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false, error: "Google OAuth token exchange failed." };
  }
  const token = (await response.json()) as GoogleOAuthTokenResponse;
  if (!token.access_token) {
    return { ok: false, error: "Google OAuth returned no access token." };
  }
  const expiresAt =
    typeof token.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;
  return { ok: true, token, expiresAt };
}

export async function fetchYouTubeChannelProof(
  accessToken: string,
): Promise<{ ok: true; proof: YouTubeChannelProof } | { ok: false; error: string }> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("mine", "true");

  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    return { ok: false, error: "Could not read the connected YouTube channel." };
  }

  const payload = (await response.json()) as YouTubeChannelsListResponse;
  const channel = payload.items?.[0];
  const channelId = channel?.id?.trim();
  const title = channel?.snippet?.title?.trim();
  if (!channelId || !title) {
    return {
      ok: false,
      error: "No YouTube channel was found for this Google account.",
    };
  }

  const thumbnails = channel?.snippet?.thumbnails;
  const thumbnailUrl =
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null;
  const customUrl = channel?.snippet?.customUrl?.trim() || null;
  const profileUrl = customUrl
    ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `@${customUrl}`}`
    : `https://www.youtube.com/channel/${channelId}`;

  return {
    ok: true,
    proof: {
      channelId,
      title,
      description: channel?.snippet?.description?.trim() || null,
      customUrl,
      thumbnailUrl,
      profileUrl,
    },
  };
}
