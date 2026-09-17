/**
 * Support Guide P0 — corpus reader.
 *
 * Server-safe (no "use client"), same posture as
 * `@/lib/support/help-corpus.ts`. Reads `guide_articles`/`guide_nodes`
 * (migration 20261231246000_guide_articles.sql) and falls back to the
 * existing `DRAWER_HELP` registry (plus ./adhoc-nodes.ts, the support
 * drawer's own controls) for any node the generation pipeline
 * (scripts/guide/generate-guide-articles.mjs) hasn't reached yet — so the
 * Guide tab always shows *something*, never a blank topic, from day one of
 * P0.
 *
 * `guide_articles.body_md` holds the fixed 8-section schema as a JSON
 * string (see `GuideArticleSections` in ./types), not literal markdown —
 * the column name matches the migration/plan wording, the payload is
 * structured so steps can carry a route and "Related" can render as links.
 */
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { DRAWER_HELP as REGISTRY } from "@/components/admin/shell/internal/help-registry";
import { ADHOC_GUIDE_NODES } from "./adhoc-nodes";
import type {
  GuideArticle,
  GuideArticleSections,
  GuideArticleStatus,
  GuideLocale,
  GuideNode,
  GuideTopicSummary,
} from "./types";

/** Registry entries plus the support drawer's own ad-hoc nodes — one merged source for both the fallback and the topic list. */
const DRAWER_HELP: Record<string, (typeof REGISTRY)[keyof typeof REGISTRY]> = { ...REGISTRY, ...ADHOC_GUIDE_NODES };

type ArticleRow = {
  node_id: string;
  locale: string;
  status: string;
  body_md: string;
  critic_unsupported_count: number | null;
  critic_contradiction_count: number | null;
  critic_structural_pass: boolean | null;
  critic_notes: string | null;
  critic_ran_at: string | null;
  audio_url: string | null;
  audio_voice: string | null;
  audio_text_hash: string | null;
  audio_duration_sec: number | null;
  release: string | null;
  helpful_yes: number;
  helpful_no: number;
  updated_at: string | null;
};

function parseSections(bodyMd: string): GuideArticleSections {
  try {
    const parsed = JSON.parse(bodyMd);
    return {
      oneSentence: String(parsed.oneSentence ?? ""),
      whatItIsFor: String(parsed.whatItIsFor ?? ""),
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      example: String(parsed.example ?? ""),
      whoSeesWhat: parsed.whoSeesWhat ? String(parsed.whoSeesWhat) : undefined,
      careful: parsed.careful ? String(parsed.careful) : undefined,
      related: Array.isArray(parsed.related) ? parsed.related : [],
    };
  } catch {
    return { oneSentence: "", whatItIsFor: "", steps: [], example: "", related: [] };
  }
}

function rowToArticle(row: ArticleRow): GuideArticle {
  return {
    nodeId: row.node_id,
    locale: row.locale as GuideLocale,
    status: row.status as GuideArticleStatus,
    sections: parseSections(row.body_md),
    critic: {
      unsupportedCount: row.critic_unsupported_count,
      contradictionCount: row.critic_contradiction_count,
      structuralPass: row.critic_structural_pass,
      notes: row.critic_notes,
      ranAt: row.critic_ran_at,
    },
    audio: {
      url: row.audio_url,
      voice: row.audio_voice,
      textHash: row.audio_text_hash,
      durationSec: row.audio_duration_sec,
    },
    release: row.release,
    helpfulYes: row.helpful_yes,
    helpfulNo: row.helpful_no,
    updatedAt: row.updated_at,
  };
}

/**
 * Registry-derived "short version" for a DrawerId that has no DB row yet.
 * Only sections 1, 2 and 8 are populated (the ones already true from code) —
 * the plan's own definition of a short-version article, so a node without a
 * generated article still reads as accurate rather than empty.
 */
function registryFallback(nodeId: string, locale: GuideLocale): GuideArticle | null {
  const entry = DRAWER_HELP[nodeId as keyof typeof DRAWER_HELP];
  if (!entry) return null;
  const oneSentence = entry.purpose;
  return {
    nodeId,
    locale,
    status: "short-version",
    sections: {
      oneSentence,
      whatItIsFor: entry.youCanHere.join(" "),
      steps: entry.youCanHere.map((text) => ({ text })),
      example: "",
      related: entry.relatedDrawers ?? [],
    },
    critic: { unsupportedCount: null, contradictionCount: null, structuralPass: null, notes: null, ranAt: null },
    audio: { url: null, voice: null, textHash: null, durationSec: null },
    release: null,
    helpfulYes: 0,
    helpfulNo: 0,
    updatedAt: null,
  };
}

/** All registry ids not yet backed by a real generated node — the P0 "coming soon" list for Helper mode / coverage. */
export function registryOnlyIds(): string[] {
  return Object.keys(DRAWER_HELP);
}

export async function getGuideArticle(nodeId: string, locale: GuideLocale): Promise<GuideArticle | null> {
  const supabase = await createClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("guide_articles")
      .select(
        "node_id, locale, status, body_md, critic_unsupported_count, critic_contradiction_count, critic_structural_pass, critic_notes, critic_ran_at, audio_url, audio_voice, audio_text_hash, audio_duration_sec, release, helpful_yes, helpful_no, updated_at",
      )
      .eq("node_id", nodeId)
      .eq("locale", locale)
      .maybeSingle();
    // A denied policy or a missing table arrives as data:null, not a throw.
    // The registry fallback below is the right user-facing behavior either
    // way, but the failure must be visible or a broken read looks like
    // "not generated yet" forever.
    if (error) logServerError("guide.article.read", error);
    if (data) return rowToArticle(data as ArticleRow);
  }
  return registryFallback(nodeId, locale);
}

/** "Start here" + browse-by-area topic list for the Guide tab's landing view. */
export async function listGuideTopics(locale: GuideLocale): Promise<GuideTopicSummary[]> {
  const supabase = await createClient();
  const generated = new Map<string, ArticleRow>();
  if (supabase) {
    const { data, error } = await supabase
      .from("guide_articles")
      .select("node_id, locale, status, body_md")
      .eq("locale", locale)
      .neq("status", "draft");
    if (error) logServerError("guide.topics.read", error);
    for (const row of (data ?? []) as ArticleRow[]) {
      generated.set(row.node_id, row);
    }
  }

  const out: GuideTopicSummary[] = [];
  for (const [nodeId, entry] of Object.entries(DRAWER_HELP)) {
    if (!entry) continue;
    const row = generated.get(nodeId);
    const oneSentence = row ? parseSections(row.body_md).oneSentence : entry.purpose;
    out.push({
      nodeId,
      kind: "page",
      title: entry.shortTitle ?? nodeId,
      oneSentence,
      category: entry.category,
      isShortVersion: !row || row.status === "short-version",
    });
  }
  return out;
}

export type { GuideNode };
