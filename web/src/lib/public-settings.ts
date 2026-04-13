import { cache } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type PublicSettings = {
  contactEmail: string | null;
  directoryPublic: boolean;
  inquiriesOpen: boolean;
  watermarkEnabled: boolean;
  agencyWhatsAppNumber: string | null;
};

/**
 * When Supabase env is missing **or** the settings query fails: fail closed
 * (directory and inquiries off, etc.).
 *
 * When the query **succeeds** but a row is missing from the result map,
 * `asBoolean(..., fallback)` applies per key:
 * - `directory_public` and `inquiries_open` default to **true** unless
 *   `PUBLIC_SETTINGS_STRICT_MISSING=1` — then missing keys default to **false**
 *   (stricter production). Otherwise “healthy DB, keys not yet seeded” keeps
 *   surfaces open until admins seed `settings`.
 * - `watermark_enabled` defaults to **false** (safe default).
 * For stricter behavior (treat missing keys as off), seed explicit `false`
 * rows in `settings` or change those fallbacks to `false` after migration.
 */
const UNCONFIGURED_PUBLIC_SETTINGS: PublicSettings = {
  contactEmail: null,
  directoryPublic: false,
  inquiriesOpen: false,
  watermarkEnabled: false,
  agencyWhatsAppNumber: null,
};

/**
 * When `PUBLIC_SETTINGS_STRICT_MISSING=1`, rows missing from `settings` default
 * directory/inquiries to **off** instead of on (safer first deploy).
 */
function publicSettingsBooleanFallback(): boolean {
  return process.env.PUBLIC_SETTINGS_STRICT_MISSING !== "1";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function fetchPublicSettings(): Promise<PublicSettings> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return UNCONFIGURED_PUBLIC_SETTINGS;
  }

  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [
      "contact_email",
      "directory_public",
      "inquiries_open",
      "watermark_enabled",
      "agency_whatsapp_number",
    ]);

  if (error || !data) {
    return UNCONFIGURED_PUBLIC_SETTINGS;
  }

  const map = new Map<string, unknown>();
  for (const row of data) {
    map.set(row.key, row.value);
  }

  const openDefault = publicSettingsBooleanFallback();

  return {
    contactEmail: asString(map.get("contact_email")),
    directoryPublic: asBoolean(map.get("directory_public"), openDefault),
    inquiriesOpen: asBoolean(map.get("inquiries_open"), openDefault),
    watermarkEnabled: asBoolean(map.get("watermark_enabled"), false),
    agencyWhatsAppNumber: asString(map.get("agency_whatsapp_number")),
  };
}

/** One settings row-set read per request when multiple callers need it. */
export const getPublicSettings = cache(fetchPublicSettings);
