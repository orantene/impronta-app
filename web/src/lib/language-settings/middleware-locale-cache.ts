import type { LanguageSettings } from "./types";
import { fetchLanguageSettingsPublic } from "./fetch-language-settings";

const TTL_MS = 60_000;
let cache: { loadedAt: number; value: LanguageSettings } | null = null;

/**
 * Edge middleware: short-TTL in-memory cache to avoid querying Supabase on every request.
 */
export async function getLanguageSettingsForMiddleware(): Promise<LanguageSettings> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) {
    return cache.value;
  }
  const value = await fetchLanguageSettingsPublic();
  cache = { loadedAt: now, value };
  return value;
}
