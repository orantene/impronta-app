# AI foundations (Phase 8.7)

**Implementation status:** **Docs + shell layer complete** — contracts and `/admin/ai-workspace` scaffolding match the roadmap for this slice. Customer attach points, Site Settings → AI, embedded admin panels, and optional agent-log tables remain **follow-up** (see **`docs/acceptance-checklist.md`** Phase 8.7).

## Scope

Defined surfaces, contracts, flags, and shells **without** production LLM/vector execution in this phase alone. Vector/embeddings ship in Phase 9+ per roadmap.

## Non-goals

Model training, public MCP, autonomous writes without review.

## Launch tiers (governance)

1. **Tier 1** — Public discovery AI (search, rerank, explain, refine).  
2. **Tier 2** — Inquiry drafting.  
3. **Tier 3** — Admin copilots (enrichment, triage, QA).  
4. **Tier 4** — Content/page agents.  
5. **Tier 5** — Tool orchestration (admin-only).

## Surface lifecycle

Per `attach_point_key`: `hidden` | `placeholder` | `beta` | `active` | `deprecated`. Documented in `ai-surface-contracts.md`.

## Links

- `ai-surface-contracts.md` — canonical surface map.  
- `ai-settings-model.md` — flags + capability keys.  
- `search-modes.md`, `ai-fallback-ux.md`, `ai-refresh-strategy.md`, `ai-confidence-model.md`.
