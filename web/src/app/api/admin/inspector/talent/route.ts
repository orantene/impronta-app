import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/server/staff-api-route";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

/**
 * Staff-only talent snapshot for inspector (detail page + optional future list selection).
 */
export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { supabase } = auth;
  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select(
      `
      id, profile_code, display_name, short_bio, bio_en, bio_es,
      phone, workflow_status, visibility, is_featured,
      profile_completeness_score, deleted_at
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (pErr) {
    logServerError("api/admin/inspector/talent", pErr);
    return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = profile as {
    id: string;
    profile_code: string;
    display_name: string | null;
    short_bio: string | null;
    bio_en: string | null;
    bio_es: string | null;
    phone: string | null;
    workflow_status: string;
    visibility: string;
    is_featured: boolean;
    profile_completeness_score: number | null;
    deleted_at: string | null;
  };

  const { count: pendingMedia, error: mErr } = await supabase
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("owner_talent_profile_id", id)
    .eq("approval_state", "pending")
    .is("deleted_at", null);

  if (mErr) {
    logServerError("api/admin/inspector/talent/media-count", mErr);
  }

  const warnings: string[] = [];
  if (!row.phone?.trim()) warnings.push("Phone not set");
  if (!row.short_bio?.trim() && !row.bio_en?.trim()) warnings.push("No short bio or English bio");
  if (!row.bio_es?.trim()) warnings.push("Spanish bio empty");
  if (row.visibility === "hidden") warnings.push("Visibility is hidden");
  if (row.workflow_status !== "approved" && row.workflow_status !== "featured") {
    warnings.push(`Workflow: ${row.workflow_status.replace(/_/g, " ")}`);
  }

  return NextResponse.json({
    id: row.id,
    profile_code: row.profile_code,
    display_name: row.display_name,
    workflow_status: row.workflow_status,
    visibility: row.visibility,
    is_featured: row.is_featured,
    profile_completeness_score: row.profile_completeness_score,
    deleted_at: row.deleted_at,
    pending_media_count: pendingMedia ?? 0,
    warnings,
  });
}
