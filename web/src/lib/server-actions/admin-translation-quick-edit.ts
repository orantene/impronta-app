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
} from "@/lib/server-actions/admin-talent-translations";
import {
  adminLoadLocationTranslationPanelData,
  adminLoadTaxonomyTranslationPanelData,
  adminSaveLocationSpanishDisplay,
  adminSaveTaxonomySpanishLabel,
} from "@/lib/server-actions/admin-translations-tax-loc";
import type { ServerActionResult } from "@/lib/server-actions/result";
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
): Promise<ServerActionResult<TranslationQuickEditPayload>> {
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { adapterId, entityId, parentEntityId } = parsed.data;

  if (adapterId === "talentBio") {
    const res = await adminLoadBioTranslationPanelData({ talent_profile_id: entityId });
    if (!res.ok) return { ok: false, error: res.error || "Could not load bio." };
    const d = res.data;
    const enPub = canonicalBioEn(d.bio_en, d.short_bio) ?? "";
    return {
      ok: true,
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
    if (!res.ok) return { ok: false, error: res.error || "Could not load term." };
    const d = res.data;
    return {
      ok: true,
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
    if (!res.ok) return { ok: false, error: res.error || "Could not load location." };
    const d = res.data;
    return {
      ok: true,
      data: {
        title: `${d.country_code} · ${d.city_slug}`,
        fields: {
          display_name_en: d.display_name_en,
          display_name_es: (d.display_name_es ?? "").trim(),
        },
      },
    };
  }
  // T3.2 — the `fieldValueTextI18n` domain is dead: it was built around a
  // `field_values.value_i18n` column that never existed, and System A is retired.
  // The adapter surfaces no units, so this branch is unreachable from the UI;
  // return a clear "not available" rather than read the removed System-A store.
  if (adapterId === "fieldValueTextI18n") {
    return { ok: false, error: "Profile field (i18n) inline editing is not available." };
  }

  return { ok: false, error: "Inline editing is not available for this domain." };
}

const saveSchema = z.object({
  saveKind: z.enum(QUICK_SAVE_KINDS),
  entityId: z.string().uuid(),
  parentEntityId: z.string().uuid().optional().nullable(),
  fields: z.record(z.string(), z.string()),
});

export type TranslationQuickEditSaveResult = ServerActionResult;

export async function applyTranslationQuickEditSave(
  input: z.infer<typeof saveSchema>,
): Promise<TranslationQuickEditSaveResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid data." };

  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

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
  // T3.2 — `field_value_i18n` is the save path for the dead `fieldValueTextI18n`
  // domain (it wrote a non-existent `field_values.value_i18n` column; System A is
  // retired). The domain surfaces no editable units, so this is unreachable from
  // the UI; return a clear error rather than write the removed System-A store.
  if (saveKind === "field_value_i18n") {
    return { ok: false, error: "Profile field (i18n) saving is not available." };
  }

  return { ok: false, error: "Save is not configured for this action." };
}
