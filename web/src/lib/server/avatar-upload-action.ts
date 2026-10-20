"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server/action-guards";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { readGuardedImage } from "@/lib/media/guarded-upload.server";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (the 4 MB server-action body limit binds first)

export type AvatarUploadResult =
  | { ok: true; avatarUrl: string }
  | { ok: false; error: string };

export async function actionUploadAvatar(
  formData: FormData,
): Promise<AvatarUploadResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: session.error };

  const { supabase, user } = session;

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: "No file provided." };
  }
  // H1: type from the bytes (JPEG/PNG/WebP/GIF), pixel cap, and EXIF/GPS
  // stripped: this lands in the PUBLIC bucket.
  const guarded = await readGuardedImage(file, { maxBytes: MAX_BYTES });
  if (!guarded.ok) return { ok: false, error: guarded.error };

  const storagePath = `avatars/${user.id}/avatar.${guarded.ext}`;

  const { error: uploadError } = await supabase.storage
    .from("media-public")
    .upload(storagePath, guarded.bytes, {
      contentType: guarded.mime,
      upsert: true,
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { data: urlData } = supabase.storage
    .from("media-public")
    .getPublicUrl(storagePath);

  const avatarUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/client/account");
  revalidatePath("/client/overview");
  revalidatePath("/talent/settings");
  revalidatePath("/talent/profile");

  return { ok: true, avatarUrl };
}
