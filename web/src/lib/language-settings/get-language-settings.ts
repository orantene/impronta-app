import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchLanguageSettings, fetchLanguageSettingsPublic } from "./fetch-language-settings";
import type { LanguageSettings } from "./types";

/**
 * Server components / actions: one fetch per request (React `cache`).
 * Include `translationInventoryVersion` in dependency by reading from DB inside fetch.
 */
export const getLanguageSettings = cache(async (supabase: SupabaseClient): Promise<LanguageSettings> => {
  return fetchLanguageSettings(supabase);
});

export const getLanguageSettingsPublicCached = cache(async (): Promise<LanguageSettings> => {
  return fetchLanguageSettingsPublic();
});
