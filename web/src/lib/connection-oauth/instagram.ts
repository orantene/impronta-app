import "server-only";

import {
  getConnectionOAuthClientConfig,
  getConnectionOAuthProvider,
} from "./providers";

/**
 * Instagram API **with Instagram Login** (NOT Basic Display, shut down
 * 2024-12; NOT the Facebook-Login variant, which forces the connecting account
 * to own a linked Facebook Page).
 *
 * Token flow is two-legged and the second leg is easy to miss:
 *   1. POST /oauth/access_token   → SHORT-lived token (~1 hour)
 *   2. GET  /access_token?grant_type=ig_exchange_token → LONG-lived (60 days)
 *
 * We always exchange to long-lived immediately. A short-lived token stored as
 * if it were durable would connect fine and then break within the hour.
 *
 * Long-lived tokens are refreshable (ig_refresh_token) but only while still
 * valid and at least 24h old — hence the refresh cron, which must run well
 * inside the 60-day window or every connected tenant expires at once.
 */

const GRAPH = "https://graph.instagram.com";
const API = "https://api.instagram.com";

export type InstagramTokenResult = {
  accessToken: string;
  /** ISO timestamp when the long-lived token expires (~60 days out). */
  expiresAt: string | null;
  userId: string;
};

export type InstagramProfile = {
  userId: string;
  username: string;
  accountType?: string;
  mediaCount?: number;
};

function expiresAtFromSeconds(seconds: unknown): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Exchange the callback `code` for a LONG-lived token. Both legs happen here so
 * no caller can accidentally persist the 1-hour token.
 */
export async function exchangeInstagramCode(input: {
  code: string;
  redirectUri: string;
}): Promise<
  { ok: true; token: InstagramTokenResult } | { ok: false; error: string }
> {
  const provider = getConnectionOAuthProvider("instagram");
  if (!provider) return { ok: false, error: "Instagram provider missing." };
  const creds = getConnectionOAuthClientConfig(provider);
  if (!creds.ok) return { ok: false, error: creds.error };

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  });

  let shortRes: Response;
  try {
    shortRes = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach Instagram to finish connecting." };
  }
  if (!shortRes.ok) {
    return { ok: false, error: "Instagram rejected the connection request." };
  }
  const shortJson = (await shortRes.json().catch(() => null)) as {
    access_token?: string;
    user_id?: string | number;
    permissions?: string;
  } | null;
  const shortToken = shortJson?.access_token;
  if (!shortToken) {
    return { ok: false, error: "Instagram did not return an access token." };
  }

  // Leg 2 — long-lived exchange. If this fails we do NOT fall back to the
  // short token: a connection that silently dies in an hour is worse than a
  // clear failure the operator can retry.
  const longUrl = new URL(`${GRAPH}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", creds.clientSecret);
  longUrl.searchParams.set("access_token", shortToken);

  let longRes: Response;
  try {
    longRes = await fetch(longUrl, { cache: "no-store" });
  } catch {
    return { ok: false, error: "Could not reach Instagram to finish connecting." };
  }
  if (!longRes.ok) {
    return {
      ok: false,
      error: "Instagram could not issue a long-lived token. Try connecting again.",
    };
  }
  const longJson = (await longRes.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!longJson?.access_token) {
    return { ok: false, error: "Instagram did not return a long-lived token." };
  }

  return {
    ok: true,
    token: {
      accessToken: longJson.access_token,
      expiresAt: expiresAtFromSeconds(longJson.expires_in),
      userId: String(shortJson?.user_id ?? ""),
    },
  };
}

/** Refresh a long-lived token. Valid while unexpired and >24h old. */
export async function refreshInstagramToken(
  accessToken: string,
): Promise<
  { ok: true; accessToken: string; expiresAt: string | null } | { ok: false; error: string }
> {
  const url = new URL(`${GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: `Instagram refresh failed (${res.status}).` };
    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!json?.access_token) return { ok: false, error: "No token in refresh response." };
    return {
      ok: true,
      accessToken: json.access_token,
      expiresAt: expiresAtFromSeconds(json.expires_in),
    };
  } catch {
    return { ok: false, error: "Could not reach Instagram to refresh the token." };
  }
}

/** Public profile proof used for the Settings card label. */
export async function fetchInstagramProfile(
  accessToken: string,
): Promise<{ ok: true; profile: InstagramProfile } | { ok: false; error: string }> {
  const url = new URL(`${GRAPH}/me`);
  url.searchParams.set("fields", "id,username,account_type,media_count");
  url.searchParams.set("access_token", accessToken);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: `Instagram profile fetch failed (${res.status}).` };
    const json = (await res.json().catch(() => null)) as {
      id?: string;
      username?: string;
      account_type?: string;
      media_count?: number;
    } | null;
    if (!json?.id || !json.username) {
      return { ok: false, error: "Instagram profile response was incomplete." };
    }
    return {
      ok: true,
      profile: {
        userId: json.id,
        username: json.username,
        accountType: json.account_type,
        mediaCount: json.media_count,
      },
    };
  } catch {
    return { ok: false, error: "Could not reach Instagram." };
  }
}

export type InstagramMediaItem = {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  posterUrl?: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
};

/**
 * Recent media for the connected account. CAROUSEL_ALBUM is represented by its
 * cover image (children would need a second round-trip per item and a feed grid
 * only shows the cover anyway).
 */
export async function fetchInstagramMedia(input: {
  accessToken: string;
  limit?: number;
}): Promise<
  { ok: true; items: InstagramMediaItem[] } | { ok: false; error: string; status?: number }
> {
  const url = new URL(`${GRAPH}/me/media`);
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp",
  );
  url.searchParams.set("limit", String(Math.min(Math.max(input.limit ?? 24, 1), 48)));
  url.searchParams.set("access_token", input.accessToken);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Instagram media fetch failed (${res.status}).`,
      };
    }
    const json = (await res.json().catch(() => null)) as {
      data?: Array<{
        id?: string;
        caption?: string;
        media_type?: string;
        media_url?: string;
        permalink?: string;
        thumbnail_url?: string;
        timestamp?: string;
      }>;
    } | null;
    const items: InstagramMediaItem[] = [];
    for (const raw of json?.data ?? []) {
      if (!raw.id || !raw.media_url) continue;
      const isVideo = raw.media_type === "VIDEO";
      items.push({
        id: raw.id,
        mediaUrl: raw.media_url,
        mediaType: isVideo ? "video" : "image",
        posterUrl: isVideo ? raw.thumbnail_url : undefined,
        permalink: raw.permalink,
        caption: raw.caption,
        timestamp: raw.timestamp,
      });
    }
    return { ok: true, items };
  } catch {
    return { ok: false, error: "Could not reach Instagram." };
  }
}
