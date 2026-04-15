import { formatMatchExplanationsForUi } from "@/lib/ai/match-explain";
import type { SearchResult } from "@/lib/ai/search-result";
import type { DirectoryAiCardOverlay } from "@/lib/directory/types";

export function buildDirectoryAiOverlayByTalentId(
  results: SearchResult[],
  locale: string,
): Record<string, DirectoryAiCardOverlay> | undefined {
  const out: Record<string, DirectoryAiCardOverlay> = {};
  for (const r of results) {
    const lines = formatMatchExplanationsForUi(r.explanation, locale);
    const note = r.confidence?.trim() || null;
    const score =
      r.score != null && Number.isFinite(r.score) ? r.score : null;
    if (lines.length || note || score != null) {
      out[r.talent_id] = {
        explanationLines: lines,
        confidenceNote: note,
        vectorSimilarity: score,
      };
    }
  }
  return Object.keys(out).length ? out : undefined;
}
