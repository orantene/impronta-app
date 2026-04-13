# Taxonomy QA Matrix

| taxonomy kind | term count | launch minimum | primary field/edit surface | admin management value | filtering/discovery value | demo seed support |
| --- | --- | --- | --- | --- | --- | --- |
| `talent_type` | 28 | 16 | `talent_type` single-select | High; core classification list | High; main directory facet and card context | All 20 demo profiles rely on this |
| `tag` | 31 | 15 | `tags` multi-select | High; fast merchandisable traits | High; secondary discovery refinements | Featured, new-face, nightlife, travel-ready, corporate-friendly, premium coverage |
| `skill` | 31 | 16 | `skills` multi-select | High; profile-edit richness | High; strong matching/filter input | Hosting, acting, runway, social, event, sales, performance cases |
| `industry` | 31 | 15 | `industries` multi-select | Medium-high; industry-fit QA | High; useful future search facet | Hospitality, fashion, nightlife, corporate, tourism, technology, luxury coverage |
| `event_type` | 30 | 15 | `event_types` multi-select | High; booking-fit taxonomy | High; event-driven filtering later | Trade-show, nightlife, shoots, private, VIP, festival, resort and conference cases |
| `fit_label` | 22 | 10 | `fit_labels` multi-select | High; card badge/admin merchandising | High; compact placement heuristics | Spotlight, nightlife, corporate, luxury, hosting, fashion and fitness use cases |
| `language` | 18 | 8 | `languages` multi-select | Medium-high; common QA gap reducer | High; client-facing filter value | Bilingual, multilingual, international and admin DOB cases |
| `location_country` | 6 | 2 | none today; derived/supporting | Medium; taxonomy browsing only | Medium; supplemental merchandising, not canonical filtering | Supports future market segmentation docs, not direct profile assignment |
| `location_city` | 12 | 3 | none today; derived/supporting | Medium; taxonomy browsing only | Medium; supplemental merchandising, not canonical filtering | Matches current and planned market cities without replacing canonical locations |

## QA Goals Covered

- **Profile editing**: the expanded core kinds remove most “missing option” dead ends in talent editing and admin overrides.
- **Admin management**: launch minimum keeps the taxonomy panel manageable; the full pack provides future-safe breadth for staff QA.
- **Filtering/discovery**: `talent_type`, `tag`, `skill`, `industry`, `event_type`, `fit_label`, and `language` now have enough depth for meaningful filter combinations later.
- **Demo profile seeding**: the term library cleanly covers the 20-profile demo pack already generated in this repo.

## Cleanup / Standardization Recommendations

- Prefer hyphenated slugs consistently for multi-word terms.
- Keep `aliases` short and operational; use them for lookup/search tolerance, not as duplicate labels.
- Avoid creating parallel near-duplicates like `expo-model` once `trade-show-model` already exists.
- Keep location taxonomy derived from `public.locations` wherever possible to prevent drift.
