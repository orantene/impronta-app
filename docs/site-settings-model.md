# Site Settings model (Phase 8.5)

## Information architecture

Top-level hub: **Admin → Site Settings** (`/admin/site-settings`).

| Section | Scope |
|---------|--------|
| **Content** | Pages, posts, homepage, featured, navigation, redirects |
| **SEO & indexing** | Meta defaults, sitemap, canonical, slug policy |
| **Structure** | `template_key` catalog, taxonomy extensions, locale content |
| **System** | Globals, contact/social, theme tokens (allowlisted), flags |
| **Audit** | Who changed what (CMS + critical settings) |

**Phase 8.5** is **complete at architecture-doc level**; **8.6** is **partial** until real CRUD, redirects, metadata persistence, RLS, permissions, and audit exist.

**Today:** Shell routes only — **next implementation slice: 8.6A** (Pages + redirects + metadata first). Track completion in **`docs/acceptance-checklist.md`**. Operational `public.settings` keys remain editable at **Admin → Settings**.

## Permission matrix (default)

| Role | Scope |
|------|--------|
| `super_admin` | All Site Settings + system surfaces |
| `agency_staff` | Content-heavy areas; not global theme/flags unless granted |
| `editor` (future) | Posts (optional); no redirects/system |

Enforce in RLS + route guards when 8.6 ships.

## Relationship to `public.settings`

Reuse `settings` for feature flags and small globals; larger CMS entities get dedicated tables per `content-architecture.md`.
