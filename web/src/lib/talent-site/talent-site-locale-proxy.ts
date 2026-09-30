/**
 * Proxy-side loader for a talent's languages (PR 4). Same result as
 * `loadTalentLocaleSettings`, but the platform settings come from the
 * proxy's own cached read (`getLanguageSettingsForMiddleware`, no React
 * cache) and the talent row from the cookie-less public client, cached
 * 60 s per talent so a talent host pays one small read a minute.
 */

import { getLanguageSettingsForMiddleware } from "@/lib/language-settings/middleware-locale-cache";
import {
  buildTalentLocaleSettings,
  loadTalentLocaleRow,
} from "@/lib/site-admin/server/talent-locale-settings";
import type { TenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

const TTL_MS = 60_000;
const cache = new Map<string, { loadedAt: number; value: TenantLocaleSettings }>();

export async function loadTalentLocaleSettingsForProxy(profileId: string): Promise<TenantLocaleSettings> {
  const now = Date.now();
  const hit = cache.get(profileId);
  if (hit && now - hit.loadedAt < TTL_MS) return hit.value;
  const [lang, row] = await Promise.all([
    getLanguageSettingsForMiddleware(),
    loadTalentLocaleRow(profileId).catch(() => null),
  ]);
  const value = buildTalentLocaleSettings(
    row?.preferred_locale ?? null,
    row?.secondary_locales ?? [],
    lang.publicLocales,
    lang.defaultLocale,
  );
  if (row) cache.set(profileId, { loadedAt: now, value });
  return value;
}
