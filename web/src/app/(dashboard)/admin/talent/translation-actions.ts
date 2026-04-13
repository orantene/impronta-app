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
