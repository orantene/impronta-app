# AI refresh strategy (Phase 8.7 + 4.5 + 9)

## When to rebuild `ai_search_document`

- Profile scalars affecting public/AI-visible fields  
- `field_values` where `ai_visible`  
- Taxonomy on profile (primary type, tags, etc.)  
- Location change  
- Approved media that affects card/search narrative (product-defined)  
- `workflow_status` / `visibility` transitions  
- Locale change on included copy fields  

## Embeddings

- Input = **only** canonical `ai_search_document` (builder + `document_hash`).  
- Store `embedding_model`, `embedding_version` on `talent_embeddings`.  
- Debounce/batch heavy regen; optional queue — document in decision-log when worker ships.

## Invalidation

Use `document_hash` skip when unchanged.

## DB triggers (Phase 9)

Migration [`20260416150000_embedding_invalidation_triggers.sql`](../supabase/migrations/20260416150000_embedding_invalidation_triggers.sql) **deletes** the row in `talent_embeddings` for a profile when:

- `talent_profiles` changes: `ai_search_document`, `workflow_status`, `visibility`, or `deleted_at`
- `talent_profile_taxonomy` changes (insert / update / delete)

Re-upsert via `npm run embed-talents` (cron or manual). Profile rows that never had an embedding are unchanged.
