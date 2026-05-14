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
    tagline:          z.string().max(120).optional(),
    description:      z.string().max(500).optional(),
    primary_color:    HEX_COLOR.optional(),
    accent_color:     HEX_COLOR.optional(),
    logo_url:         z.string().url().optional(),
    sender_email:     z.string().email().optional(),
    watermark_preset: watermarkPresetSchema,
  })
  .strict();

export type WatermarkPreset = NonNullable<z.infer<typeof watermarkPresetSchema>>;
// DEFAULT_WATERMARK_PRESET lives in ./admin-workspace-settings-constants.ts —
// "use server" files cannot export non-async constants (Turbopack rejects them).

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

  // Also sync watermark preset + logo URL into agency_branding.theme_json so
  // the public-readable agency_branding table has the latest watermark config.
  // agency_branding is publicly readable; agencies.settings is staff-only.
  if (v.watermark_preset !== undefined || v.logo_url !== undefined) {
    const { data: brandingRow } = await supabase
      .from("agency_branding")
      .select("theme_json")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const currentTheme: Record<string, unknown> =
      typeof brandingRow?.theme_json === "object" && brandingRow.theme_json !== null
        ? (brandingRow.theme_json as Record<string, unknown>)
        : {};
    const themeUpdate: Record<string, unknown> = { ...currentTheme };
    if (v.watermark_preset !== undefined) themeUpdate.watermark_preset = v.watermark_preset;
    if (v.logo_url !== undefined) themeUpdate.logo_url = v.logo_url;
    // Non-fatal if this fails — settings are still saved
    await supabase
      .from("agency_branding")
      .upsert({ tenant_id: tenantId, theme_json: themeUpdate, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
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

  revalidatePath(`/${auth.tenantSlug}`, "layout");
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

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true };
}

// ─── Per-image watermark override ────────────────────────────────────────────

const watermarkOverridePresetSchema = z.object({
  enabled:     z.boolean(),
  position:    z.enum(["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const),
  size_pct:    z.number().min(4).max(25),
  opacity:     z.number().min(0).max(1),
  padding_pct: z.number().min(0).max(10),
  variant:     z.enum(["light", "dark"] as const),
}).optional();

const overrideSchema = z.object({
  mediaAssetId: z.string().uuid(),
  override: watermarkOverridePresetSchema,
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

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true };
}

// ─── Auto-acknowledgement (Step 13) ─────────────────────────────────────────
//
// When enabled (default), the inquiry engine inserts a system message
// into the Client thread on every new inquiry submission. Gives clients
// an instant acknowledgement before the coordinator picks up the inquiry.

const autoAckSchema = z
  .object({
    auto_ack_enabled: z.boolean(),
    auto_ack_message: z.string().min(1).max(500),
  })
  .strict();

export type UpdateAutoAckInput = z.infer<typeof autoAckSchema>;
export type UpdateAutoAckResult = { ok: true } | { ok: false; error: string };

export async function updateAgencyAutoAck(
  input: UpdateAutoAckInput,
): Promise<UpdateAutoAckResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = autoAckSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid auto-ack payload." };
  }
  const { auto_ack_enabled, auto_ack_message } = parsed.data;

  const { error } = await supabase
    .from("agencies")
    .update({
      auto_ack_enabled,
      auto_ack_message: auto_ack_message.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (error) {
    logServerError("admin-workspace-settings.auto-ack.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true };
}

export type LoadAutoAckResult =
  | { ok: true; data: { autoAckEnabled: boolean; autoAckMessage: string } }
  | { ok: false; error: string };

export async function loadAgencyAutoAck(): Promise<LoadAutoAckResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("auto_ack_enabled, auto_ack_message")
    .eq("id", tenantId)
    .single();

  if (error) {
    logServerError("admin-workspace-settings.auto-ack.load", error);
    return { ok: false, error: "Could not load auto-ack settings." };
  }

  return {
    ok: true,
    data: {
      autoAckEnabled:
        typeof agency?.auto_ack_enabled === "boolean" ? agency.auto_ack_enabled : true,
      autoAckMessage:
        typeof agency?.auto_ack_message === "string" && agency.auto_ack_message.trim()
          ? agency.auto_ack_message
          : "Thanks — we'll get back to you within 4 hours.",
    },
  };
}

// ─── Load workspace account + fields settings ────────────────────────────────

export type AgencyAccountSettings = {
  displayName: string | null;
  contactEmail: string | null;
  timezone: string | null;
  primaryLocale: string | null;
  preferredCurrency: string | null;
};

export type LoadAccountResult =
  | { ok: true; data: AgencyAccountSettings }
  | { ok: false; error: string };

export async function loadWorkspaceAccountSettings(): Promise<LoadAccountResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("display_name, settings, preferred_currency")
    .eq("id", tenantId)
    .single();

  if (error) {
    logServerError("admin-workspace-settings.account.load", error);
    return { ok: false, error: "Could not load workspace settings." };
  }

  const settings = (typeof agency?.settings === "object" && agency.settings !== null
    ? agency.settings
    : {}) as Record<string, unknown>;

  return {
    ok: true,
    data: {
      displayName:       typeof agency?.display_name === "string" ? agency.display_name : null,
      contactEmail:      typeof settings.contact_email === "string" ? settings.contact_email : null,
      timezone:          typeof settings.timezone === "string" ? settings.timezone : null,
      primaryLocale:     typeof settings.primary_locale === "string" ? settings.primary_locale : null,
      preferredCurrency: typeof agency?.preferred_currency === "string" ? agency.preferred_currency : null,
    },
  };
}

// ─── Load saved branding settings ────────────────────────────────────────────

export type AgencyBrandingSettings = {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  tagline: string | null;
  description: string | null;
  watermarkPreset: WatermarkPreset | null;
};

export type LoadBrandingResult =
  | { ok: true; data: AgencyBrandingSettings }
  | { ok: false; error: string };

export async function loadAgencyBrandingSettings(): Promise<LoadBrandingResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();

  if (error) {
    logServerError("admin-workspace-settings.branding.load", error);
    return { ok: false, error: "Could not load branding settings." };
  }

  const settings = (typeof agency?.settings === "object" && agency.settings !== null
    ? agency.settings
    : {}) as Record<string, unknown>;
  const branding = (typeof settings.branding === "object" && settings.branding !== null
    ? settings.branding
    : {}) as Record<string, unknown>;

  return {
    ok: true,
    data: {
      logoUrl:         typeof branding.logo_url === "string" ? branding.logo_url : null,
      primaryColor:    typeof branding.primary_color === "string" ? branding.primary_color : null,
      accentColor:     typeof branding.accent_color === "string" ? branding.accent_color : null,
      tagline:         typeof branding.tagline === "string" ? branding.tagline : null,
      description:     typeof branding.description === "string" ? branding.description : null,
      watermarkPreset: (branding.watermark_preset && typeof branding.watermark_preset === "object"
        ? branding.watermark_preset as WatermarkPreset
        : null),
    },
  };
}
