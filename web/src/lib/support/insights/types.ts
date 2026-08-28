export type InsightSentiment = "positive" | "neutral" | "negative";
export type InsightResolutionKind =
  | "ai_self_serve"
  | "human_resolved"
  | "no_response"
  | "unresolved";
export type FixLinkKind = "commit" | "pr" | "release" | "doc";

export type SupportInsightRow = {
  id: string;
  ticketId: string;
  tenantId: string | null;
  summary: string;
  rootCause: string | null;
  productArea: string | null;
  sentiment: InsightSentiment | null;
  resolutionKind: InsightResolutionKind | null;
  isFeatureRequest: boolean;
  isBugReport: boolean;
  tags: string[];
  model: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
};

export type SupportFixLinkRow = {
  id: string;
  ticketId: string;
  kind: FixLinkKind;
  url: string;
  note: string | null;
  createdAt: string;
};

export type WeeklyDigestSnapshot = {
  weekStart: string;
  summary: string;
  suggestedFixes: string[];
  generatedAt: string;
};

export type HqInsightsDashboard = {
  openNow: number;
  needsYou: number;
  medianFirstReplyMs: number | null;
  resolvedThisWeek: number;
  avgRating: number | null;
  aiResolvedShare: number | null;
  aiResolvedCount: number;
  friction: Array<{ area: string; count: number }>;
  weeklyVolume: Array<{ weekLabel: string; count: number }>;
  digest: WeeklyDigestSnapshot | null;
  shipped: Array<{
    id: string;
    ticketId: string;
    ticketNumber: number | null;
    kind: FixLinkKind;
    url: string;
    note: string | null;
  }>;
};

function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function mapInsightRow(raw: unknown): SupportInsightRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    ticketId: String(row.ticket_id ?? ""),
    tenantId: str(row, "tenant_id"),
    summary: String(row.summary ?? ""),
    rootCause: str(row, "root_cause"),
    productArea: str(row, "product_area"),
    sentiment: (str(row, "sentiment") as InsightSentiment | null) ?? null,
    resolutionKind: (str(row, "resolution_kind") as InsightResolutionKind | null) ?? null,
    isFeatureRequest: row.is_feature_request === true,
    isBugReport: row.is_bug_report === true,
    tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [],
    model: str(row, "model"),
    confirmedAt: str(row, "confirmed_at"),
    confirmedBy: str(row, "confirmed_by"),
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapFixLinkRow(raw: unknown): SupportFixLinkRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    ticketId: String(row.ticket_id ?? ""),
    kind: (str(row, "kind") as FixLinkKind) ?? "doc",
    url: String(row.url ?? ""),
    note: str(row, "note"),
    createdAt: String(row.created_at ?? ""),
  };
}
