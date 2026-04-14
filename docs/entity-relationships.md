# Entity relationships (Phase 8.7)

## Graph (reasoning / explanations)

- `talent_profile` **belongs_to** `location` (residence / filter semantics per schema).  
- `talent_profile` **has_many** `taxonomy_terms` via `talent_profile_taxonomy`.  
- `talent_profile` **has_many** `media_assets`.  
- `inquiry` **has_many** `talent_profiles` via `inquiry_talent`.  
- `inquiry` **belongs_to** client/contact context (see commercial schema).  
- `page` / `post` **may_feature** talents or posts (future CMS).  

Update on migration changes; log in `decision-log.md`.
