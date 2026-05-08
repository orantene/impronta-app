"use server";

// ============================================================================
// admin-workspace-settings.ts — agency-scoped settings actions for the
// prototype workspace Settings page.
// ============================================================================
//
// The prototype's Settings page has 6+ drawer/section save buttons that
// all use useSaveAndClose (toast-only stub). This file is the canonical
// home for the real server actions behind them. Each action requires
// staff tenant scope, validates with zod, writes to the appropriate
// agencies-table column or settings JSONB key, revalidates the layout.
//
// Branding ships first because it's the most user-visible (logo + colors
// flow into emails + storefront).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ─── Branding ────────────────────────────────────────────────────────────────
//
// Schema decision: branding lives in agencies.settings JSONB at key 'branding'
// rather than dedicated columns. The shape is small (5-7 fields) and
// rarely queried — JSONB is cheaper than 7 ALTER TABLE migrations + the
// resulting RLS reapproval. Future migration can extract specific fields
// (logo_url, primary_color) into typed columns if a query needs them.

const HEX_COLOR = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u, "Color must be a 6-digit hex like #0B0B0D");

const WATERMARK_POSITIONS = [
  "tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br",
] as const;

const watermarkPresetSchema = z.object({
  enabled:     z.boolean(),
  position:    z.enum(WATERMARK_POSITIONS),
  size_pct:    z.number().min(4).max(25),
  opacity:     z.number().min(0).max(1),
  padding_pct: z.number().min(0).max(10),
  variant:     z.enum(["light", "dark"]),
}).optional();

const updateBrandingSchema = z
  .object({
    tagline:           z.string().max(120).optional(),
    description:       z.string().max(500).optional(),
    primary_color:     HEX_COLOR.optional(),
    accent_color:      HEX_COLOR.optional(),
    logo_url:          z.string().url().optional(),
    sender_email:      z.string().email().optional(),
    watermark_preset:  watermarkPresetSchema,
  })
  .strict();

export type WatermarkPreset = NonNullable<z.infer<typeof watermarkPresetSchema>>;
export const DEFAULT_WATERMARK_PRESET: WatermarkPreset = {
  enabled: false,
  position: "br",
  size_pct: 12,
  opacity: 0.6,
  padding_pct: 4,
  variant: "light",
};

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

export type UpdateBrandingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateAgencyBranding(
  input: UpdateBrandingInput,
): Promise<UpdateBrandingResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = updateBrandingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid branding payload.",
    };
  }
  const v = parsed.data;

  // Read current settings so we can merge the branding subset (don't
  // clobber other settings keys that may exist alongside).
  const { data: agency, error: readErr } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (readErr) {
    logServerError("admin-workspace-settings.branding.read", readErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const currentSettings: Record<string, unknown> =
    typeof agency?.settings === "object" && agency.settings !== null
      ? (agency.settings as Record<string, unknown>)
      : {};
  const currentBranding: Record<string, unknown> =
    typeof currentSettings.branding === "object" && currentSettings.branding !== null
      ? (currentSettings.branding as Record<string, unknown>)
      : {};

  const nextBranding: Record<string, unknown> = { ...currentBranding };
  for (const [k, val] of Object.entries(v)) {
    if (val !== undefined) nextBranding[k] = val;
  }

  const nextSettings = { ...currentSettings, branding: nextBranding };

  const { error: updateErr } = await supabase
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (updateErr) {
    logServerError("admin-workspace-settings.branding.update", updateErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Workspace Account (display name, contact email, slug) ───────────────────
//
// Slug change is destructive (breaks bookmarks, public storefront URLs)
// so this action requires it to match the existing slug or be omitted.
// Slug change has its own dedicated flow (separate migration with
// redirect mapping) — out of scope for this slice.

const updateAccountSchema = z
  .object({
    display_name: z.string().min(1).max(120).optional(),
    contact_email: z.string().email().optional(),
  })
  .strict();

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export async function updateWorkspaceAccount(
  input: UpdateAccountInput,
): Promise<UpdateBrandingResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid account payload.",
    };
  }
  const v = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (v.display_name !== undefined) patch.display_name = v.display_name.trim();

  // contact_email is stored under settings JSONB (no dedicated column on
  // agencies). If display_name was the only update, skip the settings
  // round-trip.
  let nextSettings: Record<string, unknown> | undefined;
  if (v.contact_email !== undefined) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("settings")
      .eq("id", tenantId)
      .single();
    const currentSettings: Record<string, unknown> =
      typeof agency?.settings === "object" && agency.settings !== null
        ? (agency.settings as Record<string, unknown>)
        : {};
    nextSettings = { ...currentSettings, contact_email: v.contact_email };
    patch.settings = nextSettings;
  }

  const { error } = await supabase.from("agencies").update(patch).eq("id", tenantId);
  if (error) {
    logServerError("admin-workspace-settings.account.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Workspace fields (timezone, locale, currency) ───────────────────────────
//
// These map to existing typed columns: preferred_currency exists; locale
// goes in supported_locales (array); timezone needs the settings JSONB.

const updateWorkspaceFieldsSchema = z
  .object({
    preferred_currency: z
      .string()
      .length(3, "Currency code must be 3 letters (ISO 4217).")
      .optional(),
    timezone: z.string().max(60).optional(), // e.g. "America/Cancun"
    primary_locale: z
      .enum(["en", "es", "pt", "fr", "it"])
      .optional(),
  })
  .strict();

export type UpdateWorkspaceFieldsInput = z.infer<typeof updateWorkspaceFieldsSchema>;

export async function updateWorkspaceFields(
  input: UpdateWorkspaceFieldsInput,
): Promise<UpdateBrandingResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = updateWorkspaceFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid fields payload.",
    };
  }
  const v = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (v.preferred_currency !== undefined) {
    patch.preferred_currency = v.preferred_currency.toUpperCase();
  }

  let nextSettings: Record<string, unknown> | undefined;
  if (v.timezone !== undefined || v.primary_locale !== undefined) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("settings, supported_locales")
      .eq("id", tenantId)
      .single();
    const currentSettings: Record<string, unknown> =
      typeof agency?.settings === "object" && agency.settings !== null
        ? (agency.settings as Record<string, unknown>)
        : {};
    nextSettings = { ...currentSettings };
    if (v.timezone !== undefined) nextSettings.timezone = v.timezone;
    if (v.primary_locale !== undefined) {
      nextSettings.primary_locale = v.primary_locale;
      // Also push primary_locale to the front of supported_locales.
      const supported: string[] = Array.isArray(agency?.supported_locales)
        ? (agency.supported_locales as string[])
        : ["en", "es"];
      const filtered = supported.filter((l) => l !== v.primary_locale);
      patch.supported_locales = [v.primary_locale, ...filtered];
    }
    patch.settings = nextSettings;
  }

  const { error } = await supabase.from("agencies").update(patch).eq("id", tenantId);
  if (error) {
    logServerError("admin-workspace-settings.fields.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Per-image watermark override ────────────────────────────────────────────

const watermarkPresetSchema2 = z.object({
  enabled:     z.boolean(),
  position:    z.enum(["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const),
  size_pct:    z.number().min(4).max(25),
  opacity:     z.number().min(0).max(1),
  padding_pct: z.number().min(0).max(10),
  variant:     z.enum(["light", "dark"] as const),
}).optional();

const overrideSchema = z.object({
  mediaAssetId: z.string().uuid(),
  override: watermarkPresetSchema2,
}).strict();

export type UpdateWatermarkOverrideInput = z.infer<typeof overrideSchema>;

export async function updateMediaWatermarkOverride(
  input: UpdateWatermarkOverrideInput,
): Promise<UpdateBrandingResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid override." };
  }

  const { error } = await supabase
    .from("media_assets")
    .update({
      watermark_override_json: parsed.data.override ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.mediaAssetId);

  if (error) {
    logServerError("admin-workspace-settings.watermark-override", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
