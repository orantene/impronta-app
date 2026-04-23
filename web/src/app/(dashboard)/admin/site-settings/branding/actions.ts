"use server";

/**
 * Phase 5 / M1 — branding save action (basics only; design UI ships M6).
 */

import { brandingFormSchema } from "@/lib/site-admin";
import { saveBranding } from "@/lib/site-admin/server/branding";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type BrandingActionState =
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

export async function saveBrandingAction(
  _prev: BrandingActionState,
  formData: FormData,
): Promise<BrandingActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing branding.",
    };
  }

  const parsed = brandingFormSchema.safeParse({
    primaryColor: singleOrNull(formData, "primaryColor"),
    secondaryColor: singleOrNull(formData, "secondaryColor"),
    accentColor: singleOrNull(formData, "accentColor"),
    neutralColor: singleOrNull(formData, "neutralColor"),
    logoMediaAssetId: singleOrNull(formData, "logoMediaAssetId"),
    logoDarkMediaAssetId: singleOrNull(formData, "logoDarkMediaAssetId"),
    faviconMediaAssetId: singleOrNull(formData, "faviconMediaAssetId"),
    ogImageMediaAssetId: singleOrNull(formData, "ogImageMediaAssetId"),
    fontPreset: singleOrNull(formData, "fontPreset"),
    headingFont: singleOrNull(formData, "headingFont"),
    bodyFont: singleOrNull(formData, "bodyFont"),
    brandMarkSvg: singleOrNull(formData, "brandMarkSvg"),
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
    const result = await saveBranding(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });

    if (!result.ok) {
      return {
        ok: false,
        error:
          result.code === "VERSION_CONFLICT"
            ? "Someone else edited branding; reload and try again."
            : (result.message ?? CLIENT_ERROR.update),
        code: result.code,
        currentVersion: result.currentVersion,
      };
    }

    return { ok: true, version: result.data.version };
  } catch (error) {
    logServerError("site-admin/branding/save", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
