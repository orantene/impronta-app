import { cache } from "react";
import { loadTranslationCenterBootstrap } from "@/lib/translation-center/bootstrap";
import {
  mapBootstrapToAdminPulse,
  type AdminTranslationHealth,
} from "@/lib/translation-center/admin-pulse";
import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

export type AdminOverviewActivityItem = {
  id: string;
  type: "inquiry" | "talent" | "media";
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  status: string;
};

export type InquiryEngineHealth = {
  failedEffects: number;
  needsCoordinator: number;
  frozenInquiries: number;
};

export type AdminOverviewData = {
  counts: {
    totalTalent: number;
    pendingTalent: number;
    totalClients: number;
    openInquiries: number;
    pendingMedia: number;
  };
  recentActivity: AdminOverviewActivityItem[];
  inquiryEngineHealth?: InquiryEngineHealth | null;
};

/** Header pulse chips only — shared with {@link loadAdminOverviewData} via request cache. */
export type AdminShellPulseCounts = AdminOverviewData["counts"];

export const loadAdminShellPulseCounts = cache(
  async (): Promise<AdminShellPulseCounts | null> => {
    const auth = await requireStaff();
    if (!auth.ok) return null;

    const { supabase } = auth;

    const [talentRes, pendingTalentRes, clientsRes, inquiriesRes, mediaRes] =
      await Promise.all([
        supabase.from("talent_profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("talent_profiles")
          .select("id", { count: "exact", head: true })
          .in("workflow_status", ["submitted", "under_review"]),
        supabase.from("client_profiles").select("user_id", { count: "exact", head: true }),
        supabase
          .from("inquiries")
          .select("id", { count: "exact", head: true })
          .in("status", [
            "new",
            "reviewing",
            "waiting_for_client",
            "talent_suggested",
            "in_progress",
          ]),
        supabase
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .eq("approval_state", "pending")
          .is("deleted_at", null),
      ]);

    return {
      totalTalent: talentRes.count ?? 0,
      pendingTalent: pendingTalentRes.count ?? 0,
      totalClients: clientsRes.count ?? 0,
      openInquiries: inquiriesRes.count ?? 0,
      pendingMedia: mediaRes.count ?? 0,
    };
  },
);

export type { AdminTranslationHealth } from "@/lib/translation-center/admin-pulse";

export const loadAdminTranslationHealth = cache(async (): Promise<AdminTranslationHealth | null> => {
  const auth = await requireStaff();
  if (!auth.ok) return null;

  const { supabase } = auth;
  const bootstrap = await loadTranslationCenterBootstrap(supabase);
  return mapBootstrapToAdminPulse(bootstrap);
});

export type AdminClientListRow = {
  user_id: string;
  created_at: string;
  display_name: string | null;
  company_name: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  website_url: string | null;
  notes: string | null;
  inquiriesCount: number;
  latestInquiryAt: string | null;
  savedCount: number;
  account_status: string | null;
  app_role: string | null;
};

export type AdminStaffRow = {
  user_id: string;
  display_name: string | null;
  app_role: string | null;
  account_status: string | null;
  updated_at: string;
  permissions: string[];
};

export type AdminPendingMediaRow = {
  id: string;
  owner_talent_profile_id: string;
  variant_kind: string;
  approval_state: string;
  created_at: string;
  publicUrl: string | null;
  talent: {
    id: string;
    profile_code: string;
    display_name: string | null;
  } | null;
};

export const loadAdminOverviewData = cache(async (): Promise<AdminOverviewData | null> => {
  const auth = await requireStaff();
  if (!auth.ok) return null;

  const { supabase } = auth;

  const counts = await loadAdminShellPulseCounts();
  if (!counts) return null;

  const [engineHealth, recentInquiries, recentTalent, recentMedia] = await Promise.all([
    (async (): Promise<InquiryEngineHealth | null> => {
      const [failed, needs, froz] = await Promise.all([
        supabase
          .from("inquiries")
          .select("id", { count: "exact", head: true })
          .eq("has_failed_effects", true),
        supabase
          .from("inquiries")
          .select("id", { count: "exact", head: true })
          .eq("uses_new_engine", true)
          .is("coordinator_id", null)
          .eq("status", "submitted" as never),
        supabase
          .from("inquiries")
          .select("id", { count: "exact", head: true })
          .eq("is_frozen", true),
      ]);
      return {
        failedEffects: failed.count ?? 0,
        needsCoordinator: needs.count ?? 0,
        frozenInquiries: froz.count ?? 0,
      };
    })(),
    supabase
      .from("inquiries")
      .select("id, status, contact_name, created_at")
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("talent_profiles")
      .select("id, display_name, profile_code, workflow_status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("media_assets")
      .select("id, owner_talent_profile_id, variant_kind, created_at, talent_profiles(profile_code, display_name)")
      .eq("approval_state", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const recentActivity: AdminOverviewActivityItem[] = [];

  for (const row of recentInquiries.data ?? []) {
    recentActivity.push({
      id: `inquiry-${row.id}`,
      type: "inquiry",
      title: row.contact_name || "Inquiry",
      detail: "Client request entered the agency queue.",
      href: `/admin/inquiries/${row.id}`,
      createdAt: row.created_at as string,
      status: row.status as string,
    });
  }

  for (const row of recentTalent.data ?? []) {
    recentActivity.push({
      id: `talent-${row.id}`,
      type: "talent",
      title: (row.display_name as string | null) ?? (row.profile_code as string),
      detail: "Talent profile updated and ready for review or publishing changes.",
      href: `/admin/talent/${row.id}`,
      createdAt: (row.updated_at as string) ?? new Date(0).toISOString(),
      status: row.workflow_status as string,
    });
  }

  for (const row of recentMedia.data ?? []) {
    const talent = Array.isArray(row.talent_profiles) ? row.talent_profiles[0] : row.talent_profiles;
    recentActivity.push({
      id: `media-${row.id}`,
      type: "media",
      title: talent?.display_name ?? talent?.profile_code ?? "Pending media",
      detail: `${row.variant_kind} upload waiting for staff approval.`,
      href: `/admin/talent/${row.owner_talent_profile_id}/media`,
      createdAt: row.created_at as string,
      status: "pending",
    });
  }

  recentActivity.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return {
    counts,
    recentActivity: recentActivity.slice(0, 8),
    inquiryEngineHealth: engineHealth,
  };
});

export const loadAdminClientsData = cache(async (): Promise<AdminClientListRow[]> => {
  const auth = await requireStaff();
  if (!auth.ok) return [];

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("client_profiles")
    .select(
      `
      user_id,
      created_at,
      company_name,
      phone,
      whatsapp_phone,
      website_url,
      notes,
      profiles!inner(display_name, app_role, account_status)
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    logServerError("admin/loadAdminClientsData/list", error);
    return [];
  }

  const rows = (data ?? []).filter((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return profile?.app_role === "client";
  }) as Array<
    {
      user_id: string;
      created_at: string;
      company_name: string | null;
      phone: string | null;
      whatsapp_phone: string | null;
      website_url: string | null;
      notes: string | null;
      profiles:
        | { display_name: string | null; app_role: string | null; account_status: string | null }
        | {
            display_name: string | null;
            app_role: string | null;
            account_status: string | null;
          }[];
    }
  >;

  const userIds = rows.map((row) => row.user_id);
  const inquiryStats = new Map<string, { count: number; latest: string | null }>();
  const savedStats = new Map<string, number>();

  if (userIds.length > 0) {
    const [{ data: inquiries, error: inquiryError }, { data: savedRows, error: savedError }] =
      await Promise.all([
        supabase
          .from("inquiries")
          .select("client_user_id, created_at")
          .in("client_user_id", userIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("saved_talent")
          .select("client_user_id")
          .in("client_user_id", userIds),
      ]);

    if (inquiryError) {
      logServerError("admin/loadAdminClientsData/inquiries", inquiryError);
    } else {
      for (const inquiry of inquiries ?? []) {
        const userId = inquiry.client_user_id as string | null;
        if (!userId) continue;
        const current = inquiryStats.get(userId) ?? { count: 0, latest: null };
        inquiryStats.set(userId, {
          count: current.count + 1,
          latest: current.latest ?? (inquiry.created_at as string),
        });
      }
    }

    if (savedError) {
      logServerError("admin/loadAdminClientsData/savedTalent", savedError);
    } else {
      for (const saved of savedRows ?? []) {
        const userId = saved.client_user_id as string | null;
        if (!userId) continue;
        savedStats.set(userId, (savedStats.get(userId) ?? 0) + 1);
      }
    }
  }

  return rows.map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const stats = inquiryStats.get(row.user_id) ?? { count: 0, latest: null };
    return {
      user_id: row.user_id,
      created_at: row.created_at,
      display_name: profile?.display_name ?? null,
      company_name: row.company_name,
      phone: row.phone,
      whatsapp_phone: row.whatsapp_phone,
      website_url: row.website_url,
      notes: row.notes,
      inquiriesCount: stats.count,
      latestInquiryAt: stats.latest,
      savedCount: savedStats.get(row.user_id) ?? 0,
      account_status: profile?.account_status ?? null,
      app_role: profile?.app_role ?? null,
    };
  });
});

export const loadAdminStaffRows = cache(async (): Promise<AdminStaffRow[]> => {
  const auth = await requireStaff();
  if (!auth.ok) return [];

  const { supabase } = auth;
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, display_name, app_role, account_status, updated_at")
    .in("app_role", ["agency_staff", "super_admin"])
    .order("display_name", { ascending: true });

  if (pErr) {
    logServerError("admin/loadAdminStaffRows/profiles", pErr);
    return [];
  }

  const ids = (profiles ?? []).map((p) => p.id as string);
  if (ids.length === 0) return [];

  const { data: permRows, error: permErr } = await supabase
    .from("staff_permissions")
    .select("user_id, permission")
    .in("user_id", ids);

  if (permErr) {
    logServerError("admin/loadAdminStaffRows/permissions", permErr);
  }

  const permMap = new Map<string, string[]>();
  for (const row of permRows ?? []) {
    const uid = row.user_id as string;
    const list = permMap.get(uid) ?? [];
    list.push(row.permission as string);
    permMap.set(uid, list);
  }

  return (profiles ?? []).map((p) => ({
    user_id: p.id as string,
    display_name: (p.display_name as string | null) ?? null,
    app_role: (p.app_role as string | null) ?? null,
    account_status: (p.account_status as string | null) ?? null,
    updated_at: p.updated_at as string,
    permissions: (permMap.get(p.id as string) ?? []).sort(),
  }));
});

export const loadTaxonomyTalentTypesForFilters = cache(async () => {
  const auth = await requireStaff();
  if (!auth.ok) return [];

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en")
    .eq("kind", "talent_type")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    logServerError("admin/loadTaxonomyTalentTypesForFilters", error);
    return [];
  }

  return (data ?? []).map((t) => ({
    id: t.id as string,
    slug: t.slug as string,
    name_en: t.name_en as string,
  }));
});

export async function loadAdminClientDetail(userId: string) {
  const auth = await requireStaff();
  if (!auth.ok) return null;

  const { supabase } = auth;

  const [
    { data: profile, error: pErr },
    { data: clientProfile, error: cErr },
    { data: inquiries, error: iErr },
    { data: savedTalent, error: sErr },
  ] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name, app_role, account_status").eq("id", userId).maybeSingle(),
      supabase
        .from("client_profiles")
        .select("user_id, company_name, phone, whatsapp_phone, website_url, notes, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("inquiries")
        .select("id, status, created_at, event_location, company, contact_name")
        .eq("client_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("saved_talent")
        .select("talent_profile_id, talent_profiles(id, profile_code, display_name)")
        .eq("client_user_id", userId)
        .limit(24),
    ]);

  if (pErr || cErr || iErr || sErr) {
    if (pErr) logServerError("admin/loadAdminClientDetail/profile", pErr);
    if (cErr) logServerError("admin/loadAdminClientDetail/client", cErr);
    if (iErr) logServerError("admin/loadAdminClientDetail/inquiries", iErr);
    if (sErr) logServerError("admin/loadAdminClientDetail/savedTalent", sErr);
    return null;
  }

  if (!profile || !clientProfile) return null;

  return {
    profile,
    clientProfile,
    inquiries: inquiries ?? [],
    savedTalent: (savedTalent ?? []).map((row) => {
      const talent = Array.isArray(row.talent_profiles) ? row.talent_profiles[0] : row.talent_profiles;
      return {
        talent_profile_id: row.talent_profile_id as string,
        talent: talent
          ? {
              id: talent.id as string,
              profile_code: talent.profile_code as string,
              display_name: (talent.display_name as string | null) ?? null,
            }
          : null,
      };
    }),
  };
}

export const loadAdminPendingMediaData = cache(async (): Promise<AdminPendingMediaRow[]> => {
  const auth = await requireStaff();
  if (!auth.ok) return [];

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "id, owner_talent_profile_id, variant_kind, approval_state, bucket_id, storage_path, created_at, talent_profiles(id, profile_code, display_name)",
    )
    .eq("approval_state", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    logServerError("admin/loadAdminPendingMediaData", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const talent = Array.isArray(row.talent_profiles) ? row.talent_profiles[0] : row.talent_profiles;
    let publicUrl: string | null = null;
    if (row.bucket_id === "media-public") {
      const { data: publicData } = supabase.storage.from("media-public").getPublicUrl(row.storage_path as string);
      publicUrl = publicData.publicUrl;
    }
    return {
      id: row.id as string,
      owner_talent_profile_id: row.owner_talent_profile_id as string,
      variant_kind: row.variant_kind as string,
      approval_state: row.approval_state as string,
      created_at: row.created_at as string,
      publicUrl,
      talent: talent
        ? {
            id: talent.id as string,
            profile_code: talent.profile_code as string,
            display_name: (talent.display_name as string | null) ?? null,
          }
        : null,
    };
  });
});

/** Recent staff-approved assets for the admin media library tab (read-only browse). */
export const loadAdminApprovedMediaLibraryData = cache(async (): Promise<AdminPendingMediaRow[]> => {
  const auth = await requireStaff();
  if (!auth.ok) return [];

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "id, owner_talent_profile_id, variant_kind, approval_state, bucket_id, storage_path, created_at, talent_profiles(id, profile_code, display_name)",
    )
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(96);

  if (error) {
    logServerError("admin/loadAdminApprovedMediaLibraryData", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const talent = Array.isArray(row.talent_profiles) ? row.talent_profiles[0] : row.talent_profiles;
    let publicUrl: string | null = null;
    if (row.bucket_id === "media-public") {
      const { data: publicData } = supabase.storage.from("media-public").getPublicUrl(row.storage_path as string);
      publicUrl = publicData.publicUrl;
    }
    return {
      id: row.id as string,
      owner_talent_profile_id: row.owner_talent_profile_id as string,
      variant_kind: row.variant_kind as string,
      approval_state: row.approval_state as string,
      created_at: row.created_at as string,
      publicUrl,
      talent: talent
        ? {
            id: talent.id as string,
            profile_code: talent.profile_code as string,
            display_name: (talent.display_name as string | null) ?? null,
          }
        : null,
    };
  });
});
