import { NextResponse } from "next/server";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { getTenantScope } from "@/lib/saas/scope";
import { listAdminRosterTalentIds } from "@/lib/saas/talent-roster";

const IMPOSSIBLE_ID = "00000000-0000-0000-0000-000000000000";

const LIMIT = 8;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(raw: string) {
  return UUID_RE.test(raw.trim());
}

function ilikePattern(raw: string) {
  const cleaned = raw.replace(/[%_\\]/g, "\\$&");
  return `%${cleaned}%`;
}

function dedupeTalent(
  rows: Array<{ id: string; profile_code: string; display_name: string | null }>,
) {
  const seen = new Set<string>();
  const out: typeof rows = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out.slice(0, LIMIT);
}

type ProfileAccountRow = {
  id: string;
  display_name: string | null;
  app_role: string;
  talent_profiles: { id: string } | { id: string }[] | null;
};

function talentProfileIdFromJoined(row: ProfileAccountRow): string | null {
  const tp = row.talent_profiles;
  if (!tp) return null;
  if (Array.isArray(tp)) return tp[0]?.id ?? null;
  return tp.id ?? null;
}

function asProfileRows(data: unknown): ProfileAccountRow[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as ProfileAccountRow[];
  return [data as ProfileAccountRow];
}

export type AdminSearchResponse = {
  talent: Array<{ id: string; profile_code: string; display_name: string | null }>;
  inquiries: Array<{ id: string; contact_name: string | null; company: string | null }>;
  clients: Array<{ id: string; display_name: string | null }>;
  accounts: Array<{
    id: string;
    display_name: string | null;
    app_role: string;
    talent_profile_id: string | null;
  }>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({
      talent: [],
      inquiries: [],
      clients: [],
      accounts: [],
    } satisfies AdminSearchResponse);
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await loadAccessProfile(supabase, user.id);
  if (!isStaffRole(profile?.app_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scope = await getTenantScope();
  if (!scope) {
    return NextResponse.json({ error: "No tenant scope" }, { status: 403 });
  }
  const tenantId = scope.tenantId;

  const rosterTalentIds = await listAdminRosterTalentIds(supabase, tenantId);
  const scopedTalentIds = rosterTalentIds.length > 0 ? rosterTalentIds : [IMPOSSIBLE_ID];

  const [{ data: inquiryClientRows }, { data: staffMembershipRows }] =
    await Promise.all([
      supabase
        .from("inquiries")
        .select("client_user_id")
        .eq("tenant_id", tenantId)
        .not("client_user_id", "is", null),
      supabase
        .from("agency_memberships")
        .select("profile_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
    ]);

  const tenantClientIds = [
    ...new Set(
      (inquiryClientRows ?? [])
        .map((r) => r.client_user_id as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const scopedClientIds = tenantClientIds.length > 0 ? tenantClientIds : [IMPOSSIBLE_ID];

  const tenantStaffIds = (staffMembershipRows ?? [])
    .map((r) => r.profile_id as string | null)
    .filter((v): v is string => Boolean(v));
  const talentUserIds = (
    await supabase.from("talent_profiles").select("user_id").in("id", scopedTalentIds)
  ).data
    ?.map((r) => r.user_id as string | null)
    .filter((v): v is string => Boolean(v)) ?? [];
  const accountProfileIds = [
    ...new Set([...tenantStaffIds, ...talentUserIds, ...tenantClientIds]),
  ];
  const scopedAccountIds = accountProfileIds.length > 0 ? accountProfileIds : [IMPOSSIBLE_ID];

  const pattern = ilikePattern(q);
  const qUuid = isUuid(q);

  const [
    talentNameRes,
    talentCodeRes,
    talentIdTextRes,
    inqNameRes,
    inqCompanyRes,
    inqEmailRes,
    clientsRes,
    accountsNameRes,
    accountsIdTextRes,
    talentByProfileIdRes,
    talentByUserIdRes,
    inquiryByIdRes,
    profileByIdRes,
    inqIdTextRes,
  ] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("id, profile_code, display_name")
      .in("id", scopedTalentIds)
      .is("deleted_at", null)
      .ilike("display_name", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("talent_profiles")
      .select("id, profile_code, display_name")
      .in("id", scopedTalentIds)
      .is("deleted_at", null)
      .ilike("profile_code", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("talent_profiles")
      .select("id, profile_code, display_name")
      .in("id", scopedTalentIds)
      .is("deleted_at", null)
      .filter("id::text", "ilike", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("inquiries")
      .select("id, contact_name, company")
      .eq("tenant_id", tenantId)
      .ilike("contact_name", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("inquiries")
      .select("id, contact_name, company")
      .eq("tenant_id", tenantId)
      .ilike("company", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("inquiries")
      .select("id, contact_name, company")
      .eq("tenant_id", tenantId)
      .ilike("contact_email", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", scopedClientIds)
      .eq("app_role", "client")
      .ilike("display_name", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("profiles")
      .select("id, display_name, app_role, talent_profiles!talent_profiles_user_id_fkey(id)")
      .in("id", scopedAccountIds)
      .ilike("display_name", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("profiles")
      .select("id, display_name, app_role, talent_profiles!talent_profiles_user_id_fkey(id)")
      .in("id", scopedAccountIds)
      .filter("id::text", "ilike", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    qUuid
      ? supabase
          .from("talent_profiles")
          .select("id, profile_code, display_name")
          .in("id", scopedTalentIds)
          .is("deleted_at", null)
          .eq("id", q)
          .limit(1)
      : Promise.resolve({ data: [] as AdminSearchResponse["talent"], error: null }),
    qUuid
      ? supabase
          .from("talent_profiles")
          .select("id, profile_code, display_name")
          .in("id", scopedTalentIds)
          .is("deleted_at", null)
          .eq("user_id", q)
          .limit(1)
      : Promise.resolve({ data: [] as AdminSearchResponse["talent"], error: null }),
    qUuid
      ? supabase
          .from("inquiries")
          .select("id, contact_name, company")
          .eq("tenant_id", tenantId)
          .eq("id", q)
          .limit(1)
      : Promise.resolve({ data: [] as AdminSearchResponse["inquiries"], error: null }),
    qUuid
      ? supabase
          .from("profiles")
          .select("id, display_name, app_role, talent_profiles!talent_profiles_user_id_fkey(id)")
          .in("id", scopedAccountIds)
          .eq("id", q)
          .limit(1)
      : Promise.resolve({ data: [] as ProfileAccountRow[], error: null }),
    supabase
      .from("inquiries")
      .select("id, contact_name, company")
      .eq("tenant_id", tenantId)
      .filter("id::text", "ilike", pattern)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
  ]);

  const talentRows = dedupeTalent([
    ...((talentNameRes.data ?? []) as AdminSearchResponse["talent"]),
    ...((talentCodeRes.data ?? []) as AdminSearchResponse["talent"]),
    ...((talentIdTextRes.data ?? []) as AdminSearchResponse["talent"]),
    ...((talentByProfileIdRes.data ?? []) as AdminSearchResponse["talent"]),
    ...((talentByUserIdRes.data ?? []) as AdminSearchResponse["talent"]),
  ]);

  const inqSeen = new Set<string>();
  const inquiries: AdminSearchResponse["inquiries"] = [];
  for (const row of [
    ...(inqNameRes.data ?? []),
    ...(inqCompanyRes.data ?? []),
    ...(inqEmailRes.data ?? []),
    ...(inqIdTextRes.data ?? []),
    ...(inquiryByIdRes.data ?? []),
  ] as AdminSearchResponse["inquiries"]) {
    if (inqSeen.has(row.id)) continue;
    inqSeen.add(row.id);
    inquiries.push(row);
    if (inquiries.length >= LIMIT) break;
  }

  const clients: AdminSearchResponse["clients"] = (clientsRes.data ?? []).map((row) => ({
    id: row.id as string,
    display_name: (row.display_name as string | null) ?? null,
  }));

  const clientSeen = new Set(clients.map((c) => c.id));
  for (const row of asProfileRows(profileByIdRes.data)) {
    if (row.app_role !== "client" || clientSeen.has(row.id)) continue;
    clientSeen.add(row.id);
    clients.push({
      id: row.id,
      display_name: row.display_name,
    });
  }

  const talentIds = new Set(talentRows.map((t) => t.id));
  const accountSeen = new Set<string>();
  const accounts: AdminSearchResponse["accounts"] = [];
  for (const row of [
    ...asProfileRows(accountsNameRes.data),
    ...asProfileRows(accountsIdTextRes.data),
    ...asProfileRows(profileByIdRes.data),
  ]) {
    if (row.app_role === "client") continue;
    const tpId = talentProfileIdFromJoined(row);
    if (tpId && talentIds.has(tpId)) continue;
    if (accountSeen.has(row.id)) continue;
    accountSeen.add(row.id);
    accounts.push({
      id: row.id,
      display_name: row.display_name,
      app_role: row.app_role,
      talent_profile_id: tpId,
    });
    if (accounts.length >= LIMIT) break;
  }

  return NextResponse.json({
    talent: talentRows,
    inquiries,
    clients: clients.slice(0, LIMIT),
    accounts,
  } satisfies AdminSearchResponse);
}
