"use server";

/**
 * Phase 5 / M1 — identity save action.
 *
 * Thin server-action wrapper over `saveIdentity()`. Responsibilities:
 *   - guard: staff role + tenant scope,
 *   - parse: Zod (identityFormSchema) over incoming FormData,
 *   - delegate: lib-layer save (capability, concurrency, revision, audit, cache),
 *   - shape: return `IdentityActionState` for the client `useActionState` hook.
 */

import { PLATFORM_LOCALES, identityFormSchema } from "@/lib/site-admin";
import { saveIdentity } from "@/lib/site-admin/server/identity";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type IdentityActionState =
  | {
      ok: true;
      version: number;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      code?: string;
      currentVersion?: number;
    }
  | undefined;

function single(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function singleOrNull(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" ? v : null;
}

function parseSupportedLocales(formData: FormData): string[] {
  const entries = formData
    .getAll("supportedLocales")
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  // Preserve input order + drop duplicates.
  return Array.from(new Set(entries));
}

export async function saveIdentityAction(
  _prev: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing site settings.",
    };
  }

  // Parse + validate.
  const rawSupported = parseSupportedLocales(formData);
  const parsed = identityFormSchema.safeParse({
    publicName: single(formData, "publicName"),
    legalName: singleOrNull(formData, "legalName"),
    tagline: singleOrNull(formData, "tagline"),
    footerTagline: singleOrNull(formData, "footerTagline"),
    defaultLocale: single(formData, "defaultLocale"),
    supportedLocales: rawSupported.length ? rawSupported : [PLATFORM_LOCALES[0]],
    contactEmail: singleOrNull(formData, "contactEmail"),
    contactPhone: singleOrNull(formData, "contactPhone"),
    whatsapp: singleOrNull(formData, "whatsapp"),
    addressCity: singleOrNull(formData, "addressCity"),
    addressCountry: singleOrNull(formData, "addressCountry"),
    serviceArea: singleOrNull(formData, "serviceArea"),
    socialInstagram: singleOrNull(formData, "socialInstagram"),
    socialTiktok: singleOrNull(formData, "socialTiktok"),
    socialFacebook: singleOrNull(formData, "socialFacebook"),
    socialLinkedin: singleOrNull(formData, "socialLinkedin"),
    socialYoutube: singleOrNull(formData, "socialYoutube"),
    socialX: singleOrNull(formData, "socialX"),
    seoDefaultTitle: singleOrNull(formData, "seoDefaultTitle"),
    seoDefaultDescription: singleOrNull(formData, "seoDefaultDescription"),
    seoDefaultShareImageMediaAssetId: singleOrNull(
      formData,
      "seoDefaultShareImageMediaAssetId",
    ),
    primaryCtaLabel: singleOrNull(formData, "primaryCtaLabel"),
    primaryCtaHref: singleOrNull(formData, "primaryCtaHref"),
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "Some fields need attention.",
      fieldErrors,
    };
  }

  try {
    const result = await saveIdentity(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });

    if (!result.ok) {
      return {
        ok: false,
        error:
          result.code === "VERSION_CONFLICT"
            ? "Someone else edited these settings; reload and try again."
            : (result.message ?? CLIENT_ERROR.update),
        code: result.code,
        currentVersion: result.currentVersion,
      };
    }

    return { ok: true, version: result.data.version };
  } catch (error) {
    logServerError("site-admin/identity/save", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
