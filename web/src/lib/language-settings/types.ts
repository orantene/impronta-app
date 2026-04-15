import { z } from "zod";

export const localeFallbackModeSchema = z.enum(["default_then_chain", "chain_only", "default_only"]);

export type LocaleFallbackMode = z.infer<typeof localeFallbackModeSchema>;

export const localePublicSwitcherModeSchema = z.enum(["prefix", "cookie", "both"]);

export type LocalePublicSwitcherMode = z.infer<typeof localePublicSwitcherModeSchema>;

export type AppLocaleRow = {
  code: string;
  label_native: string;
  label_en: string;
  enabled_admin: boolean;
  enabled_public: boolean;
  sort_order: number;
  is_default: boolean;
  fallback_locale: string | null;
  archived_at: string | null;
};

export type LanguageSettings = {
  locales: AppLocaleRow[];
  defaultLocale: string;
  /** Public site + URL prefixes (subset of locales). */
  publicLocales: string[];
  /** Translation Center + admin pickers. */
  adminLocales: string[];
  fallbackMode: LocaleFallbackMode;
  publicSwitcherMode: LocalePublicSwitcherMode;
  translationInventoryVersion: number;
  translationInventoryRefreshedAt: string | null;
};

/** Domains still backed by EN/ES-only columns or asymmetric bio service (plan §6). */
export type TranslationDomainLocaleMode =
  | "en_es_pair"
  | "dynamic_json"
  | "locale_rows"
  | "message_bundle";
