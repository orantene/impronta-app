import type { TalentMediaRow } from "@/lib/talent-dashboard-data";
import { createClient } from "@/lib/supabase/server";

export type AdminTalentMediaRow = TalentMediaRow & {
  uploaded_by_user_id: string | null;
  uploaderDisplayName: string | null;
};

export async function loadAdminTalentMedia(
  talentProfileId: string,
): Promise<
  | { ok: true; profileCode: string; displayName: string | null; media: AdminTalentMediaRow[] }
  | { ok: false; reason: "no_supabase" | "not_found" }
> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, reason: "no_supabase" };

  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select("id, profile_code, display_name")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (pErr || !profile) return { ok: false, reason: "not_found" };

  const { data: raw, error: mErr } = await supabase
    .from("media_assets")
    .select(
      "id, bucket_id, storage_path, variant_kind, approval_state, sort_order, width, height, metadata, created_at, uploaded_by_user_id",
    )
    .eq("owner_talent_profile_id", talentProfileId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(64);

  if (mErr) {
    return {
      ok: true,
      profileCode: profile.profile_code,
      displayName: profile.display_name,
      media: [],
    };
  }

  const rows = raw ?? [];
  const uploaderIds = [
    ...new Set(
      rows
        .map((r) => r.uploaded_by_user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let uploaderMap = new Map<string, { display_name: string | null }>();
  if (uploaderIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", uploaderIds);
    uploaderMap = new Map(
      (profs ?? []).map((p) => [
        p.id as string,
        {
          display_name: (p.display_name as string | null) ?? null,
        },
      ]),
    );
  }

  const media: AdminTalentMediaRow[] = rows.map((row) => {
    let publicUrl: string | null = null;
    if (row.bucket_id === "media-public") {
      const { data } = supabase.storage.from("media-public").getPublicUrl(row.storage_path);
      publicUrl = data.publicUrl;
    }
    const uid = row.uploaded_by_user_id as string | null;
    const up = uid ? uploaderMap.get(uid) : undefined;
    return {
      id: row.id as string,
      bucket_id: row.bucket_id as string,
      storage_path: row.storage_path as string,
      variant_kind: row.variant_kind as string,
      approval_state: row.approval_state as string,
      sort_order: row.sort_order as number,
      width: row.width as number | null,
      height: row.height as number | null,
      metadata:
        typeof row.metadata === "object" && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : {},
      created_at: row.created_at as string,
      publicUrl,
      uploaded_by_user_id: uid,
      uploaderDisplayName: up?.display_name ?? null,
    };
  });

  return {
    ok: true,
    profileCode: profile.profile_code,
    displayName: profile.display_name,
    media,
  };
}
