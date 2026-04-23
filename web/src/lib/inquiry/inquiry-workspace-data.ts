import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

function normalizeTalentProfileJoin(
  raw: unknown,
): { profile_code: string; display_name: string | null; user_id: string | null } | null {
  if (raw == null) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  return {
    profile_code: String(o.profile_code ?? ""),
    display_name: (o.display_name as string | null) ?? null,
    user_id: (o.user_id as string | null) ?? null,
  };
}

export type InquiryRosterParticipant = {
  id: string;
  inquiryId: string;
  talentProfileId: string;
  userId: string | null;
  profileCode: string;
  displayName: string | null;
  role: "talent";
  status: "invited" | "active" | "declined" | "removed";
  sortOrder: number;
  acceptedAt: string | null;
  removedAt: string | null;
  addedByUserId: string | null;
  imageUrl: string | null;
  tagLabel: string | null;
};

/**
 * Canonical roster read for QA cutover: prefer inquiry_participants, then fall back to inquiry_talent.
 */
export async function loadInquiryRoster(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<InquiryRosterParticipant[]> {
  const { data: rows, error } = await supabase
    .from("inquiry_participants")
    .select(
      `
      id,
      inquiry_id,
      user_id,
      talent_profile_id,
      status,
      sort_order,
      accepted_at,
      removed_at,
      added_by_user_id,
      talent_profiles (
        id,
        profile_code,
        display_name,
        user_id
      )
    `,
    )
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .order("sort_order", { ascending: true });

  if (error) {
    logServerError("inquiry-workspace-data/loadInquiryRoster/participants", error);
  } else if (rows && rows.length > 0) {
    const talentIds = rows.map((r) => r.talent_profile_id).filter(Boolean) as string[];
    const thumbs = await loadTalentThumbUrls(supabase, talentIds);
    const tags = await loadPrimaryTalentTags(supabase, talentIds);

    return rows.map((r) => {
      const tp = normalizeTalentProfileJoin(r.talent_profiles);
      const tid = r.talent_profile_id as string;
      return {
        id: r.id as string,
        inquiryId,
        talentProfileId: tid,
        userId: (r.user_id as string | null) ?? null,
        profileCode: tp?.profile_code ?? "",
        displayName: tp?.display_name ?? null,
        role: "talent" as const,
        status: r.status as InquiryRosterParticipant["status"],
        sortOrder: (r.sort_order as number) ?? 0,
        acceptedAt: (r.accepted_at as string | null) ?? null,
        removedAt: (r.removed_at as string | null) ?? null,
        addedByUserId: (r.added_by_user_id as string | null) ?? null,
        imageUrl: thumbs.get(tid) ?? null,
        tagLabel: tags.get(tid) ?? null,
      };
    });
  }

  const { data: legacy, error: legErr } = await supabase
    .from("inquiry_talent")
    .select(
      `
      id,
      inquiry_id,
      talent_profile_id,
      sort_order,
      added_by_staff_id,
      talent_profiles (
        profile_code,
        display_name,
        user_id
      )
    `,
    )
    .eq("inquiry_id", inquiryId)
    .order("sort_order", { ascending: true });

  if (legErr || !legacy) {
    logServerError("inquiry-workspace-data/loadInquiryRoster/legacy", legErr);
    return [];
  }

  const talentIds = legacy.map((r) => r.talent_profile_id).filter(Boolean) as string[];
  const thumbs = await loadTalentThumbUrls(supabase, talentIds);
  const tags = await loadPrimaryTalentTags(supabase, talentIds);

  return legacy.map((r) => {
    const tp = normalizeTalentProfileJoin(r.talent_profiles);
    const tid = r.talent_profile_id as string;
    return {
      id: r.id as string,
      inquiryId,
      talentProfileId: tid,
      userId: tp?.user_id ?? null,
      profileCode: tp?.profile_code ?? "",
      displayName: tp?.display_name ?? null,
      role: "talent" as const,
      status: "active" as const,
      sortOrder: (r.sort_order as number) ?? 0,
      acceptedAt: null,
      removedAt: null,
      addedByUserId: (r.added_by_staff_id as string | null) ?? null,
      imageUrl: thumbs.get(tid) ?? null,
      tagLabel: tags.get(tid) ?? null,
    };
  });
}

export type InquiryRosterPeek = {
  count: number;
  labelLine: string;
};

/**
 * Canonical roster peek for list rows: prefers inquiry_participants, falls back to inquiry_talent.
 */
export async function loadInquiryRosterPeekMany(
  supabase: SupabaseClient,
  inquiryIds: string[],
): Promise<Map<string, InquiryRosterPeek>> {
  const map = new Map<string, InquiryRosterPeek>();
  const ids = [...new Set(inquiryIds.filter(Boolean))];
  if (!ids.length) return map;

  const applyPeekRows = (
    rows: Array<Record<string, unknown>>,
  ) => {
    const by = new Map<string, Array<{ profile_code: string; display_name: string | null }>>();
    for (const row of rows) {
      const inquiry_id = String(row.inquiry_id ?? "");
      if (!inquiry_id) continue;
      const tp = normalizeTalentProfileJoin(row.talent_profiles);
      if (!tp?.profile_code) continue;
      const list = by.get(inquiry_id) ?? [];
      list.push({ profile_code: tp.profile_code, display_name: tp.display_name });
      by.set(inquiry_id, list);
    }
    for (const [inquiryId, list] of by.entries()) {
      const count = list.length;
      const labels = list.slice(0, 3).map((tp) => `${tp.profile_code}${tp.display_name ? ` · ${tp.display_name}` : ""}`);
      const extra = count > 3 ? ` (+${count - 3} more)` : "";
      map.set(inquiryId, {
        count,
        labelLine: count ? `${labels.join(", ")}${extra}` : "No talent on shortlist",
      });
    }
  };

  const { data: parts, error: partErr } = await supabase
    .from("inquiry_participants")
    .select(
      `
      inquiry_id,
      sort_order,
      talent_profiles ( profile_code, display_name )
    `,
    )
    .in("inquiry_id", ids)
    .eq("role", "talent")
    .in("status", ["invited", "active"])
    .order("inquiry_id", { ascending: true })
    .order("sort_order", { ascending: true });
  if (partErr) {
    logServerError("inquiry-workspace-data/loadInquiryRosterPeekMany/participants", partErr);
  } else {
    applyPeekRows((parts ?? []) as Array<Record<string, unknown>>);
  }

  // Ensure every requested id has a default entry.
  for (const id of ids) {
    if (!map.has(id)) map.set(id, { count: 0, labelLine: "No talent on shortlist" });
  }
  return map;
}

type MediaRow = {
  owner_talent_profile_id: string | null;
  bucket_id: string | null;
  storage_path: string | null;
  variant_kind: string | null;
  sort_order: number | null;
  created_at: string;
};

async function loadTalentThumbUrls(
  supabase: SupabaseClient,
  talentProfileIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!talentProfileIds.length) return map;
  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "owner_talent_profile_id, bucket_id, storage_path, variant_kind, sort_order, created_at",
    )
    .in("owner_talent_profile_id", talentProfileIds)
    .eq("approval_state", "approved")
    .is("deleted_at", null);
  if (error || !data) return map;

  const byTalent = new Map<string, MediaRow[]>();
  for (const row of data as MediaRow[]) {
    if (!row.owner_talent_profile_id) continue;
    const list = byTalent.get(row.owner_talent_profile_id) ?? [];
    list.push(row);
    byTalent.set(row.owner_talent_profile_id, list);
  }

  const rank = (v: string | null) =>
    v === "card" ? 0 : v === "public_watermarked" ? 1 : v === "gallery" ? 2 : 3;

  for (const [talentId, rows] of byTalent.entries()) {
    const best = [...rows]
      .filter((r) => r.bucket_id === "media-public" && r.storage_path && r.storage_path.length > 0)
      .sort(
        (a, b) =>
          rank(a.variant_kind) - rank(b.variant_kind) ||
          (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
          a.created_at.localeCompare(b.created_at),
      )[0];
    if (best?.storage_path) {
      const { data: pub } = supabase.storage.from("media-public").getPublicUrl(best.storage_path);
      if (pub.publicUrl) map.set(talentId, pub.publicUrl);
    }
  }
  return map;
}

async function loadPrimaryTalentTags(
  supabase: SupabaseClient,
  talentProfileIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!talentProfileIds.length) return map;
  const { data, error } = await supabase
    .from("talent_profile_taxonomy")
    .select("talent_profile_id, is_primary, taxonomy_terms(kind, name_en)")
    .in("talent_profile_id", talentProfileIds);
  if (error || !data) return map;
  for (const row of data) {
    const term = Array.isArray(row.taxonomy_terms)
      ? row.taxonomy_terms[0]
      : row.taxonomy_terms;
    const tid = row.talent_profile_id as string;
    if (term?.kind !== "talent_type" || !term.name_en?.trim()) continue;
    if (!map.has(tid) || row.is_primary) {
      map.set(tid, term.name_en.trim());
    }
  }
  return map;
}
