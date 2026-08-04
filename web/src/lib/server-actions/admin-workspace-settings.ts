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
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import {
  DEFAULT_PLATFORM_LOCALE,
  isLocale,
  localeSchema,
  supportedLocalesSchema,
  type Locale,
} from "@/lib/site-admin/locales";
import { invalidateTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { fetchLanguageSettings } from "@/lib/language-settings/fetch-language-settings";
import { pgUuidSchema } from "@/lib/site-admin/validators";

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

  // Sync select fields into agency_branding so the public-readable table
  // (agency_branding) stays consistent. agencies.settings is staff-only so
  // storefront code cannot read it directly.
  if (v.watermark_preset !== undefined || v.logo_url !== undefined) {
    const { data: brandingRow } = await tenantScopedQuery(
      supabase,
      "agency_branding",
      tenantId,
    )
      .select("theme_json")
      .maybeSingle();
    const branding = brandingRow as { theme_json?: unknown } | null;
    const currentTheme: Record<string, unknown> =
      typeof branding?.theme_json === "object" && branding.theme_json !== null
        ? (branding.theme_json as Record<string, unknown>)
        : {};
    const themeUpdate: Record<string, unknown> = { ...currentTheme };
    if (v.watermark_preset !== undefined) themeUpdate.watermark_preset = v.watermark_preset;
    if (v.logo_url !== undefined) themeUpdate.logo_url = v.logo_url;
    const publicBrandingPatch: Record<string, unknown> = {
      tenant_id: tenantId,
      theme_json: themeUpdate,
      updated_at: new Date().toISOString(),
    };
    // Non-fatal if this fails — settings are still saved.
    // (favorite_icon was removed from this writer 2026-08-04: the column fed a
    // context no component reads — cards follow the `favorite.icon` design
    // token, edited in Website → Card Design.)
    await tenantScopedQuery(supabase, "agency_branding", tenantId)
      .upsert(publicBrandingPatch, { onConflict: "tenant_id" });
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

// ─── Workspace fields (timezone, language, currency) ─────────────────────────
//
// Currency and timezone live on the agency/settings surface. Tenant public
// language is canonical on agency_business_identity.default_locale +
// supported_locales because middleware and storefront rendering read that row.

const updateWorkspaceFieldsSchema = z
  .object({
    preferred_currency: z
      .string()
      .length(3, "Currency code must be 3 letters (ISO 4217).")
      .optional(),
    timezone: z.string().max(60).optional(), // e.g. "America/Cancun"
    default_locale: localeSchema.optional(),
    active_locales: supportedLocalesSchema.optional(),
    show_language_switcher: z.boolean().optional(),
    /** @deprecated use default_locale; kept so older clients fail safe. */
    primary_locale: localeSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const defaultLocale = value.default_locale ?? value.primary_locale;
    if (
      defaultLocale &&
      value.active_locales &&
      !value.active_locales.includes(defaultLocale)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["default_locale"],
        message: "Default language must be one of the active languages.",
      });
    }
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
  if (v.timezone !== undefined) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("settings")
      .eq("id", tenantId)
      .single();
    const currentSettings: Record<string, unknown> =
      typeof agency?.settings === "object" && agency.settings !== null
        ? (agency.settings as Record<string, unknown>)
        : {};
    nextSettings = { ...currentSettings };
    if (v.timezone !== undefined) nextSettings.timezone = v.timezone;
    patch.settings = nextSettings;
  }

  if (Object.keys(patch).length > 1) {
    const { error } = await supabase.from("agencies").update(patch).eq("id", tenantId);
    if (error) {
      logServerError("admin-workspace-settings.fields.update", error);
      return { ok: false, error: CLIENT_ERROR.update };
    }
  }

  const requestedDefaultLocale = v.default_locale ?? v.primary_locale;
  if (
    requestedDefaultLocale ||
    v.active_locales ||
    v.show_language_switcher !== undefined
  ) {
    const languageResult = await updateCanonicalWorkspaceLanguageSettings({
      supabase,
      tenantId,
      actorProfileId: auth.user.id,
      defaultLocale: requestedDefaultLocale,
      activeLocales: v.active_locales,
      showLanguageSwitcher: v.show_language_switcher,
    });
    if (!languageResult.ok) return languageResult;
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true };
}

async function updateCanonicalWorkspaceLanguageSettings({
  supabase,
  tenantId,
  actorProfileId,
  defaultLocale,
  activeLocales,
  showLanguageSwitcher,
}: {
  supabase: SupabaseClient;
  tenantId: string;
  actorProfileId: string;
  defaultLocale?: Locale;
  activeLocales?: readonly Locale[];
  showLanguageSwitcher?: boolean;
}): Promise<UpdateBrandingResult> {
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("display_name, supported_locales")
    .eq("id", tenantId)
    .maybeSingle();
  if (agencyError || !agency) {
    logServerError("admin-workspace-settings.language.agency", agencyError);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const { data: current, error: currentError } = await tenantScopedQuery(
    supabase,
    "agency_business_identity",
    tenantId,
  )
    .select("public_name, default_locale, supported_locales, show_language_switcher, version")
    .maybeSingle();
  if (currentError) {
    logServerError("admin-workspace-settings.language.identity.read", currentError);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const currentIdentity = current as {
    public_name?: string | null;
    default_locale?: string | null;
    supported_locales?: unknown;
    show_language_switcher?: boolean | null;
    version?: number | null;
  } | null;
  const currentLocales = Array.isArray(currentIdentity?.supported_locales)
    ? currentIdentity.supported_locales.filter(isLocale)
    : [];
  const nextDefault =
    defaultLocale ??
    (isLocale(currentIdentity?.default_locale)
      ? currentIdentity.default_locale
      : DEFAULT_PLATFORM_LOCALE);
  const nextActive = Array.from(
    new Set(
      (activeLocales && activeLocales.length > 0
        ? activeLocales
        : currentLocales.length > 0
          ? currentLocales
          : [nextDefault]
      ).filter(isLocale),
    ),
  );

  if (nextActive.length === 0) {
    return { ok: false, error: "At least one language must be active." };
  }
  if (!nextActive.includes(nextDefault)) {
    return { ok: false, error: "Default language must be active." };
  }

  // Registry gate (replaces the dropped en/es-only DB CHECK): every chosen
  // locale must be an ENABLED PUBLIC locale in the `app_locales` registry.
  // The registry — not a hardcoded union — is the platform source of truth for
  // which languages a tenant may publish. Reads are TTL-free here (settings
  // saves are rare) and degrade safely: a registry-read failure falls back to
  // the BCP-47 shape check the schema already enforced (never blocks a save on
  // a transient DB blip).
  const language = await fetchLanguageSettings(supabase).catch(() => null);
  if (language) {
    const allowedPublic = new Set(language.publicLocales);
    const rejected = nextActive.filter((l) => !allowedPublic.has(l));
    if (rejected.length > 0) {
      return {
        ok: false,
        error: `Unsupported language${rejected.length > 1 ? "s" : ""}: ${rejected.join(", ")}. Enable it in the platform language registry first.`,
      };
    }
  }

  const nextVersion = (currentIdentity?.version ?? 0) + 1;
  const publicName =
    currentIdentity?.public_name?.trim() ||
    (typeof agency.display_name === "string" && agency.display_name.trim()) ||
    "Workspace";

  const payload = {
    public_name: publicName,
    default_locale: nextDefault,
    supported_locales: nextActive,
    show_language_switcher:
      showLanguageSwitcher ?? currentIdentity?.show_language_switcher ?? true,
    updated_by: actorProfileId,
    version: nextVersion,
  };

  const { error: identityError } = current
    ? await tenantScopedQuery(supabase, "agency_business_identity", tenantId)
        .update(payload)
    : await tenantScopedQuery(supabase, "agency_business_identity", tenantId)
        .insert(payload);

  if (identityError) {
    logServerError("admin-workspace-settings.language.identity.update", identityError);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const { error: agencyMirrorError } = await supabase
    .from("agencies")
    .update({
      supported_locales: nextActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);
  if (agencyMirrorError) {
    logServerError("admin-workspace-settings.language.agency_mirror", agencyMirrorError);
  }

  invalidateTenantLocaleSettings(tenantId);
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
  mediaAssetId: pgUuidSchema(),
  override: watermarkOverridePresetSchema,
}).strict();

export type UpdateWatermarkOverrideInput = z.infer<typeof overrideSchema>;

export async function updateMediaWatermarkOverride(
  input: UpdateWatermarkOverrideInput,
): Promise<UpdateBrandingResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid override." };
  }

  const { error } = await tenantScopedQuery(supabase, "media_assets", tenantId)
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

/** A selectable language sourced from the `app_locales` registry. */
export type AgencyLocaleOption = {
  code: Locale;
  /** Native label, e.g. "Español". */
  labelNative: string;
  /** English label, e.g. "Spanish". */
  labelEn: string;
};

export type AgencyAccountSettings = {
  displayName: string | null;
  contactEmail: string | null;
  timezone: string | null;
  primaryLocale: string | null;
  defaultLocale: Locale;
  activeLocales: Locale[];
  showLanguageSwitcher: boolean;
  preferredCurrency: string | null;
  /**
   * Languages the agency may pick from — the ENABLED PUBLIC locales in the
   * platform `app_locales` registry. Replaces the old hardcoded en/es list in
   * the Workspace settings drawer. Always includes any locale already active
   * for this tenant (so a previously-saved language never silently disappears
   * from the picker even if it was later disabled in the registry).
   */
  availableLocales: AgencyLocaleOption[];
};

export type LoadAccountResult =
  | { ok: true; data: AgencyAccountSettings }
  | { ok: false; error: string };

export async function loadWorkspaceAccountSettings(): Promise<LoadAccountResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const [
    { data: agency, error },
    { data: identity, error: identityError },
    language,
  ] = await Promise.all([
    supabase
    .from("agencies")
    .select("display_name, settings, preferred_currency, supported_locales")
    .eq("id", tenantId)
    .single(),
    tenantScopedQuery(supabase, "agency_business_identity", tenantId)
      .select("default_locale, supported_locales, show_language_switcher")
      .maybeSingle(),
    fetchLanguageSettings(supabase).catch(() => null),
  ]);

  if (error) {
    logServerError("admin-workspace-settings.account.load", error);
    return { ok: false, error: "Could not load workspace settings." };
  }
  if (identityError) {
    logServerError("admin-workspace-settings.account.identity.load", identityError);
  }

  const settings = (typeof agency?.settings === "object" && agency.settings !== null
    ? agency.settings
    : {}) as Record<string, unknown>;
  const identityRow = identity as {
    default_locale?: string | null;
    supported_locales?: unknown;
    show_language_switcher?: boolean | null;
  } | null;
  const identityLocales = Array.isArray(identityRow?.supported_locales)
    ? identityRow.supported_locales.filter(isLocale)
    : [];
  const agencyLocales = Array.isArray(agency?.supported_locales)
    ? agency.supported_locales.filter(isLocale)
    : [];
  const activeLocales = identityLocales.length > 0
    ? identityLocales
    : agencyLocales.length > 0
      ? agencyLocales
      : [DEFAULT_PLATFORM_LOCALE];
  const defaultLocale = isLocale(identityRow?.default_locale)
    ? identityRow.default_locale
    : activeLocales[0] ?? DEFAULT_PLATFORM_LOCALE;
  const showLanguageSwitcher = identityRow?.show_language_switcher ?? true;

  // Registry-sourced picker options (enabled PUBLIC locales). Union with any
  // locale already active for this tenant so a previously-saved language is
  // never dropped from the UI if the registry later disables it.
  const labelByCode = new Map<string, { labelNative: string; labelEn: string }>();
  for (const row of language?.locales ?? []) {
    labelByCode.set(row.code, { labelNative: row.label_native, labelEn: row.label_en });
  }
  const optionCodes: string[] = [];
  const seen = new Set<string>();
  const pushCode = (code: string) => {
    if (!isLocale(code) || seen.has(code)) return;
    seen.add(code);
    optionCodes.push(code);
  };
  for (const code of language?.publicLocales ?? []) pushCode(code);
  for (const code of activeLocales) pushCode(code);
  if (optionCodes.length === 0) pushCode(defaultLocale);
  const availableLocales: AgencyLocaleOption[] = optionCodes.map((code) => {
    const labels = labelByCode.get(code);
    return {
      code,
      labelNative: labels?.labelNative ?? code.toUpperCase(),
      labelEn: labels?.labelEn ?? code.toUpperCase(),
    };
  });

  return {
    ok: true,
    data: {
      displayName:       typeof agency?.display_name === "string" ? agency.display_name : null,
      contactEmail:      typeof settings.contact_email === "string" ? settings.contact_email : null,
      timezone:          typeof settings.timezone === "string" ? settings.timezone : null,
      primaryLocale:     defaultLocale,
      defaultLocale,
      activeLocales,
      showLanguageSwitcher,
      preferredCurrency: typeof agency?.preferred_currency === "string" ? agency.preferred_currency : null,
      availableLocales,
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
