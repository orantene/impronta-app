"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server/action-guards";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type AvatarUploadResult =
  | { ok: true; avatarUrl: string }
  | { ok: false; error: string };

export async function actionUploadAvatar(
  formData: FormData,
): Promise<AvatarUploadResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: session.error };

  const { supabase, user } = session;

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: "No file provided." };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "Only JPEG, PNG, WebP, or GIF images are allowed." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File must be under 5 MB." };
  }

  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const storagePath = `avatars/${user.id}/avatar.${ext}`;

  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("media-public")
    .upload(storagePath, bytes, {
      contentType: file.type,
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
  revalidatePath("/talent/account");
  revalidatePath("/talent/my-profile");

  return { ok: true, avatarUrl };
}
