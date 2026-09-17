"use server";

/**
 * Support Guide P0 — server actions the drawer's Guide tab calls directly.
 *
 * Kept separate from `SupportContract` (support-contract.ts /
 * load-support-contract.ts) on purpose: the Guide is read-only, non-tenant
 * content shared across all three surfaces, so it doesn't need the
 * per-mount contract binding tickets and messages use. Next lets a client
 * component import a "use server" export directly.
 */
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { getGuideArticle, listGuideTopics } from "./guide-corpus";
import type { GuideArticle, GuideLocale, GuideTopicSummary } from "./types";

export async function listGuideTopicsAction(locale: GuideLocale): Promise<GuideTopicSummary[]> {
  return listGuideTopics(locale);
}

export async function getGuideArticleAction(nodeId: string, locale: GuideLocale): Promise<GuideArticle | null> {
  return getGuideArticle(nodeId, locale);
}

/** Usage signals (votes, opens, searches). Goes through a SECURITY DEFINER RPC — there is no UPDATE policy on guide_articles. Fail-open: a lost signal is not worth an error in the drawer. */
export async function guideSignalAction(
  nodeId: string,
  locale: GuideLocale,
  signal: "helpful_yes" | "helpful_no" | "open" | "search",
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("guide_article_signal", { p_node_id: nodeId, p_locale: locale, p_signal: signal });
  if (error) logServerError("guide.signal", error);
}

/** A search that matched nothing — the gap radar's input. */
export async function guideSearchMissAction(locale: GuideLocale, query: string): Promise<void> {
  const q = query.trim();
  if (q.length < 2) return;
  const supabase = await createClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("guide_search_miss", { p_locale: locale, p_query: q.slice(0, 120) });
  if (error) logServerError("guide.searchMiss", error);
}
