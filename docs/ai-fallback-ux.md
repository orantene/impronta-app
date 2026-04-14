# AI fallback UX (Phase 8.7)

Pairs with server fallback + `search_queries` / future `ai_fallback_events`.

## Principles

- Directory, profile, inquiry **fully usable** with all AI flags off.  
- AI failures **do not** white-screen the page; degrade **inside** `AIErrorBoundary`.  
- **~150ms** client: skeleton or placeholder in **AI region only** (see plan §7).  
- **~800ms** server: fall back to classic path; same DTO; log `timeout` / reason.

## Degradation levels (examples)

| Level | User sees |
|-------|-----------|
| `classic_only` | Standard directory/results |
| `no_explanations` | Results without “why match” |
| `no_refine` | No suggestion strip |
| `manual_inquiry` | Form without draft |

## Directory search

- **Classic results** stay visible whenever the vector stage is skipped (`vector_active: false`); do not replace a populated classic page with an empty state solely because embeddings failed.
- **Stale hybrid cursors:** if filters or query change so the cursor context stamp no longer matches, listing resets from the first page for the new params (no silent wrong page-2 data).
