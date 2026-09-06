import "server-only";

import {
  getConnectionOAuthClientConfig,
  getConnectionOAuthProvider,
} from "./providers";

/**
 * TikTok Login Kit + Display API.
 *
 * Two shape differences from every other vendor here, both easy to get wrong:
 *   - the client id is sent as `client_key`, not `client_id`
 *   - `/v2/video/list/` is a **POST** with the fields as a QUERY param and the
 *     paging cursor in the JSON body
 *
 * Access tokens are short (~24h) and always arrive with a refresh token, so the
 * refresh cron is not optional for TikTok either — it expires far sooner than
 * Instagram's 60 days.
 */

const OPEN_API = "https://open.tiktokapis.com";

export type TikTokTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  openId: string | null;
  scope: string | null;
};

function expiresAtFromSeconds(seconds: unknown): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * `status` is the vendor HTTP status when there was one, and is ABSENT for a
 * network/transport failure. The refresh cron needs that distinction: a 4xx
 * means the grant is genuinely dead (reconnect), while a 5xx or an unreachable
 * host is transient and must be retried, not treated as a dead integration.
 */
async function postTokenRequest(
  body: URLSearchParams,
): Promise<
  { ok: true; json: Record<string, unknown> } | { ok: false; error: string; status?: number }
> {
  const provider = getConnectionOAuthProvider("tiktok");
  if (!provider) return { ok: false, error: "TikTok provider missing." };
  try {
    const res = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) {
      return {
        ok: false,
        error: `TikTok token request failed (${res.status}).`,
        status: res.status,
      };
    }
    return { ok: true, json };
  } catch {
    return { ok: false, error: "Could not reach TikTok." };
  }
}

export async function exchangeTikTokCode(input: {
  code: string;
  redirectUri: string;
}): Promise<{ ok: true; token: TikTokTokenResult } | { ok: false; error: string }> {
  const provider = getConnectionOAuthProvider("tiktok");
  if (!provider) return { ok: false, error: "TikTok provider missing." };
  const creds = getConnectionOAuthClientConfig(provider);
  if (!creds.ok) return { ok: false, error: creds.error };

  const res = await postTokenRequest(
    new URLSearchParams({
      client_key: creds.clientId,
      client_secret: creds.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    }),
  );
  if (!res.ok) return res;
  const json = res.json;
  const accessToken = typeof json.access_token === "string" ? json.access_token : null;
  if (!accessToken) return { ok: false, error: "TikTok did not return an access token." };
  return {
    ok: true,
    token: {
      accessToken,
      refreshToken:
        typeof json.refresh_token === "string" ? json.refresh_token : null,
      expiresAt: expiresAtFromSeconds(json.expires_in),
      openId: typeof json.open_id === "string" ? json.open_id : null,
      scope: typeof json.scope === "string" ? json.scope : null,
    },
  };
}

export async function refreshTikTokToken(
  refreshToken: string,
): Promise<
  { ok: true; token: TikTokTokenResult } | { ok: false; error: string; status?: number }
> {
  const provider = getConnectionOAuthProvider("tiktok");
  if (!provider) return { ok: false, error: "TikTok provider missing." };
  const creds = getConnectionOAuthClientConfig(provider);
  if (!creds.ok) return { ok: false, error: creds.error };

  const res = await postTokenRequest(
    new URLSearchParams({
      client_key: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
  if (!res.ok) return res;
  const json = res.json;
  const accessToken = typeof json.access_token === "string" ? json.access_token : null;
  if (!accessToken) return { ok: false, error: "TikTok refresh returned no token." };
  return {
    ok: true,
    token: {
      accessToken,
      // TikTok rotates the refresh token — persisting the NEW one matters or
      // the next refresh fails.
      refreshToken:
        typeof json.refresh_token === "string" ? json.refresh_token : refreshToken,
      expiresAt: expiresAtFromSeconds(json.expires_in),
      openId: typeof json.open_id === "string" ? json.open_id : null,
      scope: typeof json.scope === "string" ? json.scope : null,
    },
  };
}

/**
 * Revoke a TikTok access token upstream (Login Kit `/v2/oauth/revoke/`).
 *
 * Called by workspace disconnect BEFORE the local secrets are deleted, so the
 * grant dies at the vendor and not only in our table. Best effort by design:
 * the local delete is the guarantee, this is the courtesy. `status` follows
 * `postTokenRequest`: absent for transport failure, the HTTP status otherwise.
 */
export async function revokeTikTokToken(
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const provider = getConnectionOAuthProvider("tiktok");
  if (!provider) return { ok: false, error: "TikTok provider missing." };
  const creds = getConnectionOAuthClientConfig(provider);
  if (!creds.ok) return { ok: false, error: creds.error };
  try {
    const res = await fetch(`${OPEN_API}/v2/oauth/revoke/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: creds.clientId,
        client_secret: creds.clientSecret,
        token: accessToken,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `TikTok revoke failed (${res.status}).`, status: res.status };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach TikTok." };
  }
}

export type TikTokProfile = {
  openId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export async function fetchTikTokProfile(
  accessToken: string,
): Promise<{ ok: true; profile: TikTokProfile } | { ok: false; error: string }> {
  const url = new URL(`${OPEN_API}/v2/user/info/`);
  url.searchParams.set("fields", "open_id,display_name,username,avatar_url");
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `TikTok profile fetch failed (${res.status}).` };
    const json = (await res.json().catch(() => null)) as {
      data?: { user?: Record<string, unknown> };
    } | null;
    const user = json?.data?.user;
    const openId = typeof user?.open_id === "string" ? user.open_id : null;
    if (!openId) return { ok: false, error: "TikTok profile response was incomplete." };
    return {
      ok: true,
      profile: {
        openId,
        displayName: typeof user?.display_name === "string" ? user.display_name : null,
        username: typeof user?.username === "string" ? user.username : null,
        avatarUrl: typeof user?.avatar_url === "string" ? user.avatar_url : null,
      },
    };
  } catch {
    return { ok: false, error: "Could not reach TikTok." };
  }
}

export type TikTokVideoItem = {
  id: string;
  coverUrl: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
};

/**
 * Recent videos for the connected account.
 *
 * The Display API does NOT hand out playable media URLs — only a cover image
 * plus a share link. So a TikTok feed tile is an image that links out (or an
 * embed), never a self-hosted autoplay video. Callers must treat these as
 * `mediaType: "image"`.
 */
export async function fetchTikTokVideos(input: {
  accessToken: string;
  limit?: number;
}): Promise<
  { ok: true; items: TikTokVideoItem[] } | { ok: false; error: string; status?: number }
> {
  const url = new URL(`${OPEN_API}/v2/video/list/`);
  url.searchParams.set(
    "fields",
    "id,title,video_description,cover_image_url,share_url,create_time",
  );
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        max_count: Math.min(Math.max(input.limit ?? 20, 1), 20),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `TikTok video list failed (${res.status}).`,
      };
    }
    const json = (await res.json().catch(() => null)) as {
      data?: { videos?: Array<Record<string, unknown>> };
    } | null;
    const items: TikTokVideoItem[] = [];
    for (const raw of json?.data?.videos ?? []) {
      const id = typeof raw.id === "string" ? raw.id : null;
      const cover =
        typeof raw.cover_image_url === "string" ? raw.cover_image_url : null;
      if (!id || !cover) continue;
      const created =
        typeof raw.create_time === "number"
          ? new Date(raw.create_time * 1000).toISOString()
          : undefined;
      items.push({
        id,
        coverUrl: cover,
        permalink: typeof raw.share_url === "string" ? raw.share_url : undefined,
        caption:
          typeof raw.title === "string" && raw.title
            ? raw.title
            : typeof raw.video_description === "string"
              ? raw.video_description
              : undefined,
        timestamp: created,
      });
    }
    return { ok: true, items };
  } catch {
    return { ok: false, error: "Could not reach TikTok." };
  }
}
