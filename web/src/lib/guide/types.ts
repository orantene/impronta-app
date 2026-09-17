/**
 * Support Guide P0 — shared types for the content model.
 *
 * See docs/plans/support-guide-knowledge-plan-2026-09-17.md for the full
 * design. Two tables back this (migration
 * 20261231246000_guide_articles.sql): `guide_nodes` (the map) and
 * `guide_articles` (the content, one row per node per locale).
 */

export type GuideLocale = "en" | "es";

export type GuideNodeKind = "area" | "page" | "section" | "control";

export type GuideArticleStatus = "draft" | "ai-checked" | "published" | "short-version";

export type GuideNode = {
  id: string;
  kind: GuideNodeKind;
  parentId: string | null;
  labelKey: string | null;
  sinceRelease: string | null;
  sourceHash: string | null;
};

/** The fixed 8-section schema every article follows — see plan §1. */
export type GuideArticleSections = {
  /** 1. In one sentence. */
  oneSentence: string;
  /** 2. What it is for. */
  whatItIsFor: string;
  /** 3. How to use it — each step may name a route to deep-link to. */
  steps: { text: string; route?: string }[];
  /** 4. Example — one concrete case. */
  example: string;
  /** 5. Who sees what. Omitted when visibility doesn't vary here. */
  whoSeesWhat?: string;
  /** 6. Careful — the one or two mistakes people make. */
  careful?: string;
  /** 7. Inside this — rendered from child nodes at read time, not stored. */
  /** 8. Related — 2-3 node ids to jump to. */
  related: string[];
};

export type GuideArticle = {
  nodeId: string;
  /** Human title for the header (registry shortTitle or a humanized id). */
  title: string;
  locale: GuideLocale;
  status: GuideArticleStatus;
  sections: GuideArticleSections;
  critic: {
    unsupportedCount: number | null;
    contradictionCount: number | null;
    structuralPass: boolean | null;
    notes: string | null;
    ranAt: string | null;
  };
  audio: {
    url: string | null;
    voice: string | null;
    textHash: string | null;
    durationSec: number | null;
  };
  release: string | null;
  helpfulYes: number;
  helpfulNo: number;
  updatedAt: string | null;
};

/** What the Guide tab shows for one topic in a list (search results, "Start here"). */
export type GuideTopicSummary = {
  nodeId: string;
  kind: GuideNodeKind;
  title: string;
  oneSentence: string;
  category: string;
  isShortVersion: boolean;
};
