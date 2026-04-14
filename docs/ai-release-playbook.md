# AI release playbook

Use for deploys that touch hybrid search, refine, explanations, inquiry draft, or AI flags.

## Pre-release

- [ ] `npm run typecheck` and `npm run build` green (or CI equivalent).
- [ ] DB migrations applied through **`20260422120000_search_queries_fallback_reason_rollup.sql`** (or newer) so staff AI Console fallback reason tallies use the rollup RPC where available.
- [ ] Eval harness (`npm run eval:search` from `web/`) run or waiver noted in [decision-log.md](decision-log.md); optional `--write-summary` + `--compare-baseline` for regression gates ([search-eval-set.md](search-eval-set.md)).
- [ ] Feature flags: **`ai_search_quality_v2`**, **`ai_refine_v2`**, **`ai_explanations_v2`** default **off** in production unless explicitly rolling out.
- [ ] Env: `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` present where hybrid/draft is enabled.
- [ ] Rate limits unchanged or intentionally updated ([middleware](../web/src/middleware.ts) AI routes).

## Admin-only validation

- [ ] In a **staff session**, open **Admin → AI Console** and **Match preview**; confirm `vector_active`, merge strategy, and fallback reasons match expectations.
- [ ] Toggle v2 flags in **Admin → Settings** only after baseline behavior is verified.

## First 30–60 minutes

Watch:

- Fallback rate (logs + `search_queries.fallback_triggered` / `flag_snapshot`).
- `vector_active` share.
- Search latency (p95) and error rate.
- 429 rate-limit responses on `/api/ai/search`, refine, draft.
- Embedding cache / OpenAI usage proxy (if metrics available).

## Rollback matrix

| Symptom | Action |
|--------|--------|
| Search relevance regression | Turn off **`ai_search_quality_v2`**; redeploy prior build if code regression. |
| Hybrid unsafe or unstable | Disable **`ai_search_enabled`** (classic only). |
| Refine noise | Disable **`ai_refine_v2`** or **`ai_refine_enabled`**. |
| Explanations wrong or overclaiming | Disable **`ai_explanations_v2`** or **`ai_explanations_enabled`**. |
| Draft quality | Disable **`ai_draft_enabled`**; tighten rate limits. |

Always preserve **classic directory results** when AI is off; never ship an empty directory solely because the vector stage failed.

## Documentation

- Log notable releases and flag changes in [decision-log.md](decision-log.md).
