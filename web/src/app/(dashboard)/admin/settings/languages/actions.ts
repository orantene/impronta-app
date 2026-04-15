"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/server/action-guards";

const codeSchema = z
  .string()
  .min(2)
  .max(24)
  .regex(/^[a-z]{2}(-[a-z0-9]+)*$/i, "Use a BCP-47 style code (e.g. en, es, pt-br).");

export type LanguageSettingsActionResult = { error?: string; success?: true };

export async function upsertAppLocale(input: {
  code: string;
  label_native: string;
  label_en: string;
  enabled_admin: boolean;
  enabled_public: boolean;
  sort_order: number;
  fallback_locale: string | null;
}): Promise<LanguageSettingsActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const code = codeSchema.parse(input.code.trim().toLowerCase());
  const parsed = z
    .object({
      label_native: z.string().min(1).max(120),
      label_en: z.string().min(1).max(120),
      enabled_admin: z.boolean(),
      enabled_public: z.boolean(),
      sort_order: z.number().int().min(0).max(9999),
      fallback_locale: z.string().min(2).max(24).nullable(),
    })
    .safeParse(input);

  if (!parsed.success) return { error: "Invalid data." };

  let fb: string | null = parsed.data.fallback_locale;
  if (fb) {
    fb = fb.trim().toLowerCase();
    if (fb === code) return { error: "Fallback cannot be the same as the locale code." };
  }

  const { error } = await auth.supabase.from("app_locales").upsert(
    {
      code,
      label_native: parsed.data.label_native.trim(),
      label_en: parsed.data.label_en.trim(),
      enabled_admin: parsed.data.enabled_admin,
      enabled_public: parsed.data.enabled_public,
      sort_order: parsed.data.sort_order,
      fallback_locale: fb,
      archived_at: null,
    },
    { onConflict: "code" },
  );

  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

export async function setDefaultLocale(code: string): Promise<LanguageSettingsActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const c = codeSchema.parse(code.trim().toLowerCase());

  const { error: e1 } = await auth.supabase.from("app_locales").update({ is_default: false }).neq("code", "");
  if (e1) return { error: e1.message };

  const { error: e2 } = await auth.supabase.from("app_locales").update({ is_default: true }).eq("code", c);
  if (e2) return { error: e2.message };

  revalidateAll();
  return { success: true };
}

export async function archiveLocale(code: string): Promise<LanguageSettingsActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const c = codeSchema.parse(code.trim().toLowerCase());

  const { data: row } = await auth.supabase.from("app_locales").select("is_default").eq("code", c).maybeSingle();
  if ((row as { is_default?: boolean } | null)?.is_default) {
    return { error: "Change the default language before archiving this locale." };
  }

  const { error } = await auth.supabase
    .from("app_locales")
    .update({ archived_at: new Date().toISOString(), enabled_public: false, enabled_admin: false })
    .eq("code", c);

  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

export async function updateLocaleFallback(input: {
  code: string;
  fallback_locale: string | null;
}): Promise<LanguageSettingsActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const code = codeSchema.parse(input.code.trim().toLowerCase());
  let fb = input.fallback_locale?.trim().toLowerCase() ?? null;
  if (fb === "") fb = null;
  if (fb === code) return { error: "Fallback cannot point to itself." };

  const { error } = await auth.supabase.from("app_locales").update({ fallback_locale: fb }).eq("code", code);
  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

const fallbackModeSchema = z.enum(["default_then_chain", "chain_only", "default_only"]);
const switcherModeSchema = z.enum(["prefix", "cookie", "both"]);

export async function updateLocaleFallbackMode(mode: string): Promise<LanguageSettingsActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const m = fallbackModeSchema.parse(mode);
  const { error } = await auth.supabase.from("settings").upsert(
    {
      key: "locale_fallback_mode",
      value: m,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

export async function updateLocalePublicSwitcherMode(mode: string): Promise<LanguageSettingsActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const m = switcherModeSchema.parse(mode);
  const { error } = await auth.supabase.from("settings").upsert(
    {
      key: "locale_public_switcher_mode",
      value: m,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

export async function refreshTranslationInventory(): Promise<LanguageSettingsActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const { data: row } = await auth.supabase
    .from("settings")
    .select("value")
    .eq("key", "translation_inventory_version")
    .maybeSingle();

  let next = 1;
  const raw = row?.value as unknown;
  if (typeof raw === "number") next = raw + 1;
  else if (typeof raw === "string") {
    const n = Number.parseInt(raw.replaceAll('"', ""), 10);
    if (!Number.isNaN(n)) next = n + 1;
  }

  const now = new Date().toISOString();
  const { error: e1 } = await auth.supabase.from("settings").upsert(
    {
      key: "translation_inventory_version",
      value: next,
      updated_at: now,
    },
    { onConflict: "key" },
  );
  if (e1) return { error: e1.message };

  const { error: e2 } = await auth.supabase.from("settings").upsert(
    {
      key: "translation_inventory_refreshed_at",
      value: now,
      updated_at: now,
    },
    { onConflict: "key" },
  );
  if (e2) return { error: e2.message };

  revalidateAll();
  return { success: true };
}

function revalidateAll() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/languages");
  revalidatePath("/admin/translations");
  revalidatePath("/admin");
}
