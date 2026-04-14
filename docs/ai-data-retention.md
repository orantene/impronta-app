# AI data retention and access

Operational policy for search logs, embeddings, and LLM-assisted flows. Refine when product or legal requirements change; record substantive changes in [decision-log.md](decision-log.md).

## Retention (defaults)

- **`search_queries`:** Retain for analytics until a scheduled purge or archival job is defined. Until then, treat as **indefinite** at the database layer; operators may export and truncate manually after backup.
- **Structured server logs** (`improntaLog` / JSON events for AI search, fallback, vector RPC): Follow hosting/log sink retention (e.g. 7–30 days typical). **No guarantee** of long-term retention in process stdout.
- **Embeddings (`talent_embeddings`):** Retained while the talent profile exists; refresh governed by [ai-refresh-strategy.md](ai-refresh-strategy.md) and invalidation triggers.

## Redaction

- **Never store** API keys, service-role secrets, or session tokens in `search_queries` or public settings.
- **Queries:** Stored as normalized + raw-trimmed forms for analytics; avoid logging full request bodies with unrelated PII.
- **IPs / user ids:** If added to analytics, prefer hashing or truncation; document any new field in the decision log.

## Inquiry drafts

- **LLM draft responses** are **not persisted** by the inquiry-draft API; the client inserts text into the brief field only when the user accepts it. Do not add DB persistence of draft text without an explicit product decision and TTL.

## Prompts and completions

- **Default:** Do not store full OpenAI prompt/completion bodies in Postgres. **Sizes and outcome** (success, latency, token counts if available) are acceptable for cost observability.
- **Incidents:** If excerpts are needed for debugging, cap length, restrict to staff-only storage, and purge after resolution.

## Access

- **Staff roles** (`super_admin`, `agency_staff`): May view admin AI surfaces (match preview, AI Console, Site Settings flags), `search_queries` (where exposed), and activity logs.
- **Vendors:** No third-party sharing of raw queries or drafts beyond the model provider as required to perform the API call.

## Metrics hygiene

- **Aggregate metrics** in settings or snapshots should be bounded; roll up or clear old keys when dashboards grow without bound (document each new aggregate in [ai-settings-model.md](ai-settings-model.md) or the decision log).
