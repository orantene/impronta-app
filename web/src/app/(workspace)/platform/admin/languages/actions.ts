"use server";

/**
 * WS1 — Platform Language Registry
 * Server actions that write to `app_locales`.
 * Auth: super_admin only (same gate as taxonomy/actions.ts).
 * Constraint: exactly one is_default row at all times.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getPlatformRole } from "@/lib/access/platform-role";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

// ─── BCP-47 validator ─────────────────────────────────────────────────────────
// Accepts e.g. "en", "es", "fr", "pt-BR", "zh-Hant-TW".
// Kept pragmatic: at least one primary subtag (2-8 ASCII alpha), optional
// region subtag (2-3 alpha or 3 digits), no ABNF exhaustiveness.
const BCP47_RE = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/;

const localeCodeSchema = z
  .string()
  .min(2, "Locale code must be at least 2 characters")
  .max(35, "Locale code too long")
  .regex(BCP47_RE, "Locale code must be a valid BCP-47 tag (e.g. en, es, fr, pt-BR)");

// ─── Helpers ──────────────────────────────────────────────────────────────────

type OkContext = { sb: SupabaseClient; actorId: string };

const LANGUAGES_BASE = "/platform/admin/languages";

/**
 * Returns a ready service-role client or redirects with an error.
 * Callers must `return` the result of this function if they get `null`
 * (the redirect is handled internally but TypeScript doesn't see it as `never`
 * without `next/server` version that declares redirect as never in this context).
 *
 * Pattern: destructure only after confirming non-null.
 */
async function requirePlatformAdmin(errorBase: string): Promise<OkContext | null> {
  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`${errorBase}?error=${encodeURIComponent("You must be signed in.")}`);
  }
  if (getPlatformRole(session.profile) !== "super_admin") {
    redirect(`${errorBase}?error=${encodeURIComponent("Forbidden — platform admin only.")}`);
  }
  const sb = createServiceRoleClient();
  if (!sb) {
    redirect(`${errorBase}?error=${encodeURIComponent("Platform service client unavailable.")}`);
  }
  return { sb, actorId: session.user.id };
}

function text(fd: FormData, key: string): string | null {
  const raw = fd.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function intOrNull(fd: FormData, key: string): number | null {
  const raw = text(fd, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function checked(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

function revalidateLanguageSurfaces(): void {
  revalidatePath(LANGUAGES_BASE);
  // Language settings are consumed by middleware + layout; bust broadly.
  revalidatePath("/", "layout");
}

// ─── Create locale ────────────────────────────────────────────────────────────

export async function createLocaleAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin(LANGUAGES_BASE);
  if (!ctx) return;

  const code = text(formData, "code");
  const labelNative = text(formData, "label_native");
  const labelEn = text(formData, "label_en");

  if (!code || !labelNative || !labelEn) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Code, native label, and English label are required")}`);
  }

  const codeValidation = localeCodeSchema.safeParse(code);
  if (!codeValidation.success) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent(codeValidation.error.issues[0]?.message ?? "Invalid locale code")}`);
  }

  // Guard: code must be unique (DB has a PK on code, but surface early).
  const { data: existing } = await ctx.sb
    .from("app_locales")
    .select("code")
    .eq("code", code)
    .maybeSingle();
  if (existing) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent(`Locale "${code}" already exists`)}`);
  }

  const sortOrder = intOrNull(formData, "sort_order") ?? 100;
  const enabledAdmin = checked(formData, "enabled_admin");
  const enabledPublic = checked(formData, "enabled_public");
  const fallbackLocale = text(formData, "fallback_locale");
  const makeDefault = checked(formData, "is_default");

  // Cannot set is_default=true during create unless we first clear the old default.
  // We handle this inside a sequential write: clear then insert.
  let isDefault = makeDefault;

  // If there is no existing default, allow.
  if (makeDefault) {
    const { data: currentDefault } = await ctx.sb
      .from("app_locales")
      .select("code")
      .eq("is_default", true)
      .is("archived_at", null)
      .maybeSingle();

    if (currentDefault && currentDefault.code !== code) {
      // Clear old default first.
      const { error: clearErr } = await ctx.sb
        .from("app_locales")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("code", currentDefault.code);
      if (clearErr) {
        logServerError("platform.languages.createLocale.clearDefault", clearErr);
        redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Could not clear previous default locale")}`);
      }
    }
    isDefault = true;
  }

  const { error } = await ctx.sb.from("app_locales").insert({
    code: codeValidation.data,
    label_native: labelNative,
    label_en: labelEn,
    enabled_admin: enabledAdmin,
    enabled_public: enabledPublic,
    is_default: isDefault,
    sort_order: sortOrder,
    fallback_locale: fallbackLocale,
    archived_at: null,
  });

  if (error) {
    logServerError("platform.languages.createLocale", error);
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent(`Could not create locale: ${error.message}`)}`);
  }

  revalidateLanguageSurfaces();
  redirect(`${LANGUAGES_BASE}?saved=create&code=${encodeURIComponent(codeValidation.data)}`);
}

// ─── Update locale ─────────────────────────────────────────────────────────────

export async function updateLocaleAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin(LANGUAGES_BASE);
  if (!ctx) return;

  const code = text(formData, "code");
  if (!code) redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Missing locale code")}`);

  const { data: beforeRow } = await ctx.sb
    .from("app_locales")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!beforeRow) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Locale not found")}`);
  }

  const labelNative = text(formData, "label_native") ?? beforeRow.label_native;
  const labelEn = text(formData, "label_en") ?? beforeRow.label_en;
  const enabledAdmin = formData.has("enabled_admin") ? checked(formData, "enabled_admin") : beforeRow.enabled_admin;
  const enabledPublic = formData.has("enabled_public") ? checked(formData, "enabled_public") : beforeRow.enabled_public;
  const fallbackLocale = text(formData, "fallback_locale") ?? beforeRow.fallback_locale;
  const sortOrder = intOrNull(formData, "sort_order") ?? beforeRow.sort_order;

  // Cannot disable the default locale.
  if (beforeRow.is_default && (!enabledAdmin || !enabledPublic)) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Cannot disable the default locale. Set another locale as default first.")}`);
  }

  const { error } = await ctx.sb
    .from("app_locales")
    .update({
      label_native: labelNative,
      label_en: labelEn,
      enabled_admin: enabledAdmin,
      enabled_public: enabledPublic,
      fallback_locale: fallbackLocale,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  if (error) {
    logServerError("platform.languages.updateLocale", error);
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Could not update locale")}`);
  }

  revalidateLanguageSurfaces();
  redirect(`${LANGUAGES_BASE}?saved=update&code=${encodeURIComponent(code)}`);
}

// ─── Set default locale ────────────────────────────────────────────────────────

export async function setDefaultLocaleAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin(LANGUAGES_BASE);
  if (!ctx) return;

  const code = text(formData, "code");
  if (!code) redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Missing locale code")}`);

  // The new default must be active and not archived.
  const { data: targetRow } = await ctx.sb
    .from("app_locales")
    .select("code, enabled_admin, enabled_public, archived_at")
    .eq("code", code)
    .maybeSingle();

  if (!targetRow) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Locale not found")}`);
  }
  if (targetRow.archived_at) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Cannot set an archived locale as default")}`);
  }

  const now = new Date().toISOString();

  // Clear old default(s).
  const { error: clearErr } = await ctx.sb
    .from("app_locales")
    .update({ is_default: false, updated_at: now })
    .eq("is_default", true)
    .neq("code", code);
  if (clearErr) {
    logServerError("platform.languages.setDefault.clear", clearErr);
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Could not clear previous default")}`);
  }

  // Set new default (also ensure it is enabled_admin + enabled_public).
  const { error } = await ctx.sb
    .from("app_locales")
    .update({ is_default: true, enabled_admin: true, enabled_public: true, updated_at: now })
    .eq("code", code);

  if (error) {
    logServerError("platform.languages.setDefault", error);
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Could not set default locale")}`);
  }

  revalidateLanguageSurfaces();
  redirect(`${LANGUAGES_BASE}?saved=default&code=${encodeURIComponent(code)}`);
}

// ─── Toggle enabled_admin / enabled_public ────────────────────────────────────

export async function toggleLocaleEnabledAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin(LANGUAGES_BASE);
  if (!ctx) return;

  const code = text(formData, "code");
  const field = text(formData, "field") as "enabled_admin" | "enabled_public" | null;
  const value = text(formData, "value") === "true";

  if (!code || (field !== "enabled_admin" && field !== "enabled_public")) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Invalid toggle request")}`);
  }

  // Guard: cannot disable the default locale.
  const { data: row } = await ctx.sb
    .from("app_locales")
    .select("is_default, archived_at")
    .eq("code", code)
    .maybeSingle();

  if (!row) redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Locale not found")}`);
  if (row.archived_at) redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Cannot toggle an archived locale")}`);
  if (row.is_default && !value) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Cannot disable the default locale")}`);
  }

  // field is narrowed to the union; use a typed patch object to avoid computed property type error.
  const patch: Record<string, boolean | string> = {
    updated_at: new Date().toISOString(),
  };
  patch[field] = value;

  const { error } = await ctx.sb
    .from("app_locales")
    .update(patch)
    .eq("code", code);

  if (error) {
    logServerError("platform.languages.toggle", error);
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Could not update locale")}`);
  }

  revalidateLanguageSurfaces();
  redirect(`${LANGUAGES_BASE}?saved=toggle&code=${encodeURIComponent(code)}`);
}

// ─── Archive locale ────────────────────────────────────────────────────────────

export async function archiveLocaleAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin(LANGUAGES_BASE);
  if (!ctx) return;

  const code = text(formData, "code");
  if (!code) redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Missing locale code")}`);

  const { data: row } = await ctx.sb
    .from("app_locales")
    .select("is_default, archived_at")
    .eq("code", code)
    .maybeSingle();

  if (!row) redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Locale not found")}`);
  if (row.is_default) {
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Cannot archive the default locale. Set another locale as default first.")}`);
  }
  if (row.archived_at) {
    redirect(`${LANGUAGES_BASE}?saved=archive&code=${encodeURIComponent(code)}`); // idempotent
  }

  const { error } = await ctx.sb
    .from("app_locales")
    .update({
      archived_at: new Date().toISOString(),
      is_default: false,
      enabled_admin: false,
      enabled_public: false,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  if (error) {
    logServerError("platform.languages.archive", error);
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Could not archive locale")}`);
  }

  revalidateLanguageSurfaces();
  redirect(`${LANGUAGES_BASE}?saved=archive&code=${encodeURIComponent(code)}`);
}

// ─── Restore locale ────────────────────────────────────────────────────────────

export async function restoreLocaleAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin(LANGUAGES_BASE);
  if (!ctx) return;

  const code = text(formData, "code");
  if (!code) redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Missing locale code")}`);

  const { error } = await ctx.sb
    .from("app_locales")
    .update({
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  if (error) {
    logServerError("platform.languages.restore", error);
    redirect(`${LANGUAGES_BASE}?error=${encodeURIComponent("Could not restore locale")}`);
  }

  revalidateLanguageSurfaces();
  redirect(`${LANGUAGES_BASE}?saved=restore&code=${encodeURIComponent(code)}`);
}
