# Agent logs (Phase 8.7)

## Purpose

Trace agent runs for tuning, compliance, and fallback analysis.

## Suggested fields

- `agent_id`, `surface_key`, `attach_point_key`  
- Input **summary** (redact PII per policy)  
- Tool calls (names + status)  
- Output type, status, error  
- Actor (`user_id` / role)  
- `created_at`  
- Optional: `flag_snapshot`, `fallback_triggered`, `fallback_reason`, `degradation_level`

## Relationship to `search_queries`

Directory/classic and AI searches log to `search_queries` with `search_mode`, `ai_enabled`, `rerank_enabled`, `explanation_enabled`, `flag_snapshot` (see migration + `log-search-query.ts`).

## Redaction & retention

Document in decision-log when table ships; default conservative redaction for public-facing errors.
