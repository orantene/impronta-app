/**
 * TUL-1396: published changelog entries as grounding for the support AI.
 *
 * Answers to "what's new?" and "was X fixed?" come from Published entries only
 * (public.changelog_entries, written by the Notion sync in PR #4154). Entries are
 * matched to the asker's language and audience. Nothing here calls the model.
 */
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";
import { tokenize } from "@/lib/support/help-corpus";

export type GroundingChangelogRow = {
  notion_page_id: string;
  status: string;
  title_en: string;
  title_es: string;
  summary_en: string;
  summary_es: string;
  audience: string[] | null;
  categories: string[] | null;
  help_url: string | null;
  published_at: string | null;
  release_date: string | null;
};

export type ChangelogGroundingEntry = {
  slug: string;
  title: string;
  summary: string;
  date: string | null;
  categories: string[];
  helpUrl: string | null;
};

export type ViewerAudience = "Talent" | "Business" | "Agency" | "Client";

/** Support ticket surface to the audience label the Notion Releases entries use. */
export function audienceForSurface(surface: string | null | undefined): ViewerAudience | null {
  if (surface === "talent") return "Talent";
  if (surface === "client") return "Client";
  if (surface === "workspace") return "Business";
  return null;
}

const NEWS_INTENT =
  /\b(what'?s new|whats new|new features?|latest (?:update|release|change)s?|changelog|release notes?|recent (?:update|change)s?|nuevo|nuevos|novedades?|que hay de nuevo|ultimas? (?:actualizacion|novedad|mejora)\w*)\b/i;
const FIX_INTENT =
  /\b(fixed|fix|bug|resolved|still (?:broken|failing)|working again|arreglad\w*|arregl\w*|corregid\w*|ya funciona|sigue (?:fallando|roto))\b/i;

/** Words that only say "was it fixed", so they must not count as topic overlap. */
const INTENT_WORDS = new Set([
  "fixed", "fix", "bug", "bugs", "resolved", "working", "broken", "failing", "still", "new", "update", "updates", "error", "issue",
  "arreglado", "arreglaron", "arreglar", "corregido", "funciona", "fallando", "roto", "nuevo", "nuevos", "error", "problema",
]);

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function asksAboutChanges(question: string): boolean {
  const q = fold(question);
  return NEWS_INTENT.test(q) || FIX_INTENT.test(q);
}

function audienceMatches(rowAudience: string[] | null, viewer: ViewerAudience | null): boolean {
  const a = (rowAudience ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (a.length === 0 || a.includes("all") || a.includes("everyone")) return true;
  if (!viewer) return false;
  return a.includes(viewer.toLowerCase());
}

/**
 * Pick up to `limit` entries. Only status = published rows; audience and language
 * matched (a missing translation falls back to the other language so the answer
 * is not silently empty, and the model is told to answer in the user's language).
 * A "what's new" question gets the newest entries; any other question needs word
 * overlap with the entry, so unrelated chats get no changelog at all.
 */
export function selectChangelogGrounding(
  rows: readonly GroundingChangelogRow[],
  opts: { question: string; locale: string | null | undefined; audience: ViewerAudience | null; limit?: number },
): ChangelogGroundingEntry[] {
  const limit = opts.limit ?? 4;
  const es = (opts.locale ?? "").toLowerCase().startsWith("es");
  const newsy = NEWS_INTENT.test(fold(opts.question));
  const qTokens = new Set(tokenize(opts.question).filter((t) => !INTENT_WORDS.has(t)));

  const candidates = rows
    .filter((r) => r.status === "published")
    .filter((r) => audienceMatches(r.audience, opts.audience))
    .map((r) => {
      const title = (es ? r.title_es : r.title_en).trim() || (es ? r.title_en : r.title_es).trim();
      const summary = (es ? r.summary_es : r.summary_en).trim() || (es ? r.summary_en : r.summary_es).trim();
      return { r, title, summary };
    })
    .filter((c) => c.title !== "");

  const scored = candidates.map((c) => {
    const hay = fold(`${c.title} ${c.summary} ${(c.r.categories ?? []).join(" ")}`);
    let score = 0;
    for (const t of qTokens) if (hay.includes(t)) score += 1;
    return { ...c, score, time: Date.parse(c.r.published_at ?? c.r.release_date ?? "") || 0 };
  });

  const picked = scored
    .filter((c) => (newsy ? true : c.score > 0))
    .sort((a, b) => b.score - a.score || b.time - a.time)
    .slice(0, limit);
  // A news question ranks by recency first.
  if (newsy) picked.sort((a, b) => b.time - a.time);

  return picked.map((c) => ({
    slug: `changelog:${c.r.notion_page_id}`,
    title: c.title,
    summary: c.summary.slice(0, 400),
    date: c.r.published_at ?? c.r.release_date,
    categories: c.r.categories ?? [],
    helpUrl: c.r.help_url,
  }));
}

/** Fail-open: any problem returns no changelog and the answer falls back to the help corpus. */
export async function loadChangelogGroundingRows(): Promise<GroundingChangelogRow[]> {
  try {
    const db = createPublicSupabaseClient();
    if (!db) return [];
    const { data, error } = await db
      .from("changelog_entries")
      .select("notion_page_id,status,title_en,title_es,summary_en,summary_es,audience,categories,help_url,published_at,release_date")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(60);
    if (error) {
      logServerError("changelog.support-grounding", error);
      return [];
    }
    return (data ?? []) as GroundingChangelogRow[];
  } catch (err) {
    logServerError("changelog.support-grounding", err);
    return [];
  }
}

export const CHANGELOG_SYSTEM_RULE =
  "The changelog list holds Published release notes. For what's new or is-this-fixed questions, answer only from it, name the entry title and date, and never say something is fixed or live unless an entry says so. If no entry covers it, say you do not see it in the release notes and offer to get a person.";
