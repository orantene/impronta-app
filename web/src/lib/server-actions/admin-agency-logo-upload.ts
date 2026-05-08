"use server";

// ============================================================================
// admin-agency-logo-upload.ts — upload agency logo to media-public storage
// and persist the URL into agencies.settings.branding.logo_url
//
// Stored at: media-public/agency-logos/{tenantId}/logo.{ext}
// Uses upsert so replacing a logo doesn't orphan the old file.
// ============================================================================

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";

const ALLOWED_TYPES = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type AgencyLogoUploadResult =
  | { ok: true; logoUrl: string }
  | { ok: false; error: string };

export async function actionUploadAgencyLogo(
  formData: FormData,
): Promise<AgencyLogoUploadResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No file provided." };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "PNG, SVG, JPEG or WebP only." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Logo must be under 10 MB." };
  }

  const ext = file.type === "image/svg+xml"
    ? "svg"
    : file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const storagePath = `agency-logos/${tenantId}/logo.${ext}`;

  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("media-public")
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });

  if (uploadError) {
    logServerError("admin-agency-logo-upload.storage", uploadError);
    return { ok: false, error: "Upload failed. Try again." };
  }

  const { data: urlData } = supabase.storage
    .from("media-public")
    .getPublicUrl(storagePath);

  const logoUrl = urlData.publicUrl;

  // Merge logo_url into agencies.settings.branding
  const { data: agency } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();

  const currentSettings: Record<string, unknown> =
    typeof agency?.settings === "object" && agency.settings !== null
      ? (agency.settings as Record<string, unknown>)
      : {};
  const currentBranding: Record<string, unknown> =
    typeof currentSettings.branding === "object" && currentSettings.branding !== null
      ? (currentSettings.branding as Record<string, unknown>)
      : {};

  const { error: updateErr } = await supabase
    .from("agencies")
    .update({
      settings: {
        ...currentSettings,
        branding: { ...currentBranding, logo_url: logoUrl },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (updateErr) {
    logServerError("admin-agency-logo-upload.settings", updateErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  return { ok: true, logoUrl };
}
