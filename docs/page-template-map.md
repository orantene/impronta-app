# Page template map (Phase 8.5)

## Template safety (hard rule)

Every `template_key` is **allowlisted** and maps to an **existing** Next.js layout. Templates select among implemented layouts, toggle allowed sections, and fill blocks — they **do not** invent new page skeletons.

## Initial catalog (examples)

| `template_key` | Layout owner | Notes |
|----------------|--------------|--------|
| `standard_page` | Marketing / legal layout | Body + hero |
| `blog_post` | Post layout | Excerpt, cover, author |
| `blog_index` | Blog listing | — |
| `landing_page` | Landing shell | CTA blocks |
| `route_backed_meta_only` | Product route | Metadata + optional zones only |

New keys require **code + migration + this doc**.
