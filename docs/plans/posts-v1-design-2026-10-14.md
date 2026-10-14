# Posts v1: design (lean)

2026-10-14 · Brainstorm agent · Builds on `posts-feature-brainstorm-2026-10-14.md`.

**Decisions (PM, for Oran):**
- P1, P2, P3, P4, P6, P7: as recommended.
- FAQ block is in v1 (fixes TUL-795).
- The Servicio block reads from the shared price source (it builds on the S2 fix).
- Hub-profile Posts tab moves to v1.1, so **v1 ships custom sites only**.
- **Posts is a paid Web Office feature** (Oran, 2026-10-14). This replaces "Free = 3 published posts". See the gating rule in section 2.
- Admin takedown is in v1.
- **One project card, one branch, one PR, one localhost test pass.**

---

## 1. Scope

**In v1**
1. **Talent dashboard:** Website → **Posts** list (filters, status, SEO dot) + **+ Nuevo post**.
2. **Writer:** full-screen, mobile-first. Blocks:
   - paragraph, heading, list, image, gallery, quote, video embed, divider
   - **Servicio**, **Botón Reservar** and **Pregunta frecuente (FAQ)**
3. **Post settings sheet:**
   - status (Borrador / Programado / Publicado / Oculto) and publish date
   - category (1 per post)
   - featured
   - expires (for notices)
   - related service
   - SEO (title, description, slug, cover/OG image, noindex)
4. **Builder:**
   - a **POSTS** group in the page tree, with **Diseño de posts** pinned
   - the **Post content** widget
   - **Últimos posts**: `blog_index` becomes a live list of real posts
   - the **Autor** widget
5. **Public:** `/blog/<slug>` (301 from `/posts/<slug>`), category pages `/blog/c/<category>`, and a soft "ya no está disponible" page for unpublished posts.
6. **SEO and AI visibility (automatic):**
   - title/meta/canonical, an auto OG image when there's no cover
   - `BlogPosting` + `BreadcrumbList` + **`FAQPage`** (from FAQ blocks) JSON-LD
   - sitemap entry, ES/EN alternate-language links (when a translation is linked), posts listed in `llms.txt`
   - an "IA puede leer mi sitio" toggle (default ON)
   - slug change → automatic 301
7. **Agency admin:** the existing admin posts pages switch to the same writer and settings, so both workspaces use one writer.
8. **Takedown** (platform admin): hide any post on any tenant, with a reason. It forces `noindex`, drops the post from lists, the sitemap and `llms.txt`, and the URL shows the soft-unavailable page. The talent sees "Oculto por Tulala: {razón}" and can't republish it. Only the platform admin can undo it.
9. **Gating: paid only.** Talents: **Web Office** (the one paid talent package). Workspace admins: their **first paid package and up**. A free talent can open Posts, write and preview drafts (no limit). **Publicar** opens the Web Office upgrade sheet and keeps the draft, so it publishes right after upgrading (same pattern as Promos).

**Not in v1:** AI writer, saved looks, Detach, scheduling UI beyond a date picker (the cron already exists), share kit, insights, hub Posts tab (all v1.1). Roles/review, AI redesign, newsletter (v2).

**Scheduling:** "Programado" + a date picker is in v1, because the existing `publish-scheduled` cron does the work. It costs nothing extra.

---

## 2. Key rules (behaviour that shapes the build)

**Price**
- The Servicio block shows the price only through the **shared `displayPrice()`** (from the S2 price-source fix). It never stores a price in the post.
- A deleted or unpublished service hides the block on the public page and shows a warning in the writer.

**Design**
- One **Diseño de posts** page per site and language: a `cms_pages` row with `is_system_owned = true`, `system_template_key = 'post_layout'`. It's created on first use from the theme's default and can't be deleted (the existing system-ownership guard handles that).
- The **Post content** widget renders the current post's title, cover, blocks, author, date and reading time. In the builder it previews the latest post, or demo text.
- Blocks render with theme tokens only: no per-block colours or fonts in v1.

**URLs**
- Slug is unique per tenant + locale (existing index).
- A slug change writes a `cms_redirects` row (the existing table).
- `/posts/*` → 301 → `/blog/*`.

**Status and expiry**
- Status is the existing `cms_page_status` + `published_at`. "Oculto" = published but `unlisted`: the link works, but the post isn't in lists, the sitemap, `llms.txt` or Google.
- An **expired** post is removed from lists and the sitemap, and its URL shows the post with a top notice "Esta información ya no está vigente".

**FAQ**
- Each FAQ block is one Q + A. All FAQ blocks in a post become one `FAQPage` JSON-LD. At least 1 Q/A is required for the schema to be emitted (an empty block outputs nothing).

**Gating (Web Office)**
- New capability key **`talentPosts`**, granted by **every Web Office plan key** in `web/src/lib/access/plan-catalog.ts`: `talent_portfolio` and the grandfathered `talent_pro` (it is sold and shown as Web Office too; there is one paid talent package, so no split). It is checked through the **site-scoped reader** (`talentPlanGrantsSiteCapability`), like the other personal-site gates. No `plan === '...'` string checks in components.
- The publish check is **server-side** (the publish action + scheduled-publish cron both check the capability). The UI lock is a convenience only.
- **Downgrade / lapse:** published posts **stay live and indexed**, so we don't break the talent's SEO or links. They become read-only: no new publishes or edits to live posts until renewal. Drafts are kept. (Same spirit as the custom-domain rule: rows are never mutated, so restoring the plan restores everything.) Scheduled posts don't publish while lapsed, and the talent is told.
- Web Office perk list (`TalentSubscriptionShell.tsx` / plan card): add "Blog y posts con SEO para Google e IA".
- **Workspace admins:** Posts is granted from the **first paid workspace package** (`website`) and every package above it (`studio`, `agency`, `network`, `legacy`). The workspace `free` plan can draft + preview but not publish (same upgrade pattern). Existing published posts on any workspace stay live (no regression).

**Tenancy**
- Every write goes through the existing tenant-scoped posts write path. The static test that forbids raw `.from("cms_posts")` stays green.

---

## 3. Data-model diff

```sql
-- cms_posts: additive only
ALTER TABLE public.cms_posts
  ADD COLUMN body_blocks       jsonb,            -- writer blocks; NULL = legacy post, render `body` TEXT as before
  ADD COLUMN category_id       uuid REFERENCES public.cms_post_categories(id) ON DELETE SET NULL,
  ADD COLUMN related_offering_id uuid,           -- FK to talent_offerings (or the tenant's service table); ON DELETE SET NULL
  ADD COLUMN is_featured       boolean NOT NULL DEFAULT false,
  ADD COLUMN is_unlisted       boolean NOT NULL DEFAULT false,   -- "Oculto"
  ADD COLUMN expires_at        timestamptz,
  ADD COLUMN cover_image_url   text,
  ADD COLUMN cover_image_alt   text,
  ADD COLUMN author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN translation_of    uuid REFERENCES public.cms_posts(id) ON DELETE SET NULL, -- ES/EN pair
  ADD COLUMN taken_down_at     timestamptz,
  ADD COLUMN taken_down_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN taken_down_reason text;

-- new: categories (tenant + locale scoped)
CREATE TABLE public.cms_post_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('en','es')),
  slug text NOT NULL,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, locale, slug)
);
-- RLS: same tenant-scoped pattern as cms_posts (staff write, public read).

-- cms_pages: no schema change. Post design page =
--   is_system_owned = true, system_template_key = 'post_layout' (one per tenant+locale, existing unique index).

-- site settings: one flag
--   ai_crawlers_allowed boolean NOT NULL DEFAULT true   (on the existing site-settings row)
```

**Rules:**
- Takedown is enforced by the public read: `taken_down_at IS NULL`. The talent's write path refuses to clear `taken_down_*`, and only the platform-admin action can.
- Publish requires the posts capability (talent: Web Office; workspace: `website` and up), checked on the server in the publish action and the scheduled-publish cron.

**`body_blocks` shape:** an array of `{ id, type, ...props }`, validated by a zod schema per type.
- Types: `paragraph | heading | list | image | gallery | quote | video | divider | service | book_button | faq`.
- `service` stores **only `offering_id`**, never a price.

**Migration order:** file → `db:push` → verify the columns and table exist → then merge. It's additive, so it's safe ahead of the code.

---

## 4. Screens (390px, one-handed)

```
POSTS LIST                      WRITER                         SETTINGS SHEET
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│Posts       [+ Nuevo] │ │← Guardado   Publicar │ │Estado   ◉Publicado   │
│[Todos][Publ][Borr]   │ │[+ Portada]           │ │Fecha    hoy ›        │
│▢ Cómo hacer que...   │ │Título                │ │Categoría Tips ›      │
│  Publicado · 🟢      │ │Escribe o / ...       │ │Servicio Gel mani ›   │
│▢ Cerrado 24-26 dic   │ │                      │ │Expira   nunca ›      │
│  Programado mar 10:00│ │[📷][Aa][🛎][❓][⋯]   │ │▸ SEO y vista previa  │
│ 🔒 Publicar = Web Off│ │ photo text service faq│ │  Google / WhatsApp  │
│ (borradores gratis)  │ │                      │ │  🟡 Falta portada   │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
```

Builder page tree:
`PÁGINAS … / POSTS [+ Nuevo post] → 🎨 Diseño de posts, then latest 5 posts, then "ver todos"`.

Platform admin: on any post row, `⋯ → Ocultar (takedown)` → a reason field → confirm.

The SEO dot checks:
- title length
- description present
- cover present
- ≥300 words
- ≥1 link to a service
- alt texts present

It shows plain ES/EN copy. There's no AI fix button in v1.

---

## 5. Project card + sub-cards (one branch, one PR)

**Project card: "Posts v1"**
- Branch `feat/posts-v1` off the latest `origin/main`, **one PR**.
- The sub-cards are checklist items done in order on the same branch. Nothing goes live separately.
- One localhost QA pass at the end (:3001, Jor for look-only, TAL-93900 for writes).
- Then `full-ci`, then merge, then proof on prod.
- Depends on: **S2 price-source fix merged** (the Servicio block reads `displayPrice()`). Related: TUL-795 (FAQ).

| # | Sub-card | Done when |
|---|---|---|
| 1 | **Migration**: the `cms_posts` columns, `cms_post_categories` + RLS, the `ai_crawlers_allowed` flag | `db:push` applied, objects verified. Existing posts render unchanged (`body_blocks` NULL → legacy body) |
| 2 | **Blocks model + renderer**: zod per block type, theme-token renderer, legacy-body fallback | Unit tests per block. FAQ → JSON-LD helper tested. Service block calls `displayPrice()` |
| 3 | **Writer + settings sheet** (shared by talent + admin) | Create/edit/autosave a draft; every block works at 390px; settings save; slug change writes a redirect |
| 4 | **Talent dashboard Posts list** + nav entry + **paid gate** (talent: any Web Office key incl. grandfathered `talent_pro`; workspace: `website` and up; server-side publish check; lapse = read-only) + perk line on the plan cards | A free talent / free workspace can draft + preview; Publicar opens the upgrade and keeps the draft. Every Web Office talent and every paid workspace can publish. A lapsed plan's posts stay live but read-only |
| 5 | **Builder**: POSTS group in the page tree, the Diseño de posts system page (from the theme default), the Post content widget, `blog_index` → live "Últimos posts", the Autor widget | Editing Diseño de posts changes every post. The home "Últimos posts" shows real posts |
| 6 | **Public routes**: `/blog/<slug>`, `/blog/c/<cat>`, the 301 from `/posts/*`, soft-unavailable and expired states | All states render in theme. Old URLs 301 |
| 7 | **SEO/AI**: meta/canonical/OG auto image, `BlogPosting` + `FAQPage` + breadcrumbs JSON-LD, sitemap, hreflang, `llms.txt`, crawler toggle, SEO dot | Structured data validates (schema test). Hidden/expired/taken-down are excluded everywhere |
| 8 | **Admin**: repoint the existing admin posts pages to the writer + platform-admin takedown | Takedown hides the post everywhere and forces noindex. The talent can't undo it |
| 9 | **Localhost QA pass + PR** | The checklist below is all green with screenshots. `full-ci` label. Merge with PM OK |

**QA checklist (one pass):**
1. Web Office talent (TAL-93900): write a post with photo + Servicio + FAQ, publish, see it on the home "Últimos posts" and at `/blog/<slug>`.
2. Servicio price = the service page price.
3. FAQPage is in the page source.
4. A free talent: draft + preview work, Publicar opens the Web Office upgrade, the draft is kept. A simulated lapse: posts stay live and read-only.
5. Changing the slug makes the old URL 301.
6. Edit Diseño de posts → all posts change.
7. Hide a post → it's gone from lists and the sitemap, and the link still works.
8. Expire a post → the notice shows.
9. Platform-admin takedown → noindex + the talent's view.
10. The agency admin writes a post with the same writer.
11. 390px + ES/EN.

**Proof on prod:** merged SHA + migration id. A read-only check of one published post on a test site (structured data, sitemap, 301). No writes on live tenants.

---

## 6. Open (only if PM wants to change defaults)
- Category pages URL `/blog/c/<slug>` vs `/blog/<category-slug>` (chose `/c/` to avoid collisions with post slugs).
- Max 1 category per post in v1: OK?
