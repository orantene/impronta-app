# Match explanations (Phase B)

Structured explanations only — **rule codes** + **template parameters**. No LLM as source of truth for core explanations.

## Rule table

| Code | Predicate (summary) | User-facing template (EN) | Params |
|------|---------------------|---------------------------|--------|
| `loc_match_residence` | Filter/query city matches residence | Located in {city} | `city` |
| `height_in_range` | `height_cm` within requested range | Matches requested height | — |
| `taxonomy_overlap` | Shared taxonomy term (type/tag/skill) | {label} experience | `label` |
| `primary_type_overlap` | Shared term equals card primary type (`ai_explanations_v2`) | Primary type: {label} | `label` |
| `primary_query_overlap` | Normalized query tokens overlap primary type label (`ai_explanations_v2`) | Aligned with your search ({label}) | `label` |
| `fit_label_query_overlap` | Query tokens overlap a card fit label not already covered by filter overlap (`ai_explanations_v2`) | Matches your search: {label} | `label` |
| `language_overlap` | Shared language term | Speaks {language} | `language` |
| `availability_window` | Availability rule matches | Available {window} | `window` |

## Precedence

1. Location  
2. Height  
3. Primary-type / query overlap (v2)  
4. Fit-label query overlap when not redundant with shared filters (v2)  
5. Taxonomy (primary type first when v2)  
6. Language  
7. Availability  

**Max rules per card:** 5 (configurable).

## API shape

```json
{
  "code": "loc_match_residence",
  "templateParams": { "city": "Cancún" },
  "confidence": "high"
}
```

`confidence` aligns with `docs/ai-confidence-model.md` (`high` \| `medium` \| `low`). Deterministic rules from DB fields → **`high`**.
