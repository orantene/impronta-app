# Impronta — Live Page Audit & Design-Tightness Report

**Date:** 2026-06-26
**Tenant:** `impronta` (Impronta Models, id `00000000-0000-0000-0000-000000000001`)
**Live host:** improntamodels.com · **Local QA host:** `impronta.lvh.me:3000` (preview proxy on `:3116`)
**Method:** live DOM verification on localhost (header→footer) + a 13-agent code-render map of every page. Every finding is file-anchored.

> ⚠️ **Production-data note:** localhost dev points at the **production Supabase**. Anything stored in the DB (page snapshots, nav menus, the footer tagline, publish status) is the *live* site. "Content" fixes below = production data edits; "Dev" fixes = code on this branch (not live until merged).

---

## 0. TL;DR verdict

The Impronta site is **structurally mature but not "tight."** The homepage is genuinely premium (5-slide editorial hero, live talent board, divisions, stats, testimonials). Everything *behind* the homepage is thinner than it looks, and a handful of **cross-cutting defects** drag the whole site down at once:

- **Every non-home page ends in an empty bordered footer bar** (no links, no legal, no social). Biggest single header-to-footer failure.
- **The live footer tagline is junk** — it literally reads `Builder live-edit 01:58:54 UTC` (a leftover from a builder test session) sitting above the copyright on the homepage.
- **Page `<title>` leaks the wrong brand** — Contact and Our Fashion Models render as `… · Tulala` instead of `… · Impronta`.
- **A QA/debug page (`/demo-forms`) is published, public, and in the sitemap.**
- **No Privacy / Terms / "Become a Model" / "For Clients" pages exist** — compliance + conversion gaps.
- Several **"premium" pages are re-skinned directories or wrong templates** (Our Fashion Models shows the *entire* roster; Studio is rendered through a blog-post template).

Grade today: **homepage A-, everything else C/C+.** The fixes are mostly small and shared — a half-dozen cross-cutting changes lift 6+ pages each.

---

## 0b. Implementation log (shipped this session, on branch `feat/message-impronta-unified-inquiry`)

**Cross-cutting code fixes (verified on localhost, tsc + eslint clean):**
- **Shared `<PublicSiteFooter>`** ([public-site-footer.tsx](web/src/components/public-site-footer.tsx)) — always renders brand + tagline + footer nav + socials (platform-validated, so the junk YouTube=TikTok URL is dropped) + copyright + Powered-by. Mounted on `/p`, `/directory`, `/posts`, and the homepage. **Killed the empty-bar footer on every non-home page.**
- **Imageless heroes → clean mood + no over-image text-shadow** (`hero/Component.tsx`, `globals.css`) — removes the ~65vh voids on Contact / FAQ / About.
- **Surface token fix** (`token-presets.css`) — contact form card no longer renders near-white on the dark theme; card width constrained to 600px.
- **Branded page titles** — added a per-tenant title template to `(public)/layout.tsx` (`· Impronta`, not `· Tulala`); fixed the directory double-suffix; gave the homepage a real `meta_title`.

**Production data cleanup (live DB):**
- `/demo-forms` QA page **unpublished** (was published + indexed + in sitemap) — now 404.
- Junk footer tagline (`Builder live-edit … UTC`) and junk identity fields (broken whatsapp / mis-pasted YouTube URL) **cleared**.
- About page: fixed the **"A house 5of"** typo and **reordered** so the hero leads.
- Nav **seeded**: header now has Models + Become a Model (and About is visible); a **footer nav zone** was created (About, Models, Become a Model, Studio, FAQ, Contact, Privacy, Terms).
- Directory flagship page given a heading ("The Roster" / "Find your cast.").

**More cross-cutting / component fixes:**
- **Noir profile empty-bio fallback** — bio-less profiles (≈49/55 of the roster) now show a muted derived descriptor (type · location · agency) instead of a blank hero void.
- **Directory dead grid/list toggle hidden** on the portable section (grid-only) via a `showViewToggle` prop; legacy discover keeps its working toggle.
- **Directory flagship heading** populated ("The Roster" / "Find your cast.").

**New pages built via the page builder (published, placeholder-ready, all verified rendering):**
- **Privacy Policy** (`/privacy`) and **Terms of Service** (`/terms`) — clean legal prose pages, footer-linked.
- **Become a Model** (`/become-a-model`) — hero + "Apply to join" CTA + "what we look for" band.
- **For Clients** (`/for-clients`) — hero + two CTAs + a 4-step "how it works" band.
- **Journal / News** (`/posts`) — a new listing route over the existing posts data layer + 3 seeded placeholder posts; detail pages already existed.
- **Editorial 404** — a noir "Lost the thread." page assigned the `notFound` page-role; unknown URLs now return it in-shell with a correct 404 status.
- All wired into header + footer nav.

> Note: some DB-driven content (nav links, page `meta_title`s, directory heading) is read through a 300s cache, so it appears in localhost QA within ~5 minutes (or on the next deploy).

**Final batch — previously-deferred items, now SHIPPED + verified:**
- **"Our Fashion Models" scope bug — FIXED.** The talent-type keys are real `taxonomy_terms` slugs; a new `scope-resolver.ts` resolves `talentTypeKeys`→term ids, seeds the SSR fetch, and locks a `scopeTermIds` filter into every reactive grid fetch (the contradictory talent-type top bar is hidden when scoped). Verified: `/our-fashion-models` now returns **19 fashion-model talents** vs **44** on `/directory`. This also **unblocks talent-type category landings** (set `scope=by_talent_type` in the builder).
- **Language switcher es/fr 404s — FIXED.** Dropped the bogus `fr` (zero content) from `supported_locales` so the switcher only offers EN | ES, and added an es→en content fallback in the `/p` route. Verified: `/es`, `/es/about`, `/es/contact`, `/es/faq`, `/es/become-a-model` all return **200** (was 404).
- **Freeform `form` node theming — FIXED.** Raw form inputs/select/textarea now inherit token-aware field styling (no more white-on-dark boxes).

**Remaining micro-polish (cosmetic, non-blocking):** directory `h2→h1` for directory-as-page surfaces; pruning a few inert directory builder knobs; the secondary Noir items (no-photo monogram, digitals lone-cell, "Select clients" relabel). Gender ("Women"/"Men") and "New Faces" landings need a different facet/sort than talent-type scope — an owner curation call.

---

## 0c. Integration / deploy note (READ before merging feat → main)

**Code** is in commit `cca030765` on `feat/message-impronta-unified-inquiry` — NOT yet on `main`/production. **DB content** (new pages, nav, content cleanup) is already live on production Supabase (localhost shares the prod DB), so the two pipelines are temporarily out of step.

**A standalone PR off `main` is not cleanly extractable.** `main`'s directory has diverged from feat's (gold-accent toolbar via `--dir-accent-soft`/`--impronta-gold-bright`, a third **"map"** view, recent a11y work in #695). A cherry-pick of `cca030765` onto `main` applies 11/18 files cleanly but conflicts on the 7 directory/route files, and some directory fixes don't even apply to main's newer code. **Ship this via feat merging to main**, where the directory reconciles in context. The cross-cutting work (shared footer, imageless-hero clean mood, per-tenant title template, surface token, es→en fallback, themed form-node inputs, `/posts` route + new components) is clean and main-ready.

**Directory-reconciliation checklist — re-check each against MAIN's directory, not feat's:**
- `sections/directory/scope-resolver.ts` (by_talent_type keys → taxonomy term ids) — still needed; wire into **main's** `DirectoryReactiveResults` + `Component` (they differ from feat's).
- Grid/list toggle gate (`showViewToggle={false}` on the section) — likely **DROP**: main appears to implement list + map views, so the toggle is not dead there.
- `DirectoryCard` no-photo monogram — verify main's card didn't already rework that region.

**Stopgap to REVERT once the code is live** (applied to keep prod consistent while code lagged behind the DB):
```sql
-- re-publish the 4 category landing pages (need the scope-resolver code live first)
update cms_pages set status='published'
 where tenant_id='00000000-0000-0000-0000-000000000001'
   and slug in ('commercial-models','editorial-models','hosts-and-promoters','djs-and-performers');
-- re-show the hidden footer links (category cluster + Journal)
update cms_navigation_items set visible=true
 where tenant_id='00000000-0000-0000-0000-000000000001' and zone='footer'
   and label in ('Fashion Models','Commercial Models','Editorial & Runway','Hosts & Promoters','DJs & Performers','Journal');
```
(The `/posts` Journal listing route is a new code file — keep its footer link hidden until that code is deployed, or it 404s.)

**Noir edits** (empty-bio fallback, "Select clients"→"Specialties", digitals lone-cell cap) live in the **untracked `_noir/` template** and are NOT in `cca030765`; they ride that template's eventual commit.

---

## 1. Live page inventory (what's published)

| Page | Route | Renders via | Grade | Headline issues |
|---|---|---|---|---|
| Homepage | `/` | Freeform builder tree (DB) + React shell | **A−** | Broken local hero image; junk footer tagline; Slide-1 dead 40% gutter; `<title>` = "Homepage" |
| Directory | `/directory` | Directory section (React) + snapshot props | **B−** | No H1; dead grid/list toggle; not in header nav; inert builder knobs; name-in-a-box no-photo cards |
| About | `/about` | 2 sections (trust strip + hero) | **C−** | Live typo "A house **5**of curated talent"; sections reversed; no CTA (dead-end); nav-hidden; 2-section stub |
| Contact | `/contact` | hero + contact_form section | **C+** | Light card on dark page (token bug); empty footer; form too wide; `· Tulala` title; no contact details |
| FAQ | `/faq` | hero + faq_accordion | **C+** | Empty footer; oversized empty hero void; unlinked "contact us" CTA |
| Studio & Services | `/studio` | **blog_detail** template (wrong) | **D** | One sentence in a blog-post template; no services grid, no imagery, no CTA |
| Our Fashion Models | `/our-fashion-models` | Directory section | **C** | **Shows the whole roster, not just models** (scope bug); no H1 (h2 only); `· Tulala` title |
| Faces of Fall '26 | `/faces-of-fall-26` | Directory section | **C−** | Not a campaign — a re-skinned directory; ES/FR language links 404; AI search as primary affordance |
| Demo Forms (QA) | `/demo-forms` | Freeform (2 form blocks) | **F** | **Internal QA fixture published + indexed**; duplicate forms; unstyled white inputs on dark |
| Talent profile (Noir) | `/t/[code]` | React template + DB data | **B−** | Empty-bio hero void (≈49/55 talent); no-photo monogram boxes; "Select clients" = industry tags |
| Header (shell) | all | `public-header.tsx` (React) | **A−** | Tight. Only gap: Directory/Models not in nav (search magnifier only) |
| Footer (shell) | all non-home | Inline per-page `<footer>` | **D** | **Empty bordered bar everywhere**; no shared component; no legal/social |

**Live-verified this session:** homepage footer tagline = `Builder live-edit 01:58:54 UTC`; homepage `<title>` = "Homepage"; homepage hero image `…/talent-templates/demo/impronta-2026/band-dark.jpg` 404s locally; `/contact` + `/our-fashion-models` footers empty + titled `· Tulala`; `/our-fashion-models` has no `<h1>` (only `<h2>`).

---

## 2. Cross-cutting defects (fix once, lift many pages)

These are the highest-ROI items — each repairs a defect that recurs on multiple surfaces.

1. **Shared `<PublicSiteFooter>` that degrades gracefully.** No shared footer exists; every page hand-rolls one and all non-home pages collapse to an empty bar because `public-cms-footer.tsx:17` returns `null` with zero nav rows and Impronta has no footer-zone rows. Build one component (brand + tagline + localized copyright + Powered-by + legal + social, CMS nav as an *optional* slot) and mount on `/p`, `/directory`, `/posts`, and the homepage. *Lifts Directory, Contact, FAQ, Studio, Our Fashion Models, Faces of Fall + every future page.*
2. **Imageless heroes default to `mood=clean` + drop the over-image text-shadow when there's no background.** The editorial rule (`globals.css:371-393`, `min-height clamp(28rem,65vh,44rem)`) makes a ~65vh empty void with a muddy shadow on flat ground. *Fixes Contact + FAQ + About at once.*
3. **Emit a real `--token-color-surface`.** The registry only emits `--token-color-surface-raised`; consumers referencing `--token-color-surface` fall back to `#fafafa` (near-white) — that's the Contact light-card-on-dark bug (`token-presets.css:2758`). Emit the variable (or repoint consumers) to kill the whole light-on-dark class of bug.
4. **Theme the freeform `form` node renderer** (`render.tsx:3806-3829`) so inputs inherit theme tokens instead of white browser-default boxes on dark. Protects every real tenant page that drops a form block, not just the QA page.
5. **Make the Directory section's config knobs honest.** `hoverBehavior`, `density`, `--dir-cols-*`, extra `cardStyle` variants, several sorts, and `load_more/paged` pagination are wired into the editor but consume nothing — "fake CTAs" in the builder. The directory section powers `/directory`, `/our-fashion-models`, `/faces-of-fall-26` and future category pages.
6. **Reusable noir empty/sparse-state kit** — derived descriptor line for empty bios, editorial monogram/texture for missing photos, min-column guards. Same "thin real data looks unfinished" failure hits the homepage, directory cards, and Noir profiles (51/55 free-plan, 49/55 bio-less).
7. **Language-switcher snapshot gate.** The switcher emits `/es/*` and `/fr/*` hrefs without checking the localized snapshot exists, so they 404 on every page. Gate link emission on snapshot existence (or fall back to the homepage in that locale).
8. **Brand the metadata suffix** — override the `· Tulala` title suffix to the tenant brand so Impronta pages read `· Impronta`.

---

## 3. Production hazards found (recommend fixing first — cheap)

| # | Hazard | Where | Fix |
|---|---|---|---|
| H1 | `/demo-forms` QA fixture is **published + indexed + in sitemap** | `cms_pages` slug=`demo-forms`; sitemap gate `app/sitemap.ts:211` | Set `status` ≠ published (or `noindex` + `include_in_sitemap=false`) |
| H2 | Footer tagline = `Builder live-edit 01:58:54 UTC` (junk) | DB `…footer_tagline` → `agency-home-storefront.tsx:141` | Clear/replace the field |
| H3 | `<title>` leaks `· Tulala` on Contact, Models (and more) | `p/[[...slug]]/page.tsx` generateMetadata | Brand suffix per tenant |
| H4 | About page live typo + nav-hidden + reversed sections | `cms_pages` slug=`about` snapshot | Content edit (typo) + reorder + flip nav `visible:true` |
| H5 | Local `public/talent-templates/demo/impronta-2026/` missing → broken hero/gallery on **localhost** (prod 200s) | `public/` tree vs snapshot image paths | Reconcile local asset tree (dev-only) |

---

## 4. Missing pages (the "what's missing" answer)

All new pages should ship **editorial-noir, placeholder-ready** (noir/cream, gold `--dir-accent` CTAs, serif display headings), tight on desktop + mobile, with lorem copy + image placeholders — never empty bodies. **Do not** point footer links at marketing `/legal/*` — those 404 on the agency host.

| Priority | Page | Why it's needed | Build approach |
|---|---|---|---|
| **Must** | **Privacy** | Compliance — agency collects names/emails/phones/photos via forms (GDPR/CCPA/MX LFPDPPP). Marketing `/legal/privacy` 404s on the agency host. | `standard_page` cms_pages row, editable. Noir page header (eyebrow "LEGAL", serif H1), ~720px prose column, placeholder sections + last-updated. |
| **Must** | **Terms** | Same host-gap; real Stripe money needs booking/cancellation/usage-rights/liability terms. | Mirror Privacy. |
| **Must** | **Become a Model** | #1 supply-side conversion page, entirely absent. `(auth)/join` is the platform flow, not an Impronta landing. | Freeform `page`. Full-bleed noir hero, "What we look for" criteria, 3-step "How scouting works", gold CTA → embedded Forms block (reuse FORMS-1/2). |
| **Should** | **For Clients / How Booking Works** | Demand-side trust bridge between homepage/directory and inquiry. Core money funnel. | Freeform. Noir hero, 4-step process timeline (Browse → Inquire → We Coordinate → Shoot & Settle), trust-logo row, closing gold "Start an inquiry". |
| **Should** | **News / Editorial index** | Half-built already: `cms_posts` + revisions + RPC + `posts/[slug]` detail route all ship, but there's **no listing route** and zero posts. Cheapest high-impact win. | **Dev:** add `app/(public)/posts/page.tsx` calling the existing RPC, noir 3-up card grid, in-shell + header-nav "News". **Content:** seed 2-3 placeholder posts. |
| **Should** | **Category landings (Women / Men / New Faces)** | Directory is query-param only — no indexable per-category URLs (the high-intent SEO terms agencies rank for). | Per-category freeform rows with a hero + directory section pre-filtered to that talent_type (needs the scope fix from §2.5). |
| **Nice** | **Editorial 404** | `app/not-found.tsx` exists but is hardcoded light-cream + green, off-brand, and renders shell-less unless a `notFound` page-role is assigned. | Freeform noir row + assign `notFound` page role; existing boundary renders it in-shell. |

**Order of attack:** Privacy + Terms → Become a Model → News index route + seed posts → For Clients → category landings → 404 restyle + About-in-nav. **Seed a `footer` nav zone** (only `header` exists today) and wire every new page into both header and footer.

---

## 5. Notes on desktop vs mobile

- **Homepage** ships per-breakpoint overrides on 7 of 9 blocks; blocks 5 (About split) and 6 (Campaigns gallery) carry **zero** responsive props and lean on the implicit mobile-collapse — the 6-image gallery's mobile columns/gaps are untuned (highest mobile risk). QA at 390px.
- **Directory** is sound on mobile (2-up grid, filter sheet, scrollable pill bar) but the always-on per-card INQUIRE bar + badges add a lot of vertical chrome in a 2-up layout.
- **Empty editorial heroes** (Contact/FAQ/About) read worst on mobile, where the ~65vh void is the first thing under the header.
- **Screenshots were unavailable** this session (preview screenshot permission denied; browser tab pinned), so visual checks were done via live DOM extraction + code-level responsive analysis rather than pixel captures.

---

## 6. Work split

**Dev (code, this branch — safe, QA on localhost):** shared footer (§2.1), imageless-hero default (§2.2), `--token-color-surface` (§2.3), themed form renderer (§2.4), honest directory knobs (§2.5), noir empty-state kit (§2.6), language-switcher gate (§2.7), branded title suffix (§2.8), Our Fashion Models scope fix + h2→h1, directory grid/list toggle, News index route, editorial 404, Noir empty-bio fallback, contact-form width.

**Production data (DB — outward-facing, confirm before writing):** unpublish demo-forms, clear footer tagline, About typo/order/nav, directory heading copy, header/footer nav seeding, new Privacy/Terms/Become-a-Model/For-Clients/category pages.

**Content person (later, via builder):** real copy, real photography, testimonials, stats, ES translations.
