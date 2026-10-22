// ============================================================================
// admin-workspace-settings-language.ts — the canonical language write behind
// updateWorkspaceFields (TUL-1752: split out of admin-workspace-settings.ts to
// keep that file under the 800-line cap; behaviour unchanged).
// ============================================================================
//
// Plain module, NOT a "use server" file: it is a helper the server action
// calls with the staff-scoped client it already holds, never an endpoint.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { DEFAULT_PLATFORM_LOCALE, isLocale, type Locale } from "@/lib/site-admin/locales";
import { invalidateWorkspaceSeedPrimary } from "@/lib/site-admin/server/workspace-locale-seed.server";
import { invalidateTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { fetchLanguageSettings } from "@/lib/language-settings/fetch-language-settings";

export type LanguageSaveResult = { ok: true } | { ok: false; error: string };

export async function updateCanonicalWorkspaceLanguageSettings({
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
}): Promise<LanguageSaveResult> {
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
  invalidateWorkspaceSeedPrimary(tenantId);
  return { ok: true };
}
