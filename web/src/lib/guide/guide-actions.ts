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
import { getGuideArticle, listGuideTopics } from "./guide-corpus";
import type { GuideArticle, GuideLocale, GuideTopicSummary } from "./types";

export async function listGuideTopicsAction(locale: GuideLocale): Promise<GuideTopicSummary[]> {
  return listGuideTopics(locale);
}

export async function getGuideArticleAction(nodeId: string, locale: GuideLocale): Promise<GuideArticle | null> {
  return getGuideArticle(nodeId, locale);
}
