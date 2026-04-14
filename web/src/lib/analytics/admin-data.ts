import { cache } from "react";
import { requireStaff } from "@/lib/server/action-guards";

export type DateRangeKey = "7d" | "30d" | "90d";

export function rangeFromKey(key: DateRangeKey): { start: Date; end: Date; label: string } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end, label: `Last ${days} days` };
}

export function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ExecutiveOverviewInternal = {
  inquiriesTotal: number;
  inquiriesPeriod: number;
  talentApproved: number;
  talentPendingReview: number;
  clientProfiles: number;
  openInquiries: number;
  analyticsEventsPeriod: number;
  profileViewEventsPeriod: number;
};

export const loadExecutiveOverviewInternal = cache(
  async (range: { start: Date; end: Date }): Promise<ExecutiveOverviewInternal | null> => {
    const auth = await requireStaff();
    if (!auth.ok) return null;
    const { supabase } = auth;
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    const [
      inquiriesRes,
      inquiriesPeriodRes,
      approvedRes,
      pendingRes,
      clientsRes,
      openInqRes,
      eventsRes,
      profileViewsRes,
    ] = await Promise.all([
      supabase.from("inquiries").select("id", { count: "exact", head: true }),
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      supabase
        .from("talent_profiles")
        .select("id", { count: "exact", head: true })
        .eq("workflow_status", "approved")
        .is("deleted_at", null),
      supabase
        .from("talent_profiles")
        .select("id", { count: "exact", head: true })
        .in("workflow_status", ["submitted", "under_review"])
        .is("deleted_at", null),
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
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("name", "view_talent_profile")
        .gte("created_at", startIso)
        .lte("created_at", endIso),
    ]);

    return {
      inquiriesTotal: inquiriesRes.count ?? 0,
      inquiriesPeriod: inquiriesPeriodRes.count ?? 0,
      talentApproved: approvedRes.count ?? 0,
      talentPendingReview: pendingRes.count ?? 0,
      clientProfiles: clientsRes.count ?? 0,
      openInquiries: openInqRes.count ?? 0,
      analyticsEventsPeriod: eventsRes.count ?? 0,
      profileViewEventsPeriod: profileViewsRes.count ?? 0,
    };
  },
);

export type SearchQualitySummary = {
  total: number;
  zeroResults: number;
  withAiPath: number;
  withFallback: number;
};

const FUNNEL_EVENT_NAMES = [
  "view_directory",
  "view_talent_card",
  "view_talent_profile",
  "start_inquiry",
  "submit_inquiry",
  "start_application",
  "submit_application",
] as const;

export type FunnelEventCounts = Record<(typeof FUNNEL_EVENT_NAMES)[number], number>;

export const loadFunnelEventCounts = cache(
  async (range: { start: Date; end: Date }): Promise<FunnelEventCounts | null> => {
    const auth = await requireStaff();
    if (!auth.ok) return null;
    const { supabase } = auth;
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    const results = await Promise.all(
      FUNNEL_EVENT_NAMES.map((name) =>
        supabase
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("name", name)
          .gte("created_at", startIso)
          .lte("created_at", endIso),
      ),
    );

    return FUNNEL_EVENT_NAMES.reduce((acc, name, i) => {
      acc[name] = results[i]?.count ?? 0;
      return acc;
    }, {} as FunnelEventCounts);
  },
);

export const loadSearchQualitySummary = cache(
  async (range: { start: Date; end: Date }): Promise<SearchQualitySummary | null> => {
    const auth = await requireStaff();
    if (!auth.ok) return null;
    const { supabase } = auth;
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    const [totalRes, zeroRes, aiRes, fbRes] = await Promise.all([
      supabase
        .from("search_queries")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      supabase
        .from("search_queries")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .eq("results_count", 0),
      supabase
        .from("search_queries")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .not("ai_path_requested", "is", null),
      supabase
        .from("search_queries")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .eq("fallback_triggered", true),
    ]);

    return {
      total: totalRes.count ?? 0,
      zeroResults: zeroRes.count ?? 0,
      withAiPath: aiRes.count ?? 0,
      withFallback: fbRes.count ?? 0,
    };
  },
);
