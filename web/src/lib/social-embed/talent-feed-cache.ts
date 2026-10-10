import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchInstagramMedia } from "@/lib/connection-oauth/instagram";
import { INSTAGRAM_TALENT_INTEGRATION_KEY } from "@/lib/talent-integrations/catalog";
import {
  getDecryptedTalentIntegrationSecret,
  upsertTalentIntegration,
} from "@/lib/talent-integrations/repository";
import type { CachedFeedItem } from "./feed-cache";

/**
 * Talent social feed cache: the `talent_social_feed_items` twin of
 * ./feed-cache.ts. Talent connections are Instagram only.
 *
 * The read side NEVER touches a vendor API and never throws: until the
 * migration is applied (or on any read failure) it returns [] and the block
 * falls back to its authored items or its placeholder.
 */

const TABLE = "talent_social_feed_items";
const PRUNE_DELETE_CHUNK = 100;

export async function readTalentCachedFeedItems(
  admin: SupabaseClient,
  input: { talentProfileId: string; limit?: number },
): Promise<CachedFeedItem[]> {
  const { data, error } = await admin
    .from(TABLE)
    .select("external_id, media_url, media_type, poster_url, permalink, caption")
    .eq("talent_profile_id", input.talentProfileId)
    .eq("provider", "instagram")
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
 * `socialFeeds` for a talent site render, keyed the way `render.tsx` looks
 * them up. A talent has no TikTok cache, so a `"mixed"` block reads the
 * Instagram list and a `"tiktok"` block reads nothing (authored fallback).
 */
export async function resolveTalentSocialFeedDataSources(
  admin: SupabaseClient,
  talentProfileId: string,
  providers: ReadonlyArray<"instagram" | "tiktok">,
  limit?: number,
): Promise<Record<string, CachedFeedItem[]>> {
  if (!providers.includes("instagram")) return {};
  const items = await readTalentCachedFeedItems(admin, { talentProfileId, limit });
  const out: Record<string, CachedFeedItem[]> = { instagram: items };
  if (providers.includes("tiktok")) out.mixed = items;
  return out;
}

export type TalentFeedRefreshResult = {
  talentProfileId: string;
  ok: boolean;
  written: number;
  error?: string;
};

/**
 * Refresh one talent's Instagram cache. On a 4xx the connection is flipped to
 * `needs_reauth` (the card's Reconnect state) but the cache is LEFT INTACT so
 * the public page keeps the last good snapshot.
 */
export async function refreshTalentInstagramFeed(
  admin: SupabaseClient,
  input: { talentProfileId: string; settings: Record<string, unknown>; limit?: number },
): Promise<TalentFeedRefreshResult> {
  const base = { talentProfileId: input.talentProfileId };
  const accessToken = await getDecryptedTalentIntegrationSecret(
    input.talentProfileId,
    INSTAGRAM_TALENT_INTEGRATION_KEY,
    "access_token",
  );
  if (!accessToken) return { ...base, ok: false, written: 0, error: "No stored access token." };

  const res = await fetchInstagramMedia({ accessToken, limit: input.limit });
  if (!res.ok) {
    if (res.status && res.status >= 400 && res.status < 500) {
      await upsertTalentIntegration({
        talentProfileId: input.talentProfileId,
        providerKey: INSTAGRAM_TALENT_INTEGRATION_KEY,
        status: "needs_reauth",
        settingsJson: { ...input.settings, needs_reconnect: true },
        lastError: res.error,
      });
    }
    return { ...base, ok: false, written: 0, error: res.error };
  }

  const now = new Date().toISOString();
  const rows = res.items.map((item) => ({
    talent_profile_id: input.talentProfileId,
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

  if (rows.length > 0) {
    const { error } = await admin
      .from(TABLE)
      .upsert(rows, { onConflict: "talent_profile_id,provider,external_id" });
    if (error) return { ...base, ok: false, written: 0, error: error.message };
  }

  // Deleted posts leave the cache. Read-then-delete-by-id so no vendor string
  // is ever interpolated into a filter (see pruneStaleFeedItems in feed-cache).
  const keep = new Set(rows.map((r) => r.external_id));
  const { data: existing, error: readError } = await admin
    .from(TABLE)
    .select("id, external_id")
    .eq("talent_profile_id", input.talentProfileId)
    .eq("provider", "instagram");
  if (readError) {
    return { ...base, ok: false, written: rows.length, error: readError.message };
  }
  const staleIds = ((existing ?? []) as Array<{ id: string; external_id: string }>)
    .filter((row) => !keep.has(row.external_id))
    .map((row) => row.id);
  for (let i = 0; i < staleIds.length; i += PRUNE_DELETE_CHUNK) {
    const { error } = await admin
      .from(TABLE)
      .delete()
      .in("id", staleIds.slice(i, i + PRUNE_DELETE_CHUNK));
    if (error) return { ...base, ok: false, written: rows.length, error: error.message };
  }

  await upsertTalentIntegration({
    talentProfileId: input.talentProfileId,
    providerKey: INSTAGRAM_TALENT_INTEGRATION_KEY,
    status: "connected",
    settingsJson: { ...input.settings, needs_reconnect: false, feed_last_synced_at: now },
    lastSyncAt: now,
    lastError: null,
  });
  return { ...base, ok: true, written: rows.length };
}

/** Drop a talent's cached posts (disconnect). Best-effort. */
export async function deleteTalentFeedItems(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<boolean> {
  const { error } = await admin.from(TABLE).delete().eq("talent_profile_id", talentProfileId);
  return !error;
}

/** Sweep every connected talent Instagram account. Used by the feed cron. */
export async function sweepTalentSocialFeeds(
  admin: SupabaseClient,
): Promise<{ scanned: number; succeeded: number; failed: number; items: number }> {
  const out = { scanned: 0, succeeded: 0, failed: 0, items: 0 };
  const { data, error } = await admin
    .from("talent_integrations")
    .select("talent_profile_id, settings_json")
    .eq("provider_key", INSTAGRAM_TALENT_INTEGRATION_KEY)
    .eq("connection_method", "oauth")
    .eq("status", "connected");
  if (error || !data) return out;

  for (const row of data as Array<{
    talent_profile_id: string;
    settings_json: Record<string, unknown> | null;
  }>) {
    out.scanned += 1;
    const res = await refreshTalentInstagramFeed(admin, {
      talentProfileId: row.talent_profile_id,
      settings: row.settings_json ?? {},
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
