# Entity registry (Phase 8.7)

| `entity_key` | Label | Primary routes | RLS summary | AI searchable | AI explainable | AI writable (max) | Delete |
|--------------|-------|----------------|-------------|---------------|----------------|-------------------|--------|
| `talent_profile` | Talent | `/t/[code]`, directory | Public approved | yes | yes | 2 draft suggest | soft |
| `inquiry` | Inquiry | admin | staff | partial | partial | 2 | soft/archive |
| `taxonomy_term` | Taxonomy | admin | staff | yes | yes | 3+ gated | archive |
| `location` | Location | directory | public read | yes | yes | 3 | — |
| `media_asset` | Media | profile | RLS | partial | partial | 3 | soft |
| `page` | CMS page | TBD | public published | future | future | 2 | archive |
| `post` | CMS post | TBD | public published | future | future | 2 | archive |
| `shortlist` | Shortlist | app | user | yes | yes | 2 | user |
| `booking` | Booking | admin | staff | partial | partial | 3 | soft |

Extend rows before new tools reference entities.
