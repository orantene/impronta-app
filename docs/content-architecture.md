# Content architecture (Phase 8.5)

## Operational vs CMS

- **Operational:** `talent_profiles`, directory RPCs, inquiries, bookings, operational taxonomy — source of truth for matching.
- **CMS:** Editorial pages/posts, marketing copy, nav labels, redirects, SEO for those URLs — must not drive directory eligibility.

## Planned entities (implement 8.6)

**Priority (audit):** ship **8.6A** first — **`pages`** + **`redirects`** + metadata persistence + permissions/RLS; **`posts`** and **`navigation_items`** are implemented in-repo (admin + RLS + public posts route); featured and deeper globals remain as needed.

- **`pages`** — locale, slug, `template_key`, body/sections, meta/OG, sitemap flags.
- **`posts`** — blog/editorial; status `draft` | `published` | `archived`.
- **`navigation_items`** — header/footer; locale; optional `role_visibility`.
- **`redirects`** — old_path → new_path; loop prevention.
- **`featured_assignments`** / homepage config — unify with audit of existing `is_featured` on profiles.
- **`site_globals`** or settings keys — short snippets (footer, legal).

## Route-backed vs CMS-driven

Document each public URL in `route-ownership-map.md`: Next.js owns layout vs CMS supplies metadata/zones only (`route_backed_meta_only`).
