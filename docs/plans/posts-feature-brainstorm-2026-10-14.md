# Posts: talent + admin workspace (brainstorm v0.1)

2026-10-14 · Brainstorm agent · Design only, no code.

**One-line pitch:** *Write like WhatsApp, look like your site, get found by Google and the AIs.* A post is words plus photos. The design comes from the site, and SEO is done for you.

---

## 0. What already exists on `main` (pieces built, but not connected)

| Piece | State | Problem |
|---|---|---|
| `cms_posts` table | Tenant-scoped, RLS done, already has SEO fields: `meta_title`, `meta_description`, `og_image_url`, `noindex`, `include_in_sitemap`, `published_at`, `status`, `locale` en/es | `body` is one plain **TEXT** field, so no photos or blocks inside a post |
| Admin posts pages | `admin/site-settings/content/posts` and `admin/website/posts`, plus a revisions panel | Agency admin only. There is **nothing in the talent workspace** |
| Public `/posts/[slug]` route | Exists | Renders outside the page builder, so it doesn't look like the site's theme |
| Builder section `blog_index` | A card grid | A **manual list**, "can be pointed at a real CMS query later". It is **not wired to `cms_posts`** |
| Builder section `blog_detail` | Title, hero, body, pull quote | Static content typed into the section. It is **not wired to `cms_posts`** |
| `publish-scheduled` cron | Exists | Scheduling is ready to reuse |

**So:** we don't start from zero. The data layer and SEO fields exist, and the builder has blog-looking sections. The missing work is connecting them, a writing experience, and the talent side.

---

## 1. The big design decision (the answer to "templates or page builder?")

Oran's instinct is right: **start inside the page builder and drop the messy template system.** But one trap needs avoiding.

| Option | What it means | Verdict |
|---|---|---|
| A. Every post is a full builder page | Each post is designed section by section | ❌ 30 posts = 30 hand designs. Changing the look means editing 30 pages. Writing in a builder is slow. AI can't keep it consistent |
| B. Classic template system | Template manager, template types, assignment rules | ❌ Too advanced for a nail artist, and the "messy template thing" Oran wants to drop |
| **C. One "Post design" page plus a writer** ✅ | The site has **one special page in the page tree called "Post design"**. It's built in the builder like any page, with a **"Post content" widget** where each post's words and photos go. Writing happens in a clean **writer**, not the builder | ✅ Design once and every post follows. A talent edits it like any page and never hears the word "template" |

**Escape hatches for "this one post needs to look different":**
1. **"Use another look"**: up to 3 saved post designs per site (e.g. *Clásico*, *Historia con fotos*, *Anuncio*). Pick one per post.
2. **"Diseñar este post a mano"** (Detach): this post becomes a normal builder page that starts from its current design. It no longer follows the shared design, and a badge says so. One tap undoes it ("Volver al diseño compartido").
3. **"Cambiar diseño con IA"**: a prompt ("hazlo más editorial, foto grande arriba") → the AI edits **the Post design page** (all posts) *or* creates a new saved look, and asks which. It never silently forks one post.

That gives the talent three simple levels of control. Nobody has to manage templates, and the theme stays consistent.

---

## 2. Who and why (personas)

| Persona | Why they post |
|---|---|
| **Nail artist / barber** (talent/profesional, mobile) | Show recent work, tips ("cómo cuidar tu gel"), news ("nuevo horario", "promo de diciembre"), get found locally |
| **Photographer / model / performer** | Portfolio stories ("Boda en Tulum"), press, behind the scenes |
| **Coach / consultant / teacher** | Long articles, expertise, FAQs. The heaviest SEO and AI-answer users |
| **Agency / studio admin** | News, roster spotlights ("Conoce a Diego"), event recaps, written by several staff writers |

What they all share: they believe **Google and AI chats (ChatGPT, Gemini, Perplexity) will read this and send them clients.** We have to make that true (section 6) and show it (section 8).

---

## 3. User stories

### Talent workspace
1. **First post in 3 minutes (mobile).** Dashboard → Website → Posts → **+ Nuevo post** → "¿De qué quieres hablar?" → she types "cómo hacer que tu manicure dure 3 semanas" → **Escribir con IA** → a draft in her voice with a title, 3 tips and a "Reserva tu cita" button → she adds 2 photos from her camera roll → **Publicar**. SEO title, description, URL, cover image and AI-friendly markup are all filled automatically.
2. **Post from my work.** After a booking she uploads before/after photos → callout "¿Convertir esto en un post?" → AI writes a short story ("Full glam para boda") linked to the service she did.
3. **Quick news.** "Cierro del 24 al 26" → template **Aviso** → 2 lines → publish → appears on the home "Últimas noticias" strip and expires on the 27th.
4. **Promo announcement.** From a live promo (Promos engine) → "Anunciar en un post" → a post with the promo card embedded. When the promo ends, the card shows "terminó" and the post stays useful.
5. **Change the look of all posts.** Website builder → page tree → **Post design** → she moves the cover photo to full-width and changes fonts → all 12 posts update.
6. **One special post.** Her wedding portfolio story should look like a magazine → in the post: **Diseño → "Historia con fotos"**. If even that's not enough: **Diseñar a mano**.
7. **Bilingual.** Her site is ES with EN. **Traducir al inglés** → AI translation she can review, linked as the EN version (hreflang).
8. **Check if it works.** Posts list shows per post: visits, clicks to "Reservar", Google searches it appeared in. The SEO dot is 🟢🟡🔴 with a plain fix list ("Agrega una foto de portada").
9. **Schedule.** Writes on Sunday and schedules for Tuesday 10:00 (site time zone). Gets a notification when it's published, plus a "Compartir" sheet (Instagram/WhatsApp card, same share kit as Promos).
10. **Delete or unpublish safely.** Unpublish leaves the URL showing "Este post ya no está disponible" + latest posts (no 404 dead end). Changing a slug creates an automatic redirect.

### Admin (agency/studio) workspace
11. **Several writers.** A staff writer drafts; the owner or editor reviews and publishes (roles: Writer, Editor). *v1.1.*
12. **Talent spotlight.** "Conoce a Diego" → the post embeds Diego's talent card and links to his profile. Author can be staff, the agency, or *about* a talent.
13. **Categories as site sections.** News / Eventos / Talento. Each gets its own index page automatically (`/blog/eventos`).
14. **Event recap.** From a past event → "Escribir resumen" → AI drafts from the event data + photos.

### Client / visitor / AI side
15. A visitor reads a post → sees the "Reservar" / service card / promo card **inside** the post → books without leaving.
16. ChatGPT is asked "best nail artist in Cancún for weddings" → it finds a clean, well-structured, well-linked post with author, location and services → cites it. (This is what section 6 is for.)

---

## 4. Where Posts live (dashboard + builder)

### 4.1 Talent dashboard
```
Website ▾
  ├ Mi sitio (builder)
  ├ Posts            ← new
  ├ Servicios
  └ SEO y visibilidad
```
**Posts list (390px):**
```
┌───────────────────────────────┐
│ Posts                [+ Nuevo]│
│ [Todos][Publicados][Borradores]│
│ ┌───────────────────────────┐ │
│ │ [img] Cómo hacer que tu   │ │
│ │ mani dure 3 semanas       │ │
│ │ Publicado · 12 oct · 🟢SEO│ │
│ │ 214 visitas · 9 reservas  │ │
│ └───────────────────────────┘ │
│ ┌───────────────────────────┐ │
│ │ [img] Cerrado 24-26 dic   │ │
│ │ Programado · mar 10:00    │ │
│ └───────────────────────────┘ │
│ 💡 Tienes fotos nuevas de     │
│ "Full glam". ¿Hacer un post?  │
└───────────────────────────────┘
```

### 4.2 Inside the builder (page tree)
```
PAGES
  🏠 Inicio
  Servicios
  Sobre mí
  Contacto
POSTS                         [+ Nuevo post]
  🎨 Diseño de posts          ← the shared Post design page (pinned)
  Cómo hacer que tu mani...
  Cerrado 24-26 dic
  (ver todos →)
```
- Clicking a post in the tree opens it **in the builder canvas with the shared design**. The words are editable inline, and the design parts are greyed out with "Editar en Diseño de posts".
- **"Diseño de posts"** opens the shared design page with a sample post in the content widget (it uses the latest real post, or demo text if there are none).
- Admin workspace: the same tree in the agency builder. **Talent builder ≠ agency builder** (memory rule): they share the data and engine and have separate UIs.

### 4.3 Builder widgets (sections)
| Widget | What | Exists? |
|---|---|---|
| **Post content** | The slot: title, cover, body blocks, author, date, reading time, category | New. Replaces `blog_detail`'s static fields with "fill from the current post" |
| **Últimos posts** | Grid/list/carousel, filter by category, count, "ver todos" | Upgrade `blog_index` from a manual list to a **live query** of `cms_posts` |
| **Post destacado** | One chosen post, big | New (small) |
| **Posts relacionados** | Same category / same service | New, used inside Post design |
| **Autor** | Talent card with photo, bio, "Reservar" | New, from the talent profile |

---

## 5. The writer (how a post is written)

The writer is a separate view from the builder: full screen, mobile-first, block-based (Notion/Medium-like).

```
┌───────────────────────────────┐
│ ←  Borrador guardado    Publicar│
│ [ + Foto de portada ]          │
│ Título                         │
│ ─────────────────────────────  │
│ Escribe o presiona / ...       │
│                                │
│ [✨ IA] [📷] [🔗] [Aa] [⋯]    │  ← thumb bar
└───────────────────────────────┘
```

**Blocks v1:** paragraph, heading, list, image, gallery (2-6), quote, video embed (YT/IG/TikTok), divider, plus **Tulala smart blocks**: *Servicio* (live price from the shared price source), *Botón Reservar*, *Promo* (live, shows "terminó" when ended), *Pregunta frecuente* (Q+A, becomes FAQ schema), *Antes/Después*.

**Data:** add `body_blocks jsonb` to `cms_posts` (the old `body` TEXT stays as a fallback/plain export). Blocks render through the theme's tokens, so they look native in any theme.

### AI in the writer (the credits engine)
| Action | What it does |
|---|---|
| **Escribir con IA** | Idea, voice note or bullet points → a full draft in *her* voice (trained on her bio + existing posts + services) |
| **Desde mis fotos** | Photos + service → a short story post |
| **Mejorar** | Shorter / friendlier / more professional / fix spelling |
| **Traducir** | ES ⇄ EN as a linked translation, reviewable |
| **SEO automático** | Title, description, slug, alt texts, FAQ suggestions, internal links to her services |
| **Ideas** | "10 ideas de posts para este mes" based on her services, season and what people search |
| **Cambiar diseño con IA** | Section 1, escape hatch 3 |

Rules:
- AI never publishes by itself. A human taps Publicar.
- AI text is marked as a draft until it's reviewed.
- No invented facts: the AI uses only her services, prices and info. If it needs a fact, it asks.

---

## 6. SEO and "AI can find me" (built in, invisible)

**Automatic, no setting needed:**
- `<title>`, meta description, canonical, clean slug (ES accents removed), OG image (auto-generated card if there's no cover; same renderer as the Promos share kit).
- **JSON-LD:** `BlogPosting` with `author` = Person (talent) / Organization (agency) linked to the profile, `about` → Service, `FAQPage` from FAQ blocks, `BreadcrumbList`, and `LocalBusiness` from the site's location.
- Sitemap entry + ping, hreflang ES/EN, `lastmod` on update.
- **AI crawlers:** posts listed in `/llms.txt` (title + summary + URL), clean semantic HTML (one h1, real headings, alt text), fast server render. Robots allow the major AI bots by default, with a toggle in SEO settings ("Permitir que las IA lean mi sitio").
- **Internal linking:** each post links to the related service, and the service page shows "Posts sobre este servicio". This is good for both Google and AI answers.
- Slug change → automatic 301. Unpublish → a soft landing page (story 10).

**The SEO panel per post** (collapsed under "SEO y vista previa"):
- Google result preview + WhatsApp/Instagram share preview.
- Editable: SEO title, description, slug, cover/OG image, "no mostrar en Google" (noindex).
- **Checklist with a 🟢🟡🔴 dot**, plain language: "Título muy largo", "Falta foto de portada", "Agrega 1 enlace a tu servicio", "Texto muy corto (<300 palabras) para aparecer en Google". Each item has a **[Arreglar con IA]** button.

**The site's "SEO y visibilidad" page** (dashboard): Google connection status, indexed pages, AI-crawler toggle, sitemap link, and per-post search appearances (Search Console API later).

---

## 7. Post settings (one sheet, simple first)

| Setting | Default | Notes |
|---|---|---|
| Estado | Borrador | Borrador · Programado · Publicado · Oculto (unlisted: the link works, but it's not in lists or Google) |
| Fecha de publicación | now | Schedule in the site time zone. Reuses the `publish-scheduled` cron |
| Categoría | none | 1 category per post in v1 (tags later). Categories get index pages |
| Diseño | Shared | Shared · other saved look · Diseñado a mano |
| Autor | me | Admin: pick a staff member or the agency |
| Idioma | site default | + linked translation |
| Destacado | off | Pins it at the top of "Últimos posts" |
| Expira | never | For notices ("Cerrado 24-26 dic"): hidden from lists after the date, and the URL stays with a soft notice |
| Servicio relacionado | AI suggests | Drives internal links + related posts |
| SEO | auto | Section 6 |

Hidden for v1: comments, password protection, custom CSS, per-post scripts.

---

## 8. Dashboard insights (why they keep posting)
- Per post: visits, where the visitors came from (Google / AI / Instagram / WhatsApp / direct), clicks on "Reservar" inside the post, **bookings attributed** (first-touch, same `via=` tagging as Promos).
- Home card: "Tu post *Cómo hacer que tu mani dure* trajo 3 reservas este mes".
- AI referrals tracked separately (chatgpt.com / perplexity / gemini referrers). Showing "1 visita desde ChatGPT" is the magic moment Oran described.
- Nudges (with the same budget rules as Promos callouts, max 1 per day): "Hace 30 días que no publicas", "Tienes fotos nuevas", "Llega el Día de las Madres, ¿post de ideas?".

---

## 9. Plan gating (proposal)
- Free: 3 published posts, shared design only, AI = the normal free credits.
- Paid: unlimited posts, saved looks, Detach, scheduling, translations, insights, categories.

---

## 10. Phased plan

| Phase | What | Why first |
|---|---|---|
| **v1: Posts in the builder** | `body_blocks jsonb` on `cms_posts` + post design page per site (`cms_pages.kind = 'post_layout'`) + **Post content** widget + `blog_index` → live query ("Últimos posts") + page tree "POSTS" group with + Nuevo post + the writer (core blocks + Servicio/Reservar) + post settings + auto SEO/JSON-LD/sitemap/llms.txt + talent dashboard Posts list + the existing admin posts pages repointed to the same writer | Connects what exists and gives one engine for both workspaces |
| **v1.1** | AI writer (draft, improve, translate, SEO fix, from photos) · saved looks (up to 3) · Detach · categories pages · scheduling UI · share kit · Promo/FAQ/Antes-Después blocks · insights v1 | The magic, on a solid base |
| **v2** | Writer/Editor roles + review flow (agency) · "Cambiar diseño con IA" · Search Console connection · AI-referral analytics · newsletter (email posts to opted-in clients) · tags · import from Instagram captions | Growth and teams |

**Not building:** a separate template manager, per-post custom CSS/code, comments, membership/paywalled posts, multi-category taxonomies.

---

## 11. Open questions for Oran (with my recommendation)

| # | Question | Recommendation |
|---|---|---|
| P1 | One shared "Post design" page + writer, with Detach as the escape hatch (instead of templates)? | **Yes.** It's the "no messy templates" version |
| P2 | Is the writer a separate full-screen view (not the builder canvas)? | **Yes.** Writing in a builder is slow on a phone. The builder is for design |
| P3 | Theme-specific post designs? | **Each theme ships a default Post design page** (theme authors design it once). The talent edits from there. No per-theme template code |
| P4 | URL: `/blog/<slug>` or keep `/posts/<slug>`? | **`/blog/<slug>`** (what people and Google expect), with a 301 from `/posts/`. Hub: `/t/<handle>/blog/<slug>` |
| P5 | Free plan: 3 posts? | Yes, as a taste. Posts bring SEO, which helps the whole platform |
| P6 | Allow AI crawlers by default? | **Yes** (that's the promise), with a visible toggle |
| P7 | Agency: can talents write posts on the agency site? | Later (v2 roles). v1 = staff only |
| P8 | Is a post on the talent hub profile (no custom site) allowed? | **Yes**: hub profiles get a "Posts" tab using the platform's default design. That's the SEO win for free talents too |

---

## 12. Next steps
1. Oran answers P1 to P8 (or "go with recommendations").
2. I write the v1 design v1.0 with wireframes per screen, the data model diff (`cms_posts.body_blocks`, `layout_page_id`, `category_id`, `expires_at`, `detached`; `cms_pages.kind`), and the PR split.
3. Then PM cards under a "Posts v1" epic, the same way as Promos.
