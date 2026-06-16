import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Platform DEFAULT TEMPLATE POINTERS — the Builder-Lab "Default surfaces" knobs.
 *
 * The platform DEFAULT storefront + talent profile are resolved today by a
 * RESERVED SLUG in `builder_templates`. This singleton-stored pointer lets a
 * super-admin point the default at ANY published template (Builder Lab →
 * Default surfaces) without re-seeding the reserved row, and toggle the talent
 * freeform default without a deploy.
 *
 * Mirrors `default-theme.ts`: the raw untenanted `.from("platform_settings")`
 * read/write live here in a server-only lib so action files stay free of an
 * untenanted `.from(...)`. The read is cached per-request and NEVER throws —
 * any error / missing row degrades to the all-null safe default so the render
 * path falls back to the reserved slug / built-in tree exactly as before.
 */

export interface PlatformDefaultTemplatePointers {
  /** Pointer to the published template the DEFAULT storefront renders. NULL ⇒
   *  fall back to the reserved slug, then `DefaultStorefrontBody`. */
  storefrontTemplateId: string | null;
  /** Pointer to the published template the DEFAULT talent freeform profile
   *  renders. NULL ⇒ fall back to the reserved slug, then the built-in tree. */
  talentTemplateId: string | null;
  /** Lab toggle for the freeform talent default. OR-ed with the legacy env flag
   *  `DEFAULT_TALENT_FREEFORM_PROFILE` (so the env flag still works). */
  talentFreeformEnabled: boolean;
}

/** The all-null/false safe default — what every caller gets when the row or
 *  columns are empty / unreadable. Identical to pre-pointer behaviour. */
export const DEFAULT_TEMPLATE_POINTERS: PlatformDefaultTemplatePointers = {
  storefrontTemplateId: null,
  talentTemplateId: null,
  talentFreeformEnabled: false,
};

type PlatformDefaultTemplatePointersRow = {
  default_storefront_template_id: string | null;
  default_talent_template_id: string | null;
  default_talent_freeform_enabled: boolean | null;
};

/** Which DEFAULT surface a template pointer targets. */
export type PlatformTemplateSurface = "storefront" | "talent";

/**
 * Read the platform DEFAULT template pointers (the `platform_settings`
 * singleton). Cached per request, like `loadPlatformDefaultTheme`. Falls back to
 * {@link DEFAULT_TEMPLATE_POINTERS} on any error / missing row so the public
 * render path never throws and degrades to the reserved-slug / built-in tree.
 */
export const loadPlatformDefaultTemplatePointers = cache(
  async (): Promise<PlatformDefaultTemplatePointers> => {
    try {
      const admin = createServiceRoleClient();
      if (!admin) return DEFAULT_TEMPLATE_POINTERS;
      const { data, error } = await admin
        .from("platform_settings")
        .select(
          "default_storefront_template_id, default_talent_template_id, default_talent_freeform_enabled",
        )
        .eq("id", true)
        .maybeSingle()
        .returns<PlatformDefaultTemplatePointersRow>();
      if (error || !data) return DEFAULT_TEMPLATE_POINTERS;
      return {
        storefrontTemplateId: data.default_storefront_template_id ?? null,
        talentTemplateId: data.default_talent_template_id ?? null,
        talentFreeformEnabled: data.default_talent_freeform_enabled === true,
      };
    } catch (err) {
      logServerError("platform.loadDefaultTemplatePointers", err);
      return DEFAULT_TEMPLATE_POINTERS;
    }
  },
);

/**
 * Persist a single DEFAULT-surface template pointer (Builder Lab → Default
 * surfaces). `templateId === null` CLEARS the pointer ("Use built-in default" →
 * the resolver falls back to the reserved slug). Called by the super-admin
 * `use server` action AFTER it has gated the caller.
 */
export async function writePlatformDefaultTemplatePointer(
  surface: PlatformTemplateSurface,
  updatedBy: string,
  templateId: string | null,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };

    const patch =
      surface === "talent"
        ? { default_talent_template_id: templateId }
        : { default_storefront_template_id: templateId };

    const { error } = await admin
      .from("platform_settings")
      .update({ ...patch, updated_by: updatedBy })
      .eq("id", true);
    if (error) {
      logServerError("platform.writeDefaultTemplatePointer", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeDefaultTemplatePointer", err);
    return { ok: false };
  }
}

/**
 * Persist the talent freeform-default toggle (Builder Lab → Default surfaces).
 * Super-admin gated by the caller. OR-ed with the env flag at render time, so
 * turning this OFF does not disable the env flag (a deliberate dual-path).
 */
export async function writePlatformDefaultTalentFreeformEnabled(
  updatedBy: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
    const { error } = await admin
      .from("platform_settings")
      .update({
        default_talent_freeform_enabled: enabled,
        updated_by: updatedBy,
      })
      .eq("id", true);
    if (error) {
      logServerError("platform.writeDefaultTalentFreeformEnabled", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeDefaultTalentFreeformEnabled", err);
    return { ok: false };
  }
}
