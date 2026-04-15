"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { canonicalBioEn } from "@/lib/translation/public-bio";
import {
  adminApproveEnglishBioDraft,
  adminApproveSpanishBioDraft,
  adminLoadBioTranslationPanelData,
  adminSaveManualSpanishBio,
  adminSaveTalentBioTranslationCenterLive,
} from "@/app/(dashboard)/admin/talent/translation-actions";
import {
  adminLoadLocationTranslationPanelData,
  adminLoadTaxonomyTranslationPanelData,
  adminSaveLocationSpanishDisplay,
  adminSaveTaxonomySpanishLabel,
} from "@/app/(dashboard)/admin/translations/translations-tax-loc-actions";
import type { TranslationQuickSaveKind } from "@/lib/translation-center/types";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";

const QUICK_SAVE_KINDS = [
  "talent_bio_es",
  "talent_bio_quick",
  "talent_bio_promote_draft",
  "talent_bio_promote_en_draft",
  "taxonomy_name_es",
  "location_display_es",
  "field_value_i18n",
  "none",
] as const satisfies readonly TranslationQuickSaveKind[];

const loadSchema = z.object({
  adapterId: z.string().min(1),
  entityId: z.string().min(1),
  parentEntityId: z.string().uuid().optional().nullable(),
});

export type TranslationQuickEditPayload = {
  title: string;
  subtitle?: string;
  fields: Record<string, string>;
};

export async function loadTranslationQuickEditPayload(
  input: z.infer<typeof loadSchema>,
): Promise<{ error: string } | { data: TranslationQuickEditPayload }> {
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const { adapterId, entityId, parentEntityId } = parsed.data;

  if (adapterId === "talentBio") {
    const res = await adminLoadBioTranslationPanelData({ talent_profile_id: entityId });
    if ("error" in res) return { error: res.error ?? "Could not load bio." };
    const d = res.data;
    const enPub = canonicalBioEn(d.bio_en, d.short_bio) ?? "";
    return {
      data: {
        title: "Talent bio (bilingual)",
        subtitle: d.talent_profile_id,
        fields: {
          bio_en: enPub,
          bio_es: (d.bio_es ?? "").trim(),
        },
      },
    };
  }
  if (adapterId === "taxonomyTermName") {
    const res = await adminLoadTaxonomyTranslationPanelData({ id: entityId });
    if ("error" in res) return { error: res.error ?? "Could not load term." };
    const d = res.data;
    return {
      data: {
        title: `Taxonomy · ${d.kind}`,
        subtitle: d.slug,
        fields: {
          name_en: d.name_en,
          name_es: (d.name_es ?? "").trim(),
        },
      },
    };
  }
  if (adapterId === "locationDisplay") {
    const res = await adminLoadLocationTranslationPanelData({ id: entityId });
    if ("error" in res) return { error: res.error ?? "Could not load location." };
    const d = res.data;
    return {
      data: {
        title: `${d.country_code} · ${d.city_slug}`,
        fields: {
          display_name_en: d.display_name_en,
          display_name_es: (d.display_name_es ?? "").trim(),
        },
      },
    };
  }
  if (adapterId === "fieldValueTextI18n") {
    if (!parentEntityId) return { error: "Missing parent profile id." };
    const { data: fv, error } = await auth.supabase
      .from("field_values")
      .select("id, value_text, value_i18n")
      .eq("id", entityId)
      .eq("talent_profile_id", parentEntityId)
      .maybeSingle();
    if (error) {
      logServerError("translation-center/quickEdit/loadFieldValue", error);
      return { error: "Could not load field value." };
    }
    if (!fv) return { error: "Field value not found." };
    const i18n = fv.value_i18n as Record<string, unknown> | null;
    const en = String(i18n?.en ?? fv.value_text ?? "").trim();
    const es = String(i18n?.es ?? "").trim();
    return {
      data: {
        title: "Profile field (i18n)",
        subtitle: entityId,
        fields: { en, es },
      },
    };
  }

  return { error: "Inline editing is not available for this domain." };
}

const saveSchema = z.object({
  saveKind: z.enum(QUICK_SAVE_KINDS),
  entityId: z.string().uuid(),
  parentEntityId: z.string().uuid().optional().nullable(),
  fields: z.record(z.string(), z.string()),
});

export type TranslationQuickEditSaveResult = { error?: string; success?: true };

export async function applyTranslationQuickEditSave(
  input: z.infer<typeof saveSchema>,
): Promise<TranslationQuickEditSaveResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid data." };

  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const { saveKind, entityId, parentEntityId, fields } = parsed.data;

  if (saveKind === "talent_bio_es") {
    const text = fields.bio_es ?? "";
    return adminSaveManualSpanishBio({ talent_profile_id: entityId, bio_es: text });
  }
  if (saveKind === "talent_bio_quick") {
    return adminSaveTalentBioTranslationCenterLive({
      talent_profile_id: entityId,
      bio_en: fields.bio_en ?? "",
      bio_es: fields.bio_es ?? "",
    });
  }
  if (saveKind === "talent_bio_promote_draft") {
    return adminApproveSpanishBioDraft({ talent_profile_id: entityId });
  }
  if (saveKind === "talent_bio_promote_en_draft") {
    return adminApproveEnglishBioDraft({ talent_profile_id: entityId });
  }
  if (saveKind === "taxonomy_name_es") {
    return adminSaveTaxonomySpanishLabel({ id: entityId, name_es: fields.name_es ?? "" });
  }
  if (saveKind === "location_display_es") {
    return adminSaveLocationSpanishDisplay({
      id: entityId,
      display_name_es: fields.display_name_es ?? "",
    });
  }
  if (saveKind === "field_value_i18n") {
    if (!parentEntityId) return { error: "Missing parent profile id." };
    const en = (fields.en ?? "").trim();
    const es = (fields.es ?? "").trim();
    const value_i18n = { en, es };
    const now = new Date().toISOString();
    const { error } = await auth.supabase
      .from("field_values")
      .update({
        value_i18n,
        value_text: en.length > 0 ? en : null,
        updated_at: now,
      })
      .eq("id", entityId)
      .eq("talent_profile_id", parentEntityId);
    if (error) {
      if (String(error.message ?? "").includes("value_i18n")) {
        return { error: "Database is missing value_i18n — apply migrations." };
      }
      logServerError("translation-center/quickEdit/saveFieldValue", error);
      return { error: error.message };
    }
    await scheduleRebuildAiSearchDocument(auth.supabase, parentEntityId);
    revalidatePath("/admin/translations");
    revalidatePath(`/admin/talent/${parentEntityId}`);
    return { success: true };
  }

  return { error: "Save is not configured for this action." };
}
