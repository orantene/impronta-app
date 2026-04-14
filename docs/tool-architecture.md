# Tool architecture (Phase 8.7)

## Categories

- **Read:** `search_talent`, `get_profile`, `get_taxonomy_terms`, …  
- **Suggestion:** `suggest_tags`, `suggest_refinements`, …  
- **Draft:** `draft_inquiry`, `draft_page`, … (always editable)  
- **Write (gated):** Level 3+ with confirm + audit

## Stable IDs

Use `talent_profile_id`, `inquiry_id`, `taxonomy_term_id`, etc. — not slug/title as primary keys in contracts. See `entity-registry.md`.

## MCP-style future

Admin-only orchestration; registry in code + docs until DB table lands.
