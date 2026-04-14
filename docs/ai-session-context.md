# AI session context (Phase 8.7)

## Intent catalog

Examples: `search`, `compare`, `shortlist`, `inquire`, `enrich_profile`, `generate_content`, `analyze_logs`.

## Context shape (conceptual)

- `role` — guest | client | talent | staff | super_admin  
- `surface_key` / `route_key`  
- `locale`  
- Active filters (canonical JSON)  
- Selected `talent_profile_id[]`, `inquiry_id`, shortlist ids  
- Optional: brief fields for campaigns

Serialize for analytics; avoid storing raw PII beyond policy.
