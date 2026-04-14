import type { DocsTableColumn } from "@/components/docs/docs-table";

export const AI_FEATURES_COLUMNS: DocsTableColumn[] = [
  { key: "category", label: "Category", sortable: true },
  { key: "feature", label: "Feature", sortable: true },
  { key: "whatItDoes", label: "What It Does", sortable: true },
  { key: "whoUsesIt", label: "Who Uses It", sortable: true },
  { key: "businessValue", label: "Business Value", sortable: true },
  { key: "status", label: "Status", sortable: true },
];

export const AI_FEATURES_ROWS: Record<string, string>[] = [
  {
    category: "Search",
    feature: "Semantic directory search",
    whatItDoes: "Embeds queries and talent profiles to surface relevant matches beyond keyword overlap.",
    whoUsesIt: "Guests, clients, staff",
    businessValue: "Higher match quality and faster discovery in large rosters.",
    status: "Core",
  },
  {
    category: "Search",
    feature: "Hybrid merge & quality v2",
    whatItDoes: "Combines lexical and vector signals with optional RRF-style fusion for ranking stability.",
    whoUsesIt: "Guests, staff",
    businessValue: "More consistent top results when vocabulary varies.",
    status: "Flagged",
  },
  {
    category: "Ranking",
    feature: "LLM rerank",
    whatItDoes: "Re-orders a short list using the configured chat provider for nuanced preference fit.",
    whoUsesIt: "Guests (results), staff (preview)",
    businessValue: "Improves perceived relevance on complex briefs.",
    status: "Flagged",
  },
  {
    category: "Transparency",
    feature: "Match explanations",
    whatItDoes: "Surfaces short rationale tokens for why a profile ranked well.",
    whoUsesIt: "Guests, staff",
    businessValue: "Builds trust and reduces opaque “black box” search.",
    status: "Flagged",
  },
  {
    category: "Refinement",
    feature: "Query refine",
    whatItDoes: "Suggests tightened or expanded searches based on session context.",
    whoUsesIt: "Guests",
    businessValue: "Guides visitors who are unsure how to phrase a brief.",
    status: "Flagged",
  },
  {
    category: "Operations",
    feature: "Inquiry draft assistant",
    whatItDoes: "Drafts first-pass inquiry copy from structured context for staff review.",
    whoUsesIt: "Staff",
    businessValue: "Speeds response time while keeping humans in the loop.",
    status: "Flagged",
  },
  {
    category: "Platform",
    feature: "Provider routing",
    whatItDoes: "Selects OpenAI or Anthropic for chat workloads; embeddings stay on the embedding stack.",
    whoUsesIt: "Staff (configuration)",
    businessValue: "Operational flexibility and provider redundancy.",
    status: "Configuration",
  },
];

export const AI_FLAG_DOC_ROWS: Array<{ key: string; purpose: string; audience: string }> = [
  {
    key: "ai_search_enabled",
    purpose: "Master switch for AI-augmented search experiences.",
    audience: "Guests",
  },
  {
    key: "ai_rerank_enabled",
    purpose: "Turns on LLM reranking for eligible result sets.",
    audience: "Guests",
  },
  {
    key: "ai_explanations_enabled",
    purpose: "Shows short explanations on eligible results.",
    audience: "Guests",
  },
  {
    key: "ai_refine_enabled",
    purpose: "Enables refine suggestions in supported search UIs.",
    audience: "Guests",
  },
  {
    key: "ai_draft_enabled",
    purpose: "Allows inquiry draft generation in admin workflows.",
    audience: "Staff",
  },
  {
    key: "ai_search_quality_v2",
    purpose: "Stronger hybrid merge path (RRF + hybrid cursor continuation).",
    audience: "Guests",
  },
  {
    key: "ai_refine_v2",
    purpose: "Richer refine prompts and suggestion depth where implemented.",
    audience: "Guests",
  },
  {
    key: "ai_explanations_v2",
    purpose: "Richer explanation content where implemented.",
    audience: "Guests",
  },
  {
    key: "ai_provider",
    purpose: "Chat provider selection (OpenAI vs Anthropic) for NLU/chat workloads.",
    audience: "Staff",
  },
];
