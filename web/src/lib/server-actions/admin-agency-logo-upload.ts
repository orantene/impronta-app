"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";

const ALLOWED_TYPES = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type AgencyLogoUploadResult =
  | { ok: true; logoUrl: string }
  | { ok: false; error: string };

export async function actionUploadAgencyLogo(
  formData: FormData,
): Promise<AgencyLogoUploadResult> {
  // Branding surface — graded above the workspace baseline to the
  // membership-role capability the Phase-5 matrix assigns it (admin/owner).
  const auth = await requireStaffTenantAction({
    capability: "agency.site_admin.branding.edit",
  });
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
  // UUID in path busts CDN cache on re-upload
  const storagePath = `agency-logos/${tenantId}/${randomUUID()}.${ext}`;

  const bytes = await file.arrayBuffer();

  // Use service role for storage so the path doesn't require RLS matching
  const admin = createServiceRoleClient();
  const storageClient = admin ?? supabase;

  const { error: uploadError } = await storageClient.storage
    .from("media-public")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    logServerError("admin-agency-logo-upload.storage", uploadError);
    return { ok: false, error: "Upload failed. Try again." };
  }

  const { data: urlData } = storageClient.storage
    .from("media-public")
    .getPublicUrl(storagePath);

  const logoUrl = urlData.publicUrl;

  // Use service role for DB write (agencies table may have strict RLS in some envs)
  const dbClient = admin ?? supabase;

  const { data: agency } = await dbClient
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

  const { error: updateErr } = await dbClient
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

  // Sync logo_url into agency_branding.theme_json for public-readable access
  const { data: brandingRow } = await dbClient
    .from("agency_branding")
    .select("theme_json")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const currentTheme: Record<string, unknown> =
    typeof brandingRow?.theme_json === "object" && brandingRow.theme_json !== null
      ? (brandingRow.theme_json as Record<string, unknown>)
      : {};
  await dbClient
    .from("agency_branding")
    .upsert(
      { tenant_id: tenantId, theme_json: { ...currentTheme, logo_url: logoUrl }, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    );

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, logoUrl };
}
