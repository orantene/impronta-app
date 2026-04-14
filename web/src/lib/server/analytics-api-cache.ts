import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function getCachedJson<T>(cacheKey: string): Promise<T | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("analytics_api_cache")
    .select("response, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.response as T;
}

export async function setCachedJson(
  cacheKey: string,
  provider: string,
  response: unknown,
  ttlMs: number,
): Promise<void> {
  const supabase = createServiceRoleClient();
  if (!supabase) return;

  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await supabase.from("analytics_api_cache").upsert(
    {
      cache_key: cacheKey,
      provider,
      response: response as never,
      expires_at: expiresAt,
    },
    { onConflict: "cache_key" },
  );
}

export async function withAnalyticsCache<T>(
  cacheKey: string,
  provider: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await getCachedJson<T>(cacheKey);
  if (hit !== null) return hit;
  const fresh = await fetcher();
  await setCachedJson(cacheKey, provider, fresh, ttlMs);
  return fresh;
}
