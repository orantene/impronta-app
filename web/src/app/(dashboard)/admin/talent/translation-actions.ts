"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/server/action-guards";
import {
  aiFillMissingSpanishBio,
  aiRefreshSpanishBioDraft,
  aiRefreshSpanishBioPublishedWhenNotApproved,
  approveSpanishBioDraft,
  markSpanishBioApproved,
  markSpanishBioReviewed,
  saveManualSpanishBio,
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

  const { data: row, error: loadErr } = await auth.supabase
    .from("talent_profiles")
    .select("bio_es_status")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) return { error: "Profile not found." };

  const status = String(row.bio_es_status ?? "missing");
  let err: string | null = null;
  if (status === "approved") {
    ({ error: err } = await aiRefreshSpanishBioDraft(auth.supabase, id, auth.user.id));
  } else {
    ({ error: err } = await aiRefreshSpanishBioPublishedWhenNotApproved(
      auth.supabase,
      id,
      auth.user.id,
    ));
  }
  if (err) return { error: err };
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

export async function adminMarkSpanishBioApproved(
  input: z.infer<typeof idSchema>,
): Promise<TranslationActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid profile." };
  const { error } = await markSpanishBioApproved(
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

/** Payload for `AdminTalentBioTranslationPanel` when opened from /admin/translations drawer. */
export type BioTranslationPanelPayload = {
  talent_profile_id: string;
  bio_en: string | null;
  bio_es: string | null;
  bio_es_draft: string | null;
  bio_es_status: string | null;
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

  const { isOpenAiConfigured } = await import("@/lib/translation/ai-translate-bio");

  const { data: row, error: loadErr } = await auth.supabase
    .from("talent_profiles")
    .select(
      "id, bio_en, bio_es, bio_es_draft, bio_es_status, bio_en_updated_at, bio_es_updated_at, short_bio",
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
      bio_en_updated_at: (row as { bio_en_updated_at?: string | null }).bio_en_updated_at ?? null,
      bio_es_updated_at: (row as { bio_es_updated_at?: string | null }).bio_es_updated_at ?? null,
      short_bio: (row as { short_bio?: string | null }).short_bio ?? null,
      open_ai_available: isOpenAiConfigured(),
    },
  };
}
