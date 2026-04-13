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
 * - `directory_public` and `inquiries_open` default to **true** — matches a
 *   “healthy DB, keys not yet seeded” assumption so first deploys stay open
 *   until admins set toggles in `settings`.
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

export async function getPublicSettings(): Promise<PublicSettings> {
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

  return {
    contactEmail: asString(map.get("contact_email")),
    directoryPublic: asBoolean(map.get("directory_public"), true),
    inquiriesOpen: asBoolean(map.get("inquiries_open"), true),
    watermarkEnabled: asBoolean(map.get("watermark_enabled"), false),
    agencyWhatsAppNumber: asString(map.get("agency_whatsapp_number")),
  };
}
