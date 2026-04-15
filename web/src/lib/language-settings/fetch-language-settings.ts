import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";

import {
  localeFallbackModeSchema,
  localePublicSwitcherModeSchema,
  type AppLocaleRow,
  type LanguageSettings,
} from "./types";

/** Used by `pathnames` and clients when DB-backed settings are unavailable. */
export const FALLBACK_LANGUAGE_SETTINGS: LanguageSettings = {
  locales: [
    {
      code: "en",
      label_native: "English",
      label_en: "English",
      enabled_admin: true,
      enabled_public: true,
      sort_order: 0,
      is_default: true,
      fallback_locale: null,
      archived_at: null,
    },
    {
      code: "es",
      label_native: "Español",
      label_en: "Spanish",
      enabled_admin: true,
      enabled_public: true,
      sort_order: 10,
      is_default: false,
      fallback_locale: "en",
      archived_at: null,
    },
  ],
  defaultLocale: "en",
  publicLocales: ["en", "es"],
  adminLocales: ["en", "es"],
  fallbackMode: "default_then_chain",
  publicSwitcherMode: "both",
  translationInventoryVersion: 0,
  translationInventoryRefreshedAt: null,
};

function parseJsonSetting<T>(raw: unknown, schema: z.ZodType<T>, fallback: T): T {
  if (raw == null) return fallback;
  const unwrapped =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return raw;
          }
        })()
      : raw;
  const parsed = schema.safeParse(unwrapped);
  return parsed.success ? parsed.data : fallback;
}

async function loadSettingsKeys(supabase: SupabaseClient): Promise<{
  fallbackMode: LanguageSettings["fallbackMode"];
  publicSwitcherMode: LanguageSettings["publicSwitcherMode"];
  version: number;
  refreshedAt: string | null;
}> {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [
      "locale_fallback_mode",
      "locale_public_switcher_mode",
      "translation_inventory_version",
      "translation_inventory_refreshed_at",
    ]);

  if (error || !data?.length) {
    return {
      fallbackMode: FALLBACK_LANGUAGE_SETTINGS.fallbackMode,
      publicSwitcherMode: FALLBACK_LANGUAGE_SETTINGS.publicSwitcherMode,
      version: FALLBACK_LANGUAGE_SETTINGS.translationInventoryVersion,
      refreshedAt: FALLBACK_LANGUAGE_SETTINGS.translationInventoryRefreshedAt,
    };
  }

  const map = new Map<string, unknown>();
  for (const row of data) {
    map.set(row.key, row.value);
  }

  const fallbackMode = parseJsonSetting(
    map.get("locale_fallback_mode"),
    localeFallbackModeSchema,
    FALLBACK_LANGUAGE_SETTINGS.fallbackMode,
  );
  const publicSwitcherMode = parseJsonSetting(
    map.get("locale_public_switcher_mode"),
    localePublicSwitcherModeSchema,
    FALLBACK_LANGUAGE_SETTINGS.publicSwitcherMode,
  );

  const versionRaw = map.get("translation_inventory_version");
  let version = FALLBACK_LANGUAGE_SETTINGS.translationInventoryVersion;
  if (typeof versionRaw === "number" && Number.isFinite(versionRaw)) version = versionRaw;
  else if (typeof versionRaw === "string") {
    const n = Number.parseInt(versionRaw, 10);
    if (!Number.isNaN(n)) version = n;
  }

  let refreshedAt: string | null = null;
  const refRaw = map.get("translation_inventory_refreshed_at");
  if (typeof refRaw === "string" && refRaw.length > 0) {
    refreshedAt = refRaw.startsWith('"') ? JSON.parse(refRaw) as string : refRaw;
  } else if (typeof refRaw === "number" || typeof refRaw === "boolean") {
    refreshedAt = String(refRaw);
  }

  return { fallbackMode, publicSwitcherMode, version, refreshedAt };
}

async function loadLocales(supabase: SupabaseClient): Promise<AppLocaleRow[]> {
  const { data, error } = await supabase
    .from("app_locales")
    .select(
      "code, label_native, label_en, enabled_admin, enabled_public, sort_order, is_default, fallback_locale, archived_at",
    )
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    if (!isPostgrestMissingColumnError(error)) {
      logServerError("language-settings/loadLocales", error);
    }
    return FALLBACK_LANGUAGE_SETTINGS.locales;
  }

  const rows = (data ?? []) as AppLocaleRow[];
  if (rows.length === 0) return FALLBACK_LANGUAGE_SETTINGS.locales;
  return rows;
}

/**
 * Loads language catalog + global keys. Use with public or server Supabase (RLS applies).
 */
export async function fetchLanguageSettings(supabase: SupabaseClient): Promise<LanguageSettings> {
  const [locales, keys] = await Promise.all([loadLocales(supabase), loadSettingsKeys(supabase)]);

  const defaultRow = locales.find((l) => l.is_default);
  const defaultLocale = defaultRow?.code ?? FALLBACK_LANGUAGE_SETTINGS.defaultLocale;

  const publicLocales = locales.filter((l) => l.enabled_public).map((l) => l.code);
  const adminLocales = locales.filter((l) => l.enabled_admin).map((l) => l.code);

  return {
    locales,
    defaultLocale,
    publicLocales: publicLocales.length > 0 ? publicLocales : FALLBACK_LANGUAGE_SETTINGS.publicLocales,
    adminLocales: adminLocales.length > 0 ? adminLocales : FALLBACK_LANGUAGE_SETTINGS.adminLocales,
    fallbackMode: keys.fallbackMode,
    publicSwitcherMode: keys.publicSwitcherMode,
    translationInventoryVersion: keys.version,
    translationInventoryRefreshedAt: keys.refreshedAt,
  };
}

export async function fetchLanguageSettingsPublic(): Promise<LanguageSettings> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return FALLBACK_LANGUAGE_SETTINGS;
  return fetchLanguageSettings(supabase);
}
