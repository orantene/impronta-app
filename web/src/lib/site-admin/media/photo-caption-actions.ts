"use server";

/**
 * Talent photo captions (TUL-229): the dashboard writes what the public site
 * reads (`media_assets.metadata.caption` / `caption_i18n`). The gate is the same
 * one the talent library PATCH uses for a talent editing herself: signed in as
 * the owner of the profile (`requireTalentSelfAction`) and the asset must be
 * owned by that profile (`owner_talent_profile_id`). No staff lane: an agency
 * does not write a talent's captions.
 */
import { requireTalentSelfAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import type { PhotoMetadata } from "./photo-caption-edit";
import {
  savePhotoCaption,
  type PhotoCaptionDeps,
  type PhotoCaptionLocales,
} from "./photo-caption-save";

export type TalentPhotoCaptionLocalesResult =
  | { ok: true; primary: string; secondary: string[] }
  | { ok: false; error: string };

export type TalentPhotoCaptionSaveResult =
  | { ok: true; caption: string; captionI18n: Record<string, string> }
  | { ok: false; error: string };

function realDeps(): PhotoCaptionDeps | null {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  return {
    requireSelf: async (talentProfileId) => {
      const self = await requireTalentSelfAction(talentProfileId);
      return self.ok ? { ok: true } : { ok: false, error: self.error };
    },
    loadLocales: async (talentProfileId): Promise<PhotoCaptionLocales> => {
      const s = await loadTalentLocaleSettings(talentProfileId);
      return { primary: s.defaultLocale, secondary: s.secondaryLocales };
    },
    readMetadata: async (talentProfileId, assetId) => {
      const { data, error } = await admin
        .from("media_assets")
        .select("metadata")
        .eq("id", assetId)
        .eq("owner_talent_profile_id", talentProfileId)
        .is("deleted_at", null)
        .maybeSingle<{ metadata: PhotoMetadata | null }>();
      if (error) {
        logServerError("photoCaption.read", error);
        return null;
      }
      return data ? { metadata: data.metadata } : null;
    },
    writeMetadata: async (talentProfileId, assetId, metadata) => {
      const { data, error } = await admin
        .from("media_assets")
        .update({ metadata })
        .eq("id", assetId)
        .eq("owner_talent_profile_id", talentProfileId)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) logServerError("photoCaption.write", error);
      return !error && !!data;
    },
  };
}

/** Languages the caption editor offers: primary first, then enabled secondary. */
export async function loadTalentPhotoCaptionLocalesAction(
  talentProfileId: string,
): Promise<TalentPhotoCaptionLocalesResult> {
  const self = await requireTalentSelfAction(talentProfileId);
  if (!self.ok) return { ok: false, error: self.error };
  const s = await loadTalentLocaleSettings(talentProfileId);
  return { ok: true, primary: s.defaultLocale, secondary: [...s.secondaryLocales] };
}

export async function saveTalentPhotoCaptionAction(input: {
  talentProfileId: string;
  assetId: string;
  locale: string;
  text: string;
}): Promise<TalentPhotoCaptionSaveResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const deps = realDeps();
  if (!deps) return { ok: false, error: "Server configuration error." };
  const res = await savePhotoCaption(deps, input);
  if (!res.ok) return res;
  const rawMap = res.metadata.caption_i18n;
  const captionI18n: Record<string, string> = {};
  if (rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)) {
    for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
      if (typeof v === "string") captionI18n[k] = v;
    }
  }
  return {
    ok: true,
    caption: typeof res.metadata.caption === "string" ? res.metadata.caption : "",
    captionI18n,
  };
}
