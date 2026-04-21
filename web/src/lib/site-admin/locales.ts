/**
 * Phase 5 — Platform locale allow-list.
 *
 * SINGLE SOURCE OF TRUTH for the set of locales the platform ships today.
 *
 * Every other layer MUST stay aligned with this file:
 *   - DB CHECK:           agency_business_identity_supported_locales_platform_allowed
 *                         (migration 20260620110000_saas_p5_m1_identity_extensions.sql)
 *   - Middleware:         web/src/middleware.ts locale canonicalization
 *   - CMS validation:     any Zod schema that accepts a locale
 *   - Language settings:  web/src/lib/language-settings/*
 *
 * If a new locale ships, update ALL FIVE places (this file, the DB CHECK, the
 * middleware, the CMS validator, and language settings) in a single PR.
 *
 * Non-goals for Phase 5:
 *   - Tenant-declared locales beyond this list. Agencies pick a subset from
 *     PLATFORM_LOCALES; they cannot add new ones.
 *   - Region variants (e.g. "es-MX" vs "es-ES"). We ship pure ISO 639-1 codes.
 */

import { z } from "zod";

export const PLATFORM_LOCALES = ["en", "es"] as const;

export type Locale = (typeof PLATFORM_LOCALES)[number];

export const DEFAULT_PLATFORM_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (PLATFORM_LOCALES as readonly string[]).includes(value);
}

/** Zod validator for a single locale. */
export const localeSchema = z.enum(PLATFORM_LOCALES);

/**
 * Zod validator for `agency_business_identity.supported_locales`.
 *
 * Rules:
 *   - non-empty
 *   - every entry is a platform locale
 *   - no duplicates
 */
export const supportedLocalesSchema = z
  .array(localeSchema)
  .min(1, "At least one locale is required")
  .refine(
    (arr) => new Set(arr).size === arr.length,
    { message: "Supported locales must be unique" },
  );

/**
 * Zod validator for the `{ defaultLocale, supportedLocales }` pair. Enforces
 * that the default is a member of the supported list — the same rule the DB
 * CHECK `agency_business_identity_default_in_supported` enforces server-side.
 */
export const localeSettingsSchema = z
  .object({
    defaultLocale: localeSchema,
    supportedLocales: supportedLocalesSchema,
  })
  .refine(
    (value) => value.supportedLocales.includes(value.defaultLocale),
    {
      message: "Default locale must be in supportedLocales",
      path: ["defaultLocale"],
    },
  );

export type LocaleSettings = z.infer<typeof localeSettingsSchema>;
