import { NextResponse } from "next/server";
import { loadAccessProfile } from "@/lib/access-profile";
import type {
  GlobalUserSearchResponse,
  GlobalUserSearchResult,
  GlobalUserSearchRole,
} from "@/lib/admin/global-user-search-types";
import { isStaffRole } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/server";

const MAX_ROWS = 100;
const FETCH_CAP = 220;

function ilikePattern(raw: string) {
  const cleaned = raw.replace(/[%_\\]/g, "\\$&");
  return `%${cleaned}%`;
}

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function matchesAccountStatusFilter(
  accountStatus: string | null,
  filter: "active" | "pending" | "suspended" | "all",
): boolean {
  if (filter === "all") return true;
  const s = norm(accountStatus) || "registered";
  if (filter === "active") return s === "active";
  if (filter === "suspended") return s === "suspended";
  if (filter === "pending") return s === "registered" || s === "onboarding";
  return true;
}

function matchesProfileFilter(
  row: {
    workflow_status: string;
    profile_completeness_score: number | null;
  },
  filter: "complete" | "incomplete" | "submitted" | "approved" | "all",
): boolean {
  if (filter === "all") return true;
  const score = Number(row.profile_completeness_score ?? 0);
  if (filter === "complete") return score >= 65;
  if (filter === "incomplete") return score < 65;
  if (filter === "submitted")
    return row.workflow_status === "submitted" || row.workflow_status === "under_review";
  if (filter === "approved") return row.workflow_status === "approved";
  return true;
}

function primaryTalentType(
  taxRows: unknown,
): { label: string | null } {
  if (!Array.isArray(taxRows)) return { label: null };
  for (const tr of taxRows) {
    if (!tr || typeof tr !== "object") continue;
    const t = tr as Record<string, unknown>;
    if (!t.is_primary) continue;
    const term = t.taxonomy_terms;
    const termRow = Array.isArray(term) ? term[0] : term;
    if (termRow && typeof termRow === "object") {
      const k = (termRow as Record<string, unknown>).kind;
      const name = (termRow as Record<string, unknown>).name_en;
      if (k === "talent_type" && typeof name === "string") return { label: name };
    }
  }
  for (const tr of taxRows) {
    if (!tr || typeof tr !== "object") continue;
    const t = tr as Record<string, unknown>;
    const term = t.taxonomy_terms;
    const termRow = Array.isArray(term) ? term[0] : term;
    if (termRow && typeof termRow === "object") {
      const k = (termRow as Record<string, unknown>).kind;
      const name = (termRow as Record<string, unknown>).name_en;
      if (k === "talent_type" && typeof name === "string") return { label: name };
    }
  }
  return { label: null };
}

function locationLabels(row: Record<string, unknown>): { city: string | null; country: string | null } {
  const rc = row.res_city;
  const rco = row.res_ctry;
  const cityRow = Array.isArray(rc) ? rc[0] : rc;
  const countryRow = Array.isArray(rco) ? rco[0] : rco;
  const city =
    cityRow && typeof cityRow === "object"
      ? ((cityRow as Record<string, unknown>).display_name_en as string | null) ?? null
      : null;
  let country: string | null =
    countryRow && typeof countryRow === "object"
      ? ((countryRow as Record<string, unknown>).name_en as string | null) ?? null
      : null;
  if (!country && countryRow && typeof countryRow === "object") {
    const iso = (countryRow as Record<string, unknown>).iso2 as string | null;
    if (iso) country = iso;
  }
  return { city, country };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qRaw = searchParams.get("q")?.trim() ?? "";
  const roleParam = (searchParams.get("role") ?? "all").trim() as
    | "all"
    | GlobalUserSearchRole;
  const statusFilter = (searchParams.get("status") ?? "all").trim() as
    | "active"
    | "pending"
    | "suspended"
    | "all";
  const profileFilter = (searchParams.get("profile") ?? "all").trim() as
    | "complete"
    | "incomplete"
    | "submitted"
    | "approved"
    | "all";
  const cityFilter = searchParams.get("city")?.trim() ?? "";
  const countryFilter = searchParams.get("country")?.trim() ?? "";
  const talentTypeTermId = searchParams.get("talent_type")?.trim() ?? "";

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await loadAccessProfile(supabase, user.id);
  if (!isStaffRole(access?.app_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hasQ = qRaw.length > 0;
  const hasLoc = cityFilter.length > 0 || countryFilter.length > 0;
  const hasType = talentTypeTermId.length > 0;
  if (!hasQ && !hasLoc && !hasType && statusFilter === "all" && profileFilter === "all") {
    return NextResponse.json({
      results: [],
      truncated: false,
    } satisfies GlobalUserSearchResponse);
  }

  const pattern = hasQ ? ilikePattern(qRaw) : null;
  const results: GlobalUserSearchResult[] = [];
  const seen = new Set<string>();

  const push = (r: GlobalUserSearchResult) => {
    if (seen.has(r.key)) return;
    seen.add(r.key);
    results.push(r);
  };

  // --- Talent ---
  if (roleParam === "all" || roleParam === "talent") {
    let talentQuery = supabase
      .from("talent_profiles")
      .select(
        `
        id,
        user_id,
        profile_code,
        display_name,
        workflow_status,
        visibility,
        profile_completeness_score,
        phone,
        deleted_at,
        updated_at,
        profiles!talent_profiles_user_id_fkey(display_name, app_role, account_status),
        res_city:locations!talent_profiles_residence_city_id_fkey(display_name_en),
        res_ctry:countries!talent_profiles_residence_country_id_fkey(name_en, iso2),
        talent_profile_taxonomy(taxonomy_term_id, is_primary, taxonomy_terms(kind, name_en))
      `,
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(FETCH_CAP);

    if (pattern) {
      talentQuery = talentQuery.or(
        `display_name.ilike.${pattern},profile_code.ilike.${pattern},phone.ilike.${pattern}`,
      );
    }

    const { data: talentRows, error: talentErr } = await talentQuery;

    if (talentErr) {
      let fb = supabase
        .from("talent_profiles")
        .select(
          "id, user_id, profile_code, display_name, workflow_status, visibility, profile_completeness_score, phone, deleted_at, updated_at, profiles!talent_profiles_user_id_fkey(display_name, app_role, account_status), talent_profile_taxonomy(taxonomy_term_id, is_primary, taxonomy_terms(kind, name_en))",
        )
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(FETCH_CAP);
      if (pattern) {
        fb = fb.or(
          `display_name.ilike.${pattern},profile_code.ilike.${pattern},phone.ilike.${pattern}`,
        );
      }
      const { data: fallback, error: fbErr } = await fb;

      if (fbErr) {
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
      }

      for (const row of fallback ?? []) {
        const r = row as Record<string, unknown>;
        const profiles = r.profiles;
        const prof = Array.isArray(profiles) ? profiles[0] : profiles;
        const accountStatus =
          prof && typeof prof === "object"
            ? ((prof as Record<string, unknown>).account_status as string | null)
            : null;
        if (!matchesAccountStatusFilter(accountStatus, statusFilter)) continue;
        if (
          !matchesProfileFilter(
            {
              workflow_status: r.workflow_status as string,
              profile_completeness_score: r.profile_completeness_score as number | null,
            },
            profileFilter,
          )
        )
          continue;

        const { label: typeLabel } = primaryTalentType(r.talent_profile_taxonomy);
        if (talentTypeTermId) {
          const tax = r.talent_profile_taxonomy;
          const ok = Array.isArray(tax)
            ? tax.some(
                (t) =>
                  t &&
                  typeof t === "object" &&
                  String((t as Record<string, unknown>).taxonomy_term_id ?? "") === talentTypeTermId,
              )
            : false;
          if (!ok) continue;
        }

        const loc = { city: null as string | null, country: null as string | null };
        if (cityFilter && !norm(loc.city).includes(norm(cityFilter))) continue;
        if (countryFilter && !norm(loc.country).includes(norm(countryFilter))) continue;

        const wf = r.workflow_status as string;
        const vis = r.visibility as string;
        const statusLabel =
          wf === "approved" && vis === "public"
            ? "Live"
            : wf.replace(/_/g, " ");

        push({
          key: `talent:${r.id as string}`,
          kind: "talent",
          id: r.id as string,
          userId: (r.user_id as string | null) ?? null,
          talentProfileId: r.id as string,
          displayName: (r.display_name as string | null) ?? null,
          subtitle: (r.profile_code as string) ?? null,
          profileCode: (r.profile_code as string) ?? null,
          city: loc.city,
          country: loc.country,
          roleLabel: "Talent",
          statusLabel,
          workflowStatus: wf,
          talentTypeLabel: typeLabel,
          completeness: Number(r.profile_completeness_score ?? 0),
          pendingMediaCount: 0,
          accountStatus,
        });
      }
    } else {
      for (const row of talentRows ?? []) {
        const r = row as Record<string, unknown>;
        const profiles = r.profiles;
        const prof = Array.isArray(profiles) ? profiles[0] : profiles;
        const accountStatus =
          prof && typeof prof === "object"
            ? ((prof as Record<string, unknown>).account_status as string | null)
            : null;
        if (!matchesAccountStatusFilter(accountStatus, statusFilter)) continue;
        if (
          !matchesProfileFilter(
            {
              workflow_status: r.workflow_status as string,
              profile_completeness_score: r.profile_completeness_score as number | null,
            },
            profileFilter,
          )
        )
          continue;

        const loc = locationLabels(r);
        if (cityFilter && !norm(loc.city).includes(norm(cityFilter))) continue;
        if (
          countryFilter &&
          !norm(loc.country).includes(norm(countryFilter)) &&
          !norm(loc.country).includes(norm(countryFilter.slice(0, 2)))
        )
          continue;

        const { label: typeLabel } = primaryTalentType(r.talent_profile_taxonomy);
        if (talentTypeTermId) {
          const tax = r.talent_profile_taxonomy;
          const ok = Array.isArray(tax)
            ? tax.some(
                (t) =>
                  t &&
                  typeof t === "object" &&
                  String((t as Record<string, unknown>).taxonomy_term_id ?? "") === talentTypeTermId,
              )
            : false;
          if (!ok) continue;
        }

        const wf = r.workflow_status as string;
        const vis = r.visibility as string;
        const statusLabel =
          wf === "approved" && vis === "public"
            ? "Live"
            : wf.replace(/_/g, " ");

        push({
          key: `talent:${r.id as string}`,
          kind: "talent",
          id: r.id as string,
          userId: (r.user_id as string | null) ?? null,
          talentProfileId: r.id as string,
          displayName: (r.display_name as string | null) ?? null,
          subtitle: (r.profile_code as string) ?? null,
          profileCode: (r.profile_code as string) ?? null,
          city: loc.city,
          country: loc.country,
          roleLabel: "Talent",
          statusLabel,
          workflowStatus: wf,
          talentTypeLabel: typeLabel,
          completeness: Number(r.profile_completeness_score ?? 0),
          pendingMediaCount: 0,
          accountStatus,
        });
      }
    }
  }

  // Pending media counts for talent results (batch)
  const talentIds = results.filter((r) => r.kind === "talent").map((r) => r.talentProfileId!);
  if (talentIds.length > 0) {
    const { data: mediaRows } = await supabase
      .from("media_assets")
      .select("owner_talent_profile_id")
      .eq("approval_state", "pending")
      .is("deleted_at", null)
      .in("owner_talent_profile_id", talentIds);

    const counts = new Map<string, number>();
    for (const m of mediaRows ?? []) {
      const id = m.owner_talent_profile_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const r of results) {
      if (r.kind !== "talent" || !r.talentProfileId) continue;
      r.pendingMediaCount = counts.get(r.talentProfileId) ?? 0;
    }
  }

  // --- Clients ---
  if ((roleParam === "all" || roleParam === "client") && profileFilter === "all") {
    if (!cityFilter && !countryFilter) {
      const clientIds = new Set<string>();

      if (pattern) {
        const [nameRes, cpRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id")
            .eq("app_role", "client")
            .ilike("display_name", pattern)
            .limit(80),
          supabase
            .from("client_profiles")
            .select("user_id")
            .or(
              `company_name.ilike.${pattern},phone.ilike.${pattern},whatsapp_phone.ilike.${pattern}`,
            )
            .limit(80),
        ]);
        for (const r of nameRes.data ?? []) clientIds.add(r.id as string);
        for (const r of cpRes.data ?? []) clientIds.add(r.user_id as string);
      } else if (statusFilter !== "all") {
        let pq = supabase.from("profiles").select("id").eq("app_role", "client").limit(FETCH_CAP);
        if (statusFilter === "active") pq = pq.eq("account_status", "active");
        else if (statusFilter === "suspended") pq = pq.eq("account_status", "suspended");
        else if (statusFilter === "pending")
          pq = pq.in("account_status", ["registered", "onboarding"]);
        const { data: stRows } = await pq;
        for (const r of stRows ?? []) clientIds.add(r.id as string);
      }

      if (clientIds.size > 0) {
        const ids = [...clientIds].slice(0, FETCH_CAP);
        const { data: clientRows } = await supabase
          .from("client_profiles")
          .select(
            `
            user_id,
            company_name,
            phone,
            whatsapp_phone,
            profiles!inner(id, display_name, app_role, account_status)
          `,
          )
          .in("user_id", ids);

        for (const row of clientRows ?? []) {
          const r = row as Record<string, unknown>;
          const profiles = r.profiles;
          const prof = Array.isArray(profiles) ? profiles[0] : profiles;
          if (!prof || typeof prof !== "object") continue;
          const p = prof as Record<string, unknown>;
          if (p.app_role !== "client") continue;
          const userId = r.user_id as string;
          const accountStatus = p.account_status as string | null;
          if (!matchesAccountStatusFilter(accountStatus, statusFilter)) continue;

          push({
            key: `client:${userId}`,
            kind: "client",
            id: userId,
            userId,
            talentProfileId: null,
            displayName: (p.display_name as string | null) ?? null,
            subtitle: (r.company_name as string | null) ?? null,
            profileCode: null,
            city: null,
            country: null,
            roleLabel: "Client",
            statusLabel: norm(accountStatus) || "registered",
            workflowStatus: null,
            talentTypeLabel: null,
            completeness: null,
            pendingMediaCount: 0,
            accountStatus,
          });
        }
      }
    }

    // Email discovery via inquiries
    if (pattern && qRaw.includes("@")) {
      const { data: inqRows } = await supabase
        .from("inquiries")
        .select("client_user_id, contact_email, contact_name, company")
        .ilike("contact_email", pattern)
        .not("client_user_id", "is", null)
        .limit(40);

      const userIds = [
        ...new Set(
          (inqRows ?? [])
            .map((x) => x.client_user_id as string | null)
            .filter(Boolean) as string[],
        ),
      ];
      if (userIds.length > 0) {
        const { data: profRows } = await supabase
          .from("profiles")
          .select("id, display_name, app_role, account_status")
          .in("id", userIds)
          .eq("app_role", "client");

        const { data: cpRows } = await supabase
          .from("client_profiles")
          .select("user_id, company_name, phone, whatsapp_phone")
          .in("user_id", userIds);

        const cpByUser = new Map(
          (cpRows ?? []).map((c) => [c.user_id as string, c as Record<string, unknown>]),
        );

        for (const p of profRows ?? []) {
          const pr = p as Record<string, unknown>;
          const userId = pr.id as string;
          const accountStatus = pr.account_status as string | null;
          if (!matchesAccountStatusFilter(accountStatus, statusFilter)) continue;
          if (profileFilter !== "all") continue;
          const cp = cpByUser.get(userId);
          push({
            key: `client:${userId}`,
            kind: "client",
            id: userId,
            userId,
            talentProfileId: null,
            displayName: (pr.display_name as string | null) ?? null,
            subtitle: (cp?.company_name as string | null) ?? "Matched via inquiry email",
            profileCode: null,
            city: null,
            country: null,
            roleLabel: "Client",
            statusLabel: norm(accountStatus) || "registered",
            workflowStatus: null,
            talentTypeLabel: null,
            completeness: null,
            pendingMediaCount: 0,
            accountStatus,
          });
        }
      }
    }
  }

  // --- Admins ---
  if (roleParam === "all" || roleParam === "admin") {
    if (profileFilter !== "all") {
      /* profile filter is talent-centric */
    } else {
      let adminQuery = supabase
        .from("profiles")
        .select("id, display_name, app_role, account_status, updated_at")
        .in("app_role", ["agency_staff", "super_admin"])
        .order("updated_at", { ascending: false })
        .limit(FETCH_CAP);

      if (pattern) {
        adminQuery = adminQuery.ilike("display_name", pattern);
      }

      const { data: adminRows, error: adminErr } = await adminQuery;
      if (!adminErr) {
        for (const row of adminRows ?? []) {
          const r = row as Record<string, unknown>;
          const accountStatus = r.account_status as string | null;
          if (!matchesAccountStatusFilter(accountStatus, statusFilter)) continue;
          if (cityFilter || countryFilter) continue;

          const userId = r.id as string;
          push({
            key: `admin:${userId}`,
            kind: "admin",
            id: userId,
            userId,
            talentProfileId: null,
            displayName: (r.display_name as string | null) ?? null,
            subtitle: (r.app_role as string) ?? null,
            profileCode: null,
            city: null,
            country: null,
            roleLabel: (r.app_role as string) === "super_admin" ? "Super admin" : "Agency staff",
            statusLabel: norm(accountStatus) || "active",
            workflowStatus: null,
            talentTypeLabel: null,
            completeness: null,
            pendingMediaCount: 0,
            accountStatus,
          });
        }
      }
    }
  }

  results.sort((a, b) => {
    if (hasQ && pattern) {
      const an = norm(a.displayName);
      const bn = norm(b.displayName);
      const qn = qRaw.toLowerCase();
      const aStarts = an.startsWith(qn) ? 0 : 1;
      const bStarts = bn.startsWith(qn) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
    }
    return 0;
  });

  const truncated = results.length > MAX_ROWS;
  const sliced = results.slice(0, MAX_ROWS);

  return NextResponse.json({
    results: sliced,
    truncated,
  } satisfies GlobalUserSearchResponse);
}
