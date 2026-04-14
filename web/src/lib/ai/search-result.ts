import type { DirectoryCardDTO } from "@/lib/directory/types";

/** Aligns with `docs/search-result-dto.md`. */
export type SearchExplanationItem = {
  code: string;
  templateParams?: Record<string, string>;
  confidence?: "high" | "medium" | "low";
};

export type SearchResult = {
  talent_id: string;
  score: number | null;
  ranking_signals: Record<string, unknown> | null;
  explanation: SearchExplanationItem[];
  confidence: string | null;
  highlight: string | null;
  card: DirectoryCardDTO;
};

export function directoryCardToSearchResult(
  card: DirectoryCardDTO,
  partial?: Partial<
    Pick<
      SearchResult,
      "score" | "ranking_signals" | "explanation" | "confidence" | "highlight"
    >
  >,
): SearchResult {
  return {
    talent_id: card.id,
    score: partial?.score ?? null,
    ranking_signals: partial?.ranking_signals ?? null,
    explanation: partial?.explanation ?? [],
    confidence: partial?.confidence ?? null,
    highlight: partial?.highlight ?? null,
    card,
  };
}
