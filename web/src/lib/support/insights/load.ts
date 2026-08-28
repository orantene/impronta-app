import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { supportFrom } from "../support-from";
import {
  mapFixLinkRow,
  mapInsightRow,
  type HqInsightsDashboard,
  type SupportFixLinkRow,
  type SupportInsightRow,
  type WeeklyDigestSnapshot,
} from "./types";

function startOfUtcWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export async function loadTicketInsight(ticketId: string): Promise<SupportInsightRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await supportFrom(admin, "support_ticket_insights")
    .select("*")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  return mapInsightRow(data);
}

export async function loadTicketFixLinks(ticketId: string) {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data } = await supportFrom(admin, "support_ticket_fix_links")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.map((row) => mapFixLinkRow(row)).filter((r): r is SupportFixLinkRow => r != null);
}

export async function loadConfirmedInsightCorpus(limit = 80): Promise<
  Array<{ id: string; summary: string; root_cause: string | null; product_area: string | null }>
> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data } = await supportFrom(admin, "support_ticket_insights")
    .select("id, summary, root_cause, product_area")
    .not("confirmed_at", "is", null)
    .limit(limit);
  return (data ?? []) as Array<{
    id: string;
    summary: string;
    root_cause: string | null;
    product_area: string | null;
  }>;
}

export async function loadHqInsightsDashboard(): Promise<HqInsightsDashboard> {
  const empty: HqInsightsDashboard = {
    openNow: 0,
    needsYou: 0,
    medianFirstReplyMs: null,
    resolvedThisWeek: 0,
    avgRating: null,
    aiResolvedShare: null,
    aiResolvedCount: 0,
    friction: [],
    weeklyVolume: [],
    digest: null,
    shipped: [],
  };
  const admin = createServiceRoleClient();
  if (!admin) return empty;

  const now = new Date();
  const weekStart = startOfUtcWeek(now);
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 21);

  const { data: tickets } = await supportFrom(admin, "support_tickets")
    .select("id, status, waiting_on, created_at, first_human_response_at, resolved_at, satisfaction_rating, category, handled_by, ticket_number")
    .gte("created_at", fourWeeksAgo.toISOString());

  const { data: openRows } = await supportFrom(admin, "support_tickets")
    .select("id, waiting_on")
    .eq("status", "open");

  const openNow = (openRows ?? []).length;
  const needsYou = (openRows ?? []).filter((r: { waiting_on?: string }) => r.waiting_on === "support").length;

  const thisWeek = (tickets ?? []).filter((r: { resolved_at?: string | null; status?: string }) => {
    if (r.status !== "resolved" && r.status !== "closed") return false;
    if (!r.resolved_at) return false;
    return new Date(r.resolved_at) >= weekStart;
  });
  const replyDeltas = thisWeek
    .map((r: { created_at?: string; first_human_response_at?: string | null }) => {
      if (!r.created_at || !r.first_human_response_at) return null;
      return new Date(r.first_human_response_at).getTime() - new Date(r.created_at).getTime();
    })
    .filter((n: number | null): n is number => n != null && n >= 0);
  const ratings = thisWeek
    .map((r: { satisfaction_rating?: number | null }) => r.satisfaction_rating)
    .filter((n: unknown): n is number => typeof n === "number");
  const avgRating =
    ratings.length > 0
      ? ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length
      : null;

  const { data: weekInsights } = await supportFrom(admin, "support_ticket_insights")
    .select("resolution_kind, product_area")
    .gte("created_at", weekStart.toISOString());
  const aiResolvedCount = (weekInsights ?? []).filter(
    (r: { resolution_kind?: string }) => r.resolution_kind === "ai_self_serve",
  ).length;
  const insightTotal = (weekInsights ?? []).length;
  const aiResolvedShare = insightTotal > 0 ? aiResolvedCount / insightTotal : null;

  const frictionMap = new Map<string, number>();
  for (const r of thisWeek as Array<{ category?: string | null }>) {
    const area = r.category?.trim() || "General";
    frictionMap.set(area, (frictionMap.get(area) ?? 0) + 1);
  }
  const friction = [...frictionMap.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const buckets: Array<{ weekLabel: string; count: number; start: Date }> = [];
  for (let i = 3; i >= 0; i -= 1) {
    const start = new Date(weekStart);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const iso = start.toISOString().slice(0, 10);
    buckets.push({ weekLabel: iso.slice(5), count: 0, start });
  }
  for (const r of tickets ?? []) {
    const created = new Date(String((r as { created_at?: string }).created_at ?? ""));
    for (let i = buckets.length - 1; i >= 0; i -= 1) {
      if (created >= buckets[i]!.start) {
        buckets[i]!.count += 1;
        break;
      }
    }
  }

  const { data: settings } = await supportFrom(admin, "platform_settings")
    .select("support_weekly_digest")
    .eq("id", true)
    .maybeSingle();
  const rawDigest = settings?.support_weekly_digest;
  const digest: WeeklyDigestSnapshot | null =
    rawDigest && typeof rawDigest === "object" && typeof (rawDigest as WeeklyDigestSnapshot).summary === "string"
      ? (rawDigest as WeeklyDigestSnapshot)
      : null;

  const { data: links } = await supportFrom(admin, "support_ticket_fix_links")
    .select("id, ticket_id, kind, url, note, created_at")
    .order("created_at", { ascending: false })
    .limit(12);
  const ticketIds = [...new Set((links ?? []).map((l: { ticket_id?: string }) => String(l.ticket_id ?? "")))];
  const numbers = new Map<string, number>();
  if (ticketIds.length > 0) {
    const { data: trows } = await supportFrom(admin, "support_tickets")
      .select("id, ticket_number")
      .in("id", ticketIds);
    for (const t of trows ?? []) {
      numbers.set(String((t as { id: string }).id), Number((t as { ticket_number?: number }).ticket_number));
    }
  }

  return {
    openNow,
    needsYou,
    medianFirstReplyMs: median(replyDeltas),
    resolvedThisWeek: thisWeek.length,
    avgRating,
    aiResolvedShare,
    aiResolvedCount,
    friction,
    weeklyVolume: buckets.map((b) => ({ weekLabel: b.weekLabel, count: b.count })),
    digest,
    shipped: (links ?? []).map((l: Record<string, unknown>) => {
      const mapped = mapFixLinkRow(l);
      return {
        id: mapped?.id ?? String(l.id ?? ""),
        ticketId: mapped?.ticketId ?? "",
        ticketNumber: numbers.get(mapped?.ticketId ?? "") ?? null,
        kind: mapped?.kind ?? "doc",
        url: mapped?.url ?? "",
        note: mapped?.note ?? null,
      };
    }),
  };
}
