# AI settings model (Phase 8.7 + Phase D)

## Global flags (`public.settings`)

| Key | Meaning |
|-----|---------|
| `ai_search_enabled` | Vector/hybrid path allowed |
| `ai_rerank_enabled` | Re-rank stage |
| `ai_explanations_enabled` | Explanation payload |
| `ai_refine_enabled` | Refine suggestions strip |
| `ai_draft_enabled` | Inquiry draft |

Defaults **off** in production seeds; **Admin → Settings** toggles exist.

## Capability flags (fine-grained, future)

Examples: `ai_can_search`, `ai_can_explain`, `ai_can_refine`, `ai_can_draft`, `ai_can_enrich`, `ai_can_compare`, `ai_can_suggest`. Map to agents in `agent-registry.md`; avoid duplicate namespaces vs the five keys above.

## Site Settings → AI

When Site Settings System section ships (8.6), nest **AI policy** here; merge keys with this doc as single source of truth.
