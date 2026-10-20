/**
 * TUL-1395: which published changelog entries a signed-in viewer sees in the
 * "What's new" card. Pure selection (role, plan, language, tier, dismissal) plus
 * one anon read of public.changelog_entries (written by the Notion sync, #4154).
 *
 * Only ever used on the private talent and business dashboards. Public talent and
 * agency sites must never import this module (a static test pins it).
 */
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";

export type WhatsNewRow = {
  notion_page_id: string;
  status: string;
  tier: number | null;
  badge: string | null;
  title_en: string;
  title_es: string;
  summary_en: string;
  summary_es: string;
  audience: string[] | null;
  plans: string[] | null;
  help_url: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  release_date: string | null;
};

export type WhatsNewViewer = {
  /** Audience labels this dashboard counts as. Talent: ["Talent"]. Business: ["Business","Agency"]. */
  audiences: readonly string[];
  plan: "free" | "paid";
  locale: string | null | undefined;
};

export type WhatsNewItem = {
  id: string;
  badge: string | null;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  helpUrl: string | null;
  /** ms since epoch; the dismissal cookie stores the newest one the viewer closed. */
  publishedMs: number;
};

const norm = (s: string) => s.trim().toLowerCase();

export function audienceAllows(rowAudience: readonly string[] | null, viewer: readonly string[]): boolean {
  const a = (rowAudience ?? []).map(norm).filter(Boolean);
  if (a.length === 0 || a.includes("all") || a.includes("everyone")) return true;
  const mine = viewer.map(norm);
  return a.some((x) => mine.includes(x));
}

/** "Paid" entries are for paid plans only; "Free" for free only; empty or "All" for both. */
export function planAllows(rowPlans: readonly string[] | null, plan: "free" | "paid"): boolean {
  const p = (rowPlans ?? []).map(norm).filter(Boolean);
  if (p.length === 0 || p.includes("all")) return true;
  return p.includes(plan);
}

export function selectWhatsNew(
  rows: readonly WhatsNewRow[],
  viewer: WhatsNewViewer,
  dismissedUpToMs: number,
  limit = 3,
): WhatsNewItem[] {
  const es = (viewer.locale ?? "").toLowerCase().startsWith("es");
  const items: WhatsNewItem[] = [];
  for (const r of rows) {
    if (r.status !== "published") continue;
    if ((r.tier ?? 0) < 2) continue;
    if (!audienceAllows(r.audience, viewer.audiences)) continue;
    if (!planAllows(r.plans, viewer.plan)) continue;
    const ms = Date.parse(r.published_at ?? r.release_date ?? "");
    if (!Number.isFinite(ms) || ms <= dismissedUpToMs) continue;
    const title = (es ? r.title_es : r.title_en).trim() || (es ? r.title_en : r.title_es).trim();
    if (!title) continue;
    const summary = (es ? r.summary_es : r.summary_en).trim() || (es ? r.summary_en : r.summary_es).trim();
    items.push({
      id: r.notion_page_id,
      badge: r.badge,
      title,
      summary,
      coverImageUrl: r.cover_image_url && /^https:\/\//i.test(r.cover_image_url) ? r.cover_image_url : null,
      helpUrl: r.help_url && /^https?:\/\//i.test(r.help_url) ? r.help_url : null,
      publishedMs: ms,
    });
  }
  return items.sort((a, b) => b.publishedMs - a.publishedMs).slice(0, limit);
}

/** One cookie per signed-in user, so two people on one browser do not share a dismissal. */
export function dismissCookieName(userId: string): string {
  return `tulala_wn_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
}

export function parseDismissedMs(raw: string | undefined | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function loadWhatsNewRows(): Promise<WhatsNewRow[]> {
  try {
    const db = createPublicSupabaseClient();
    if (!db) return [];
    const { data, error } = await db
      .from("changelog_entries")
      .select("notion_page_id,status,tier,badge,title_en,title_es,summary_en,summary_es,audience,plans,help_url,cover_image_url,published_at,release_date")
      .eq("status", "published")
      .gte("tier", 2)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(20);
    if (error) {
      logServerError("changelog.whats-new", error);
      return [];
    }
    return (data ?? []) as WhatsNewRow[];
  } catch (err) {
    logServerError("changelog.whats-new", err);
    return [];
  }
}
