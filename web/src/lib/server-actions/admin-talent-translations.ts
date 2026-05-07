"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/server/action-guards";
import {
  aiFillMissingSpanishBio,
  aiRefreshSpanishBioLive,
  approveEnglishBioDraft,
  approveSpanishBioDraft,
  markSpanishBioReviewed,
  saveManualSpanishBio,
  saveTalentBioQuickEdit,
  saveTalentBioTranslationCenterLive,
} from "@/lib/translation/talent-bio-translation-service";

const idSchema = z.object({
  talent_profile_id: z.string().uuid(),
});

export type TranslationActionResult = { error?: string; success?: true };

export async function adminAiFillMissingSpanishBio(
  input: z.infer<typeof idSchema>,
): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid profile." };
  const { error } = await aiFillMissingSpanishBio(
    auth.supabase,
    parsed.data.talent_profile_id,
    auth.user.id,
  );
  if (error) return { error };
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${parsed.data.talent_profile_id}`);
  revalidatePath("/admin/translations");
  return { success: true };
}

export async function adminAiUpdateSpanishBio(input: z.infer<typeof idSchema>): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid profile." };
  const id = parsed.data.talent_profile_id;

  const { error } = await aiRefreshSpanishBioLive(auth.supabase, id, auth.user.id);
  if (error) return { error };
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${id}`);
  revalidatePath("/admin/translations");
  return { success: true };
}

const manualSchema = idSchema.extend({
  bio_es: z.string(),
});

export async function adminSaveManualSpanishBio(
  input: z.infer<typeof manualSchema>,
): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid data." };
  const { error } = await saveManualSpanishBio(
    auth.supabase,
    parsed.data.talent_profile_id,
    auth.user.id,
    parsed.data.bio_es,
  );
  if (error) return { error };
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${parsed.data.talent_profile_id}`);
  revalidatePath("/admin/translations");
  return { success: true };
}

export async function adminApproveSpanishBioDraft(
  input: z.infer<typeof idSchema>,
): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid profile." };
  const { error } = await approveSpanishBioDraft(
    auth.supabase,
    parsed.data.talent_profile_id,
    auth.user.id,
  );
  if (error) return { error };
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${parsed.data.talent_profile_id}`);
  revalidatePath("/admin/translations");
  return { success: true };
}

export async function adminApproveEnglishBioDraft(
  input: z.infer<typeof idSchema>,
): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid profile." };
  const { error } = await approveEnglishBioDraft(
    auth.supabase,
    parsed.data.talent_profile_id,
    auth.user.id,
  );
  if (error) return { error };
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${parsed.data.talent_profile_id}`);
  revalidatePath("/admin/translations");
  return { success: true };
}

const quickBioSchema = idSchema.extend({
  bio_en_published: z.string(),
  bio_en_draft: z.string(),
  bio_es_published: z.string(),
  bio_es_draft: z.string(),
});

const translationCenterBioLiveSchema = idSchema.extend({
  bio_en: z.string(),
  bio_es: z.string(),
});

/** Legacy four-field (published + draft) save. Prefer {@link adminSaveTalentBioTranslationCenterLive} for live-only UIs. */
export async function adminSaveTalentBioQuickEdit(
  input: z.infer<typeof quickBioSchema>,
): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = quickBioSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid data." };
  const { error } = await saveTalentBioQuickEdit(auth.supabase, parsed.data.talent_profile_id, auth.user.id, {
    bio_en_published: parsed.data.bio_en_published,
    bio_en_draft: parsed.data.bio_en_draft,
    bio_es_published: parsed.data.bio_es_published,
    bio_es_draft: parsed.data.bio_es_draft,
  });
  if (error) return { error };
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${parsed.data.talent_profile_id}`);
  revalidatePath("/admin/translations");
  return { success: true };
}

/** `/admin/translations` quick sheet — live EN/ES only (no draft/publish path). */
export async function adminSaveTalentBioTranslationCenterLive(
  input: z.infer<typeof translationCenterBioLiveSchema>,
): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = translationCenterBioLiveSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid data." };
  const { error } = await saveTalentBioTranslationCenterLive(
    auth.supabase,
    parsed.data.talent_profile_id,
    auth.user.id,
    { bio_en: parsed.data.bio_en, bio_es: parsed.data.bio_es },
  );
  if (error) return { error };
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${parsed.data.talent_profile_id}`);
  revalidatePath("/admin/translations");
  return { success: true };
}

export async function adminMarkSpanishBioReviewed(
  input: z.infer<typeof idSchema>,
): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid profile." };
  const { error } = await markSpanishBioReviewed(
    auth.supabase,
    parsed.data.talent_profile_id,
    auth.user.id,
  );
  if (error) return { error };
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${parsed.data.talent_profile_id}`);
  revalidatePath("/admin/translations");
  return { success: true };
}

/** Payload for bio editor drawer; draft/status columns are loaded for legacy data but not shown in the live-only panel. */
export type BioTranslationPanelPayload = {
  talent_profile_id: string;
  bio_en: string | null;
  bio_es: string | null;
  bio_es_draft: string | null;
  bio_es_status: string | null;
  bio_en_draft: string | null;
  bio_en_status: string | null;
  bio_en_updated_at: string | null;
  bio_es_updated_at: string | null;
  short_bio: string | null;
  open_ai_available: boolean;
};

export async function adminLoadBioTranslationPanelData(input: z.infer<typeof idSchema>): Promise<
  | { error: string; data?: undefined }
  | { error?: undefined; data: BioTranslationPanelPayload }
> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid profile." };
  const id = parsed.data.talent_profile_id;

  const { isResolvedAiChatConfigured } = await import("@/lib/ai/resolve-provider");

  const { data: row, error: loadErr } = await auth.supabase
    .from("talent_profiles")
    .select(
      "id, bio_en, bio_es, bio_es_draft, bio_es_status, bio_en_draft, bio_en_status, bio_en_updated_at, bio_es_updated_at, short_bio",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr || !row) return { error: "Profile not found." };

  return {
    data: {
      talent_profile_id: row.id as string,
      bio_en: (row as { bio_en?: string | null }).bio_en ?? null,
      bio_es: (row as { bio_es?: string | null }).bio_es ?? null,
      bio_es_draft: (row as { bio_es_draft?: string | null }).bio_es_draft ?? null,
      bio_es_status: (row as { bio_es_status?: string | null }).bio_es_status ?? null,
      bio_en_draft: (row as { bio_en_draft?: string | null }).bio_en_draft ?? null,
      bio_en_status: (row as { bio_en_status?: string | null }).bio_en_status ?? null,
      bio_en_updated_at: (row as { bio_en_updated_at?: string | null }).bio_en_updated_at ?? null,
      bio_es_updated_at: (row as { bio_es_updated_at?: string | null }).bio_es_updated_at ?? null,
      short_bio: (row as { short_bio?: string | null }).short_bio ?? null,
      open_ai_available: await isResolvedAiChatConfigured(),
    },
  };
}
