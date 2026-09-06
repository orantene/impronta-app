import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchInstagramMedia } from "@/lib/connection-oauth/instagram";
import { fetchTikTokVideos } from "@/lib/connection-oauth/tiktok";
import { getDecryptedSecret, setIntegrationConfig } from "@/lib/integrations/repository";

/**
 * Social feed cache — write side (cron) and read side (storefront render).
 *
 * The read side NEVER touches a vendor API. See the migration header for why.
 */

export type CachedFeedItem = {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  posterUrl?: string;
  permalink?: string;
  caption?: string;
};

export type FeedRefreshResult = {
  tenantId: string;
  provider: "instagram" | "tiktok";
  ok: boolean;
  written: number;
  error?: string;
};

/**
 * Read cached items for a tenant+provider, newest first, excluding moderated
 * ones. Returns [] on any failure — a storefront page must never throw because
 * a feed is empty or the table is unreachable.
 */
export async function readCachedFeedItems(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    provider: "instagram" | "tiktok";
    limit?: number;
  },
): Promise<CachedFeedItem[]> {
  const { data, error } = await admin
    .from("tenant_social_feed_items")
    .select("external_id, media_url, media_type, poster_url, permalink, caption")
    .eq("tenant_id", input.tenantId)
    .eq("provider", input.provider)
    .eq("hidden", false)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(input.limit ?? 24, 1), 48));
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.external_id),
    mediaUrl: String(row.media_url),
    mediaType: row.media_type === "video" ? "video" : "image",
    posterUrl: typeof row.poster_url === "string" ? row.poster_url : undefined,
    permalink: typeof row.permalink === "string" ? row.permalink : undefined,
    caption: typeof row.caption === "string" ? row.caption : undefined,
  }));
}

/**
 * Resolve the `socialFeeds` data source for a render: one cache read per
 * provider the tree needs, keyed the way `render.tsx` looks them up. A
 * `"mixed"` block reads its own key, so it is populated as instagram first,
 * then tiktok, when both were requested.
 *
 * Never throws and never touches a vendor API; a failed read is an empty list
 * and the block falls back to its authored items.
 */
export async function resolveSocialFeedDataSources(
  admin: SupabaseClient,
  tenantId: string,
  providers: ReadonlyArray<"instagram" | "tiktok">,
  limit?: number,
): Promise<Record<string, CachedFeedItem[]>> {
  const distinct = [...new Set(providers)];
  if (distinct.length === 0) return {};
  const lists = await Promise.all(
    distinct.map((provider) =>
      readCachedFeedItems(admin, { tenantId, provider, limit }),
    ),
  );
  const out: Record<string, CachedFeedItem[]> = {};
  distinct.forEach((provider, i) => {
    out[provider] = lists[i] ?? [];
  });
  if (distinct.length === 2) {
    out.mixed = [...(out.instagram ?? []), ...(out.tiktok ?? [])];
  }
  return out;
}

type UpsertRow = {
  tenant_id: string;
  provider: string;
  external_id: string;
  media_url: string;
  media_type: string;
  poster_url: string | null;
  permalink: string | null;
  caption: string | null;
  posted_at: string | null;
  fetched_at: string;
};

/**
 * Refresh one tenant+provider from the vendor API into the cache.
 *
 * On a 4xx (expired/revoked token) the integration row is marked
 * `needs_reconnect` so Settings can say so — but the CACHE IS LEFT INTACT, so
 * the public page keeps rendering the last good snapshot instead of going
 * blank while the operator sorts it out.
 */
export async function refreshTenantFeed(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    provider: "instagram" | "tiktok";
    config: Record<string, unknown>;
    limit?: number;
  },
): Promise<FeedRefreshResult> {
  const base = { tenantId: input.tenantId, provider: input.provider };
  const accessToken = await getDecryptedSecret(
    input.tenantId,
    input.provider,
    "access_token",
  );
  if (!accessToken) {
    return { ...base, ok: false, written: 0, error: "No stored access token." };
  }

  const now = new Date().toISOString();
  let rows: UpsertRow[] = [];

  if (input.provider === "instagram") {
    const res = await fetchInstagramMedia({ accessToken, limit: input.limit });
    if (!res.ok) {
      if (res.status && res.status >= 400 && res.status < 500) {
        await setIntegrationConfig(
          input.tenantId,
          "instagram",
          { ...input.config, needs_reconnect: true },
          { status: "error", lastError: res.error },
        );
      }
      return { ...base, ok: false, written: 0, error: res.error };
    }
    rows = res.items.map((item) => ({
      tenant_id: input.tenantId,
      provider: "instagram",
      external_id: item.id,
      media_url: item.mediaUrl,
      media_type: item.mediaType,
      poster_url: item.posterUrl ?? null,
      permalink: item.permalink ?? null,
      caption: item.caption ?? null,
      posted_at: item.timestamp ?? null,
      fetched_at: now,
    }));
  } else {
    const res = await fetchTikTokVideos({ accessToken, limit: input.limit });
    if (!res.ok) {
      if (res.status && res.status >= 400 && res.status < 500) {
        await setIntegrationConfig(
          input.tenantId,
          "tiktok",
          { ...input.config, needs_reconnect: true },
          { status: "error", lastError: res.error },
        );
      }
      return { ...base, ok: false, written: 0, error: res.error };
    }
    // TikTok's Display API hands out a cover image + share link only — never a
    // playable media URL — so these are IMAGE tiles that link out, not inline
    // video. Marking them "video" would make the widget try to <video> a JPEG.
    rows = res.items.map((item) => ({
      tenant_id: input.tenantId,
      provider: "tiktok",
      external_id: item.id,
      media_url: item.coverUrl,
      media_type: "image",
      poster_url: null,
      permalink: item.permalink ?? null,
      caption: item.caption ?? null,
      posted_at: item.timestamp ?? null,
      fetched_at: now,
    }));
  }

  // NOTE: an EMPTY `rows` here means the vendor call SUCCEEDED and the account
  // genuinely has no posts (every failure path above already returned). This
  // used to return early, which meant a wiped account's old posts rendered on
  // the public page forever. Fall through to the prune below instead.
  if (rows.length > 0) {
    // Upsert (not delete-then-insert): the conflict target preserves `hidden`,
    // so an operator's moderation choice survives every refresh.
    const { error } = await admin
      .from("tenant_social_feed_items")
      .upsert(rows, { onConflict: "tenant_id,provider,external_id" });
    if (error) {
      return { ...base, ok: false, written: 0, error: error.message };
    }
  }

  // Drop rows the account no longer returns (deleted posts) so the feed does not
  // show content the operator has removed from the network.
  const pruned = await pruneStaleFeedItems(admin, {
    tenantId: input.tenantId,
    provider: input.provider,
    keepExternalIds: rows.map((r) => r.external_id),
  });
  if (pruned.error) {
    // Not fatal — the fresh posts are already written and the page renders. But
    // this used to be discarded entirely, so a permanently failing prune was
    // invisible; surface it on the result the cron logs.
    return {
      ...base,
      ok: false,
      written: rows.length,
      error: `Wrote ${rows.length} item(s) but stale-item prune failed: ${pruned.error}`,
    };
  }

  await setIntegrationConfig(
    input.tenantId,
    input.provider,
    { ...input.config, needs_reconnect: false, feed_last_synced_at: now },
    { status: "connected", lastError: null, lastVerifiedAt: now },
  );

  return { ...base, ok: true, written: rows.length };
}

/** Delete-by-id batch size — keeps the PostgREST request URL well inside limits. */
const PRUNE_DELETE_CHUNK = 100;

/**
 * Delete the cached items for a tenant+provider whose `external_id` is NOT in
 * `keepExternalIds` (an empty keep-list prunes everything — the emptied-account
 * case).
 *
 * Why read-then-delete-by-id instead of one `.not("external_id","in",…)`: that
 * filter had to be assembled by STRING-INTERPOLATING vendor-supplied post ids
 * into PostgREST filter syntax, so an id containing a quote, comma or paren
 * would either break the filter or silently change which rows it matched — on a
 * DELETE. Here the only values that ever reach a filter are `id` UUIDs we read
 * back from our own table, so no vendor string is ever parsed as syntax.
 */
async function pruneStaleFeedItems(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    provider: "instagram" | "tiktok";
    keepExternalIds: ReadonlyArray<string>;
  },
): Promise<{ deleted: number; error?: string }> {
  const { data, error } = await admin
    .from("tenant_social_feed_items")
    .select("id, external_id")
    .eq("tenant_id", input.tenantId)
    .eq("provider", input.provider);
  if (error) return { deleted: 0, error: error.message };
  if (!data || data.length === 0) return { deleted: 0 };

  const keep = new Set(input.keepExternalIds);
  const staleIds = (data as Array<{ id: string; external_id: string }>)
    .filter((row) => !keep.has(row.external_id))
    .map((row) => row.id);
  if (staleIds.length === 0) return { deleted: 0 };

  let deleted = 0;
  for (let i = 0; i < staleIds.length; i += PRUNE_DELETE_CHUNK) {
    const chunk = staleIds.slice(i, i + PRUNE_DELETE_CHUNK);
    const { error: deleteError } = await admin
      .from("tenant_social_feed_items")
      .delete()
      .in("id", chunk);
    if (deleteError) return { deleted, error: deleteError.message };
    deleted += chunk.length;
  }
  return { deleted };
}

/** Sweep every connected social account. Used by the cron. */
export async function sweepSocialFeeds(
  admin: SupabaseClient,
): Promise<{ scanned: number; succeeded: number; failed: number; items: number }> {
  // `succeeded`, not `ok` — the cron response already carries an `ok` flag and
  // spreading a second one silently overwrote it.
  const out = { scanned: 0, succeeded: 0, failed: 0, items: 0 };
  const { data, error } = await admin
    .from("tenant_integrations")
    .select("tenant_id, integration_key, config_json")
    .in("integration_key", ["instagram", "tiktok"])
    .eq("status", "connected");
  if (error || !data) return out;

  for (const row of data as Array<{
    tenant_id: string;
    integration_key: string;
    config_json: Record<string, unknown> | null;
  }>) {
    out.scanned += 1;
    const res = await refreshTenantFeed(admin, {
      tenantId: row.tenant_id,
      provider: row.integration_key as "instagram" | "tiktok",
      config: row.config_json ?? {},
    });
    if (res.ok) {
      out.succeeded += 1;
      out.items += res.written;
    } else {
      out.failed += 1;
    }
  }
  return out;
}
