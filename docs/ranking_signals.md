# Ranking signals (Phase A)

**Version:** 1.1 — adds hybrid **RRF** note when `ai_search_quality_v2` is on. Bump version when weights or tiers change.

## 1. Hard filters (eligibility)

Must all pass before any soft score:

- `deleted_at IS NULL`
- `workflow_status = 'approved'`
- `visibility = 'public'`
- Directory RPC predicates match public RLS

Optional product rule (if adopted): at least one **approved** **card** image.

## 2. Soft boosts (positive)

| Signal | Source (examples) |
|--------|-------------------|
| Location match | Query/filter city matches `residence_city_id` or legacy `location_id` |
| Availability / suitability | `field_values` + definitions for availability windows |
| Profile completeness | `profile_completeness_score` |
| Media richness | Count of approved card/gallery variants |
| Recency | `updated_at` or `listing_started_at` |
| Manual | `is_featured`, `featured_level`, `featured_position`, `manual_rank_override` |

## 3. Soft penalties (negative)

| Signal | Example |
|--------|---------|
| Low completeness | Below threshold |
| Sparse media | No approved card |
| Sparse document | `ai_search_document` length below token threshold (when AI on) |

## 4. Deterministic tie-break (equal final score)

Order (first wins):

1. `featured_position` (lower = higher priority) / manual featured slot
2. `profile_completeness_score` DESC
3. `is_featured` DESC, `featured_level` DESC
4. `created_at` DESC
5. `talent_id` ASC

## 5. Human-over-AI precedence

1. Manual featured / curated slots  
2. `manual_rank_override` (if set)  
3. AI re-rank (when enabled)  
4. Base vector or classic order  

## 6. Implementation mapping

Phase 10 implements **only** signals listed here; new signals require a doc bump and decision-log entry.

## 7. Hybrid merge (Chunk 1, `ai_search_quality_v2`)

When **quality v2** is enabled, the first page may use **RRF (reciprocal rank fusion)** to combine classic directory ordering with vector neighbor ranks before optional `applyHybridRerank`. Baseline (`ai_search_quality_v2` off) keeps **vector reorder** of classic rows only. See `web/src/lib/ai/hybrid-merge.ts` and [search-modes.md](search-modes.md).
