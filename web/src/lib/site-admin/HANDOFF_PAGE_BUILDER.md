# Handoff — Page Builder sprint

**You are the next chat.** The previous chat shipped M7, M7.1, and M8. This
doc tells you exactly where they stopped, what's live, what remains, and
the architectural contract you MUST follow so the system stays coherent.

Read this end-to-end before writing code. It's long; it saves you two
days of exploration.

---

## Part 1 — TL;DR for the impatient

**What the user wants from you**: build an admin **page builder** — a
drag-and-drop visual composer where an agency owner picks sections from a
gallery, arranges them into slots, edits each one with a form panel, and
publishes. Live preview. Section variant thumbnails. The works.

**What's already done (don't rebuild)**:
- Theme preset system (2 presets: Classic, Editorial Bridal)
- 40 agency-configurable design tokens
- 12 CMS section types with schemas + editors + render components + migrations
- Homepage composer server logic (11 slots, CAS, revisions, published snapshots)
- `AgencyHomeStorefront` render path that renders a composed snapshot
- Directory card family + profile layout family (token-driven)
- Italic-accent `{accent}text{/accent}` rich-text annotation
- Profile schema extension (12 new columns) + sticky inquiry bar
- Midnight Muse tenant wired to Editorial Bridal preset with a live 9-section homepage

**What's still missing (your sprint)**:
- **Section library gallery UI** in the composer (thumbnails, filters, click-to-add)
- **Drag-and-drop reorder** in homepage composer (`@dnd-kit` is already in deps)
- **Live preview iframe** on design + composer pages
- **Featured talent live card fetch** (currently renders a placeholder container)
- **Admin form fields** for the 12 new `talent_profiles` editorial columns
- **Inline variant thumbnails** in each section editor (not just a dropdown)
- **Empty-state onboarding** on fresh tenants (pick a preset to start)
- **Additional theme presets** (preset #3 is the architectural proof point)
- **Image picker / media library** surface (tokens + sections all reference URLs or asset IDs; asset upload UI is light)

---

## Part 2 — The architectural contract (DO NOT BREAK)

These are invariants. Everything you build must respect them.

### 2.1 Registry pattern

Four platform-owned registries. New things land by adding an entry:

1. `src/lib/site-admin/tokens/registry.ts` → `TOKEN_REGISTRY` (40 tokens)
2. `src/lib/site-admin/sections/registry.ts` → `SECTION_REGISTRY` (12 sections)
3. `src/lib/site-admin/presets/theme-presets.ts` → `THEME_PRESETS` (2 presets)
4. `src/lib/site-admin/templates/homepage/meta.ts` → `homepageMeta.slots` (11 slots)

**Rule**: new tokens/sections/presets MUST go through these registries.
Hardcoding a value outside the registry will silently work on dev and
break in the admin editor.

### 2.2 Section pattern (locked)

Every section type has exactly 5 files:

```
src/lib/site-admin/sections/<key>/
  schema.ts          # Zod schema (must have `presentation: sectionPresentationSchema` field)
  meta.ts            # SectionMeta object (key, label, description, businessPurpose, visibleToAgency)
  migrations.ts      # version migrators (empty {} for v1)
  Component.tsx      # server-rendered; reads props, spreads presentationDataAttrs()
  Editor.tsx         # "use client"; includes <PresentationPanel /> at the bottom
```

Then register in `src/lib/site-admin/sections/registry.ts`:

```ts
export const fooSection: SectionRegistryEntry<FooV1> = {
  meta: fooMeta,
  currentVersion: 1,
  schemasByVersion: fooSchemasByVersion,
  migrations: fooMigrations,
  Component: FooComponent,
  Editor: FooEditor,
};

export const SECTION_REGISTRY = {
  // ...existing...
  foo: fooSection,
} as const;
```

`ALL_SECTION_TYPE_KEYS` is derived from `SECTION_REGISTRY` via
`Object.keys()`, so new sections auto-register into the Zod allowlist.
Don't add to any other list manually.

### 2.3 Token pattern (locked)

Every token in `TOKEN_REGISTRY` has:
- `key` (dot-namespaced, e.g. `shell.header-variant`)
- `label` (admin UI)
- `scope` (one of: color, typography, spacing, radius, shadow, motion, density, icon, shell, background, template)
- `agencyConfigurable: true|false` (false = platform-only)
- `validator` (Zod — usually `z.enum([...])` or the `hexColor` regex)
- `defaultValue` (string)
- `group?` + `description?` (admin UI metadata)

Then wire in `src/lib/site-admin/tokens/resolve.ts`:
- If it's a color hex, add it to `COLOR_VAR_NAMES` (projects to `--token-color-*`)
- Otherwise add it to `DATA_ATTR_NAMES` (projects to `data-token-*` on `<html>`)

Then add a CSS rule in `src/app/token-presets.css` that consumes the
attribute. Not doing this = token edits do nothing on the storefront.

### 2.4 Presentation sub-schema (the unifier)

Every section's schema MUST include:

```ts
import { sectionPresentationSchema } from "../shared/presentation";
// ...
export const fooSchemaV1 = z.object({
  // ...content fields...
  presentation: sectionPresentationSchema,
});
```

Every Component MUST spread `presentationDataAttrs(presentation)` on its
root `<section>` element:

```tsx
import { presentationDataAttrs } from "../shared/presentation";
// ...
<section {...presentationDataAttrs(presentation)} className="site-foo">
```

Every Editor MUST include `<PresentationPanel />` at the end:

```tsx
import { PresentationPanel } from "../shared/PresentationPanel";
// ...
<PresentationPanel
  value={value.presentation}
  onChange={(next) => patch({ presentation: next })}
/>
```

The 8 controls (background/padding/container/align/divider/mobileStack/visibility) flow via data attrs → `token-presets.css` rules. DO NOT reimplement these per-section.

### 2.5 Italic-accent rich text

Any headline / copy field that wants inline italic emphasis uses the
annotation syntax: `"Curated wedding talent for {accent}timeless celebrations{/accent}."`

Render it via `renderInlineRich(input)` from
`src/lib/site-admin/sections/shared/rich-text.tsx`. Never pass raw strings
to `dangerouslySetInnerHTML` — this renderer is the only sanitizer-free
path.

### 2.6 Concurrency / lifecycle discipline

All section + page + design writes go through the Phase 5 pattern:

1. Guard `requirePhase5Capability()`
2. CAS on `agency_branding.version` or `cms_pages.version` or `cms_sections.version`
3. Emit `emitAuditEvent()`
4. Insert revision row
5. Call `updateTag(tagFor(tenantId, ...))` to bust public caches

See existing server ops in `src/lib/site-admin/server/` for the exact
pattern. Don't invent a new concurrency model. `applyThemePreset` in
`server/design.ts` is the reference for additive merges.

---

## Part 3 — Current state (verified)

### 3.1 What's live on Midnight Muse Collective (tenant `44444444-4444-4444-4444-444444444444`)

**Storefront URL**: `http://midnight.lvh.me:3106/`

**Editorial Bridal theme preset applied** (38 token values):
- Colors: espresso #4a403a primary, champagne #e8d8c3, blush #d8b7b0, sage, ink, muted, line, surface-raised
- Typography: editorial-serif (Fraunces) heading, refined-sans (Inter) body, editorial scale, editorial tracking
- Shape: lg radius, pillowy scale preset, soft shadow
- Motion: refined preset, editorial stagger
- Density: editorial spacing, editorial section-padding, editorial container
- Icons: editorial-line family
- Shell: editorial-sticky header, transparent-on-hero=on, espresso-column footer, full-screen-fade mobile nav, muse-split logo
- Background: editorial-ivory
- Template: editorial-bridal card family, editorial-bridal profile layout
- Badges: ribbon on, price on, chips-max 3
- Profile: sticky-inquiry-bar on, blocks=editorial-bridal

**Homepage composition** (9 slots published, frozen in `published_homepage_snapshot`):

| Order | Slot | Section type | Instance name |
| --- | --- | --- | --- |
| 0 | hero | hero | "Muse — hero" |
| 1 | trust_band | trust_strip | "Muse — positioning" |
| 2 | services | category_grid | "Muse — services" (8 tiles) |
| 3 | featured | featured_talent | "Muse — featured collective" |
| 4 | process | process_steps | "Muse — how booking works" |
| 5 | destinations | destinations_mosaic | "Muse — destinations" (Tulum hero + 4) |
| 6 | gallery | gallery_strip | "Muse — moments" (6 image mosaic) |
| 7 | testimonials | testimonials_trio | "Muse — testimonials" (3 accent cards) |
| 8 | final_cta | cta_banner | "Muse — final CTA" |

**Profile page** (`http://midnight.lvh.me:3106/t/TAL-00009`):
- `data-profile-shell` / `data-profile-hero` / `data-profile-section` / `data-profile-name` / `data-profile-kicker` / `data-profile-portrait` all wired
- Sticky inquiry bar rendered in DOM; shown because `profile.sticky-inquiry-bar=on`
- Blocks-visibility preset `editorial-bridal` hides ai-strip + profile-code clutter

### 3.2 Server state

Midnight tenant id: `44444444-4444-4444-4444-444444444444`
Midnight agency owner: `owner@midnightmuse.demo` / `Midnight-Muse-Owner-2026!` (agency_staff role)

**Relevant DB rows**:
- `public.agencies` — 1 row for Midnight
- `public.agency_branding` — 1 row, 38 tokens in both `theme_json` and `theme_json_draft`, `theme_preset_slug='editorial-bridal'`
- `public.cms_pages` — 1 system-owned homepage row (`template_key='homepage'`, published), `published_homepage_snapshot` has 9 slots
- `public.cms_sections` — 9 section instances for Midnight
- `public.cms_page_sections` — 9 junction rows (all `is_draft=FALSE`)
- `public.talent_profiles` — 5 native talents attached via `agency_talent_roster`

**Platform super admin**: `qa-admin@impronta.test` / `Impronta-QA-Admin-2026!` (cross-tenant access)

### 3.3 Section registry (12 types)

| Key | File dir | businessPurpose |
| --- | --- | --- |
| `hero` | `sections/hero/` | hero |
| `trust_strip` | `sections/trust_strip/` | trust |
| `cta_banner` | `sections/cta_banner/` | conversion |
| `category_grid` | `sections/category_grid/` | feature |
| `destinations_mosaic` | `sections/destinations_mosaic/` | feature |
| `testimonials_trio` | `sections/testimonials_trio/` | trust |
| `process_steps` ✨M8 | `sections/process_steps/` | feature |
| `image_copy_alternating` ✨M8 | `sections/image_copy_alternating/` | feature |
| `values_trio` ✨M8 | `sections/values_trio/` | trust |
| `press_strip` ✨M8 | `sections/press_strip/` | trust |
| `gallery_strip` ✨M8 | `sections/gallery_strip/` | feature |
| `featured_talent` ✨M8 | `sections/featured_talent/` | feature |

### 3.4 Homepage template slots (11)

From `src/lib/site-admin/templates/homepage/meta.ts`:

| Slot key | Required | Allowed types |
| --- | --- | --- |
| `hero` | ✅ | only `hero` |
| `trust_band` | — | any |
| `services` | — | any |
| `featured` | — | any |
| `process` | — | any |
| `destinations` | — | any |
| `gallery` | — | any |
| `testimonials` | — | any |
| `final_cta` | — | any |
| `primary` (legacy) | — | any |
| `secondary` (legacy) | — | any |
| `footer-callout` (legacy) | — | any |

---

## Part 4 — What YOU need to build (the page-builder sprint)

### 4.1 Section library gallery (HIGHEST PRIORITY)

**Where**: new component + insertion point in `src/app/(dashboard)/admin/site-settings/structure/`

**What it replaces**: today the composer has a text-list picker. You're building a modal/page that shows each section type + each variant as a visual card with a thumbnail.

**Key decisions**:
- **Thumbnails**: static PNGs stored in `public/section-thumbnails/<section-key>--<variant-key>.png`. One per variant. ~800×600 each. (Alternative: live-rendered iframe minis; slower + heavier. Go static.)
- **Gallery UX**: filter chips by `businessPurpose` (hero / trust / conversion / feature / promo / footer), click a card to pick variant, click "Add to slot [X]" dropdown.
- **"Add to slot" logic**: creates a new `cms_sections` row (status=`draft`), then a `cms_page_sections` row with `is_draft=TRUE` for the selected slot.

**Shape**:
```tsx
<SectionLibrary
  tenantId={scope.tenantId}
  pageId={homepagePage.id}
  currentSlotAssignments={draftSlots}
  onSectionAdded={() => /* refresh composer */}
/>
```

### 4.2 Drag-and-drop reorder in homepage composer

**Where**: `src/app/(dashboard)/admin/site-settings/structure/homepage-composer.tsx`

**Tech**: `@dnd-kit/core` + `@dnd-kit/sortable` are already in `package.json`.
Use `<DndContext>` + `<SortableContext>` per slot.

**Server call**: after a reorder, write a draft `cms_page_sections` update
that sets new `sort_order` values. Server op already exists:
`saveHomepageDraft()` in `src/lib/site-admin/server/homepage.ts`. It
accepts a full slot composition; don't invent a new RPC.

### 4.3 Live preview iframe on design + composer

**Approach**:
- Use the existing `src/lib/site-admin/preview/jwt.ts` primitives
- Mint a preview token scoped to the tenant + expiration 5 min
- Set cookie via the existing `preview/cookie.ts` + `preview/middleware.ts` — they already read the cookie and switch reads to draft tables
- iframe src: `http://{tenant-host}/?preview={jwt}`
- On token/section draft save → iframe reloads after 500ms debounce

**Gotcha**: the Next middleware already handles preview routing. Don't
reimplement — just generate the JWT and wire the iframe.

### 4.4 Inline variant thumbnails in section editors

Instead of a `<select>` for variant, render radio cards with thumbnails:

```tsx
<VariantPicker
  variants={[
    { value: "icon-row", label: "Icon row", thumbnail: "/section-thumbnails/trust_strip--icon-row.png" },
    { value: "metrics-row", label: "Metrics row", thumbnail: "..." },
    { value: "logo-row", label: "Logo row", thumbnail: "..." },
  ]}
  value={value.variant}
  onChange={(v) => patch({ variant: v })}
/>
```

Factor as a shared component in `sections/shared/VariantPicker.tsx`; every
section Editor consumes it.

### 4.5 Featured talent live card fetch

**Current state**: `featured_talent/Component.tsx` renders a **placeholder
container** with the section shell, headline, CTA, but no cards. Look at
the `{/* Placeholder grid */}` block.

**What to do**: fetch the directory data using the existing RPC that
`/directory` consumes (`getPublicDirectoryFirstPage()` in
`src/lib/directory/*`), respecting `sourceMode`:

- `auto_featured_flag` → `is_featured=TRUE` order by `featured_position`
- `auto_recent` → order by `listing_started_at DESC`
- `auto_by_service` → filter by `service_category_slug = filterServiceSlug`
- `auto_by_destination` → filter by `destinations @> ARRAY[filterDestinationSlug]`
- `manual_pick` → `WHERE profile_code IN manualProfileCodes`

Render cards using the existing `TalentCard` component (with data-attrs
already wired — card family CSS repaints them for Editorial Bridal).

### 4.6 Admin form for 12 new talent_profiles columns

**Where**: `src/app/(dashboard)/admin/talent/[id]/*` (or wherever talent edit lives today)

**Columns to expose** (from migration `20260629120000_saas_m8_talent_profile_editorial_fields.sql`):

- `intro_italic` — short text, inline hint about italic serif rendering
- `event_styles[]` — tag input or comma-separated chips
- `destinations[]` — same
- `languages[]` — same
- `travels_globally` — boolean checkbox (label: "Available for destination events")
- `team_size` — text
- `lead_time_weeks` — text
- `starting_from` — text ("From US$1,400" display-only)
- `booking_note` — textarea
- `package_teasers` — JSONB array editor; each item `{label, detail}`
- `social_links` — JSONB array editor; each item `{label, href}`
- `embedded_media` — JSONB array editor; each item `{provider: enum, url, label?}`
- `service_category_slug` — select from existing taxonomy.services

**Existing admin**: the talent edit form is under
`src/app/(dashboard)/admin/talent/*`. Find the existing field-rendering
pattern (likely a schema-driven form using Zod). Add these fields in the
same style; use `sections/shared/PresentationPanel.tsx` as a reference for
the collapsible detail-block pattern.

### 4.7 Second theme preset (optional but recommended)

Prove the architecture by shipping a **third** preset (or a second new
one beyond Editorial Bridal). Suggested:

- **`studio-minimal`** — monochrome, sans display, dense grid, sharp radii
- **`creator-social`** — bold colors, carousel-forward, playful radii
- **`wellness-calm`** — botanical palette, serif body, rounded-soft radii

Add one JSON-like entry to `src/lib/site-admin/presets/theme-presets.ts`.
All 40 tokens need values. Then add CSS blocks for any new enum values
you introduce (e.g. `background.mode=botanical-green`).

### 4.8 Empty-state onboarding

**Where**: `src/app/(dashboard)/admin/site-settings/structure/` when no
`cms_pages` row exists for the tenant.

**Design**: full-page prompt, 2 preset picker cards (Classic + Editorial
Bridal), click → apply preset + seed homepage composition + redirect back
to composer.

**Server op**: create a new `seedHomepageComposition()` function that:
1. Inserts `cms_pages` row (homepage template, system-owned)
2. Inserts default section instances (hero minimum, or a full starter set per preset)
3. Inserts page_sections junction rows
4. Rebuilds the `published_homepage_snapshot`
5. Applies the preset tokens via `applyThemePreset()`

Reuse the shapes from the SQL seeds that already exist in
`/tmp/seed-midnight-muse-homepage.sql` + `/tmp/seed-midnight-extended.sql`
— they're the reference compositions.

### 4.9 Image picker / media library

**Current state**: every image field in every section is a URL input.
Works but is admin-hostile.

**What to build**: a `MediaPicker` component that:
1. Lists media assets from Supabase Storage for the tenant
2. Upload button (calls existing media upload flow if one exists; otherwise add one)
3. Selects an asset and returns its public URL (for URL fields) or asset ID (for `backgroundMediaAssetId` fields)

Check `src/lib/media/*` for existing upload/list helpers. If none, start
with a minimal storage bucket + `asset_media` table.

---

## Part 5 — Files you'll touch (map)

```
src/lib/site-admin/
├── tokens/
│   ├── registry.ts             ← add new tokens here
│   └── resolve.ts              ← add data-attr / CSS-var mappings here
├── presets/
│   └── theme-presets.ts        ← add new theme presets here
├── sections/
│   ├── registry.ts             ← register new section types here
│   ├── shared/
│   │   ├── presentation.ts     ← SectionPresentation schema + data-attr projector
│   │   ├── PresentationPanel.tsx ← shared editor panel
│   │   └── rich-text.tsx       ← {accent}text{/accent} renderer
│   ├── hero/                   ← existing section
│   ├── trust_strip/            ← existing section
│   ├── cta_banner/             ← existing section
│   ├── category_grid/          ← existing section
│   ├── destinations_mosaic/    ← existing section
│   ├── testimonials_trio/      ← existing section
│   ├── process_steps/          ← M8 section
│   ├── image_copy_alternating/ ← M8 section
│   ├── values_trio/            ← M8 section
│   ├── press_strip/            ← M8 section
│   ├── gallery_strip/          ← M8 section
│   └── featured_talent/        ← M8 section (PLACEHOLDER — needs live fetch)
├── templates/
│   └── homepage/
│       └── meta.ts             ← 11 homepage slots defined here
├── server/
│   ├── design.ts               ← saveDesignDraft, publishDesign, applyThemePreset, restoreRevision
│   ├── homepage.ts             ← saveHomepageDraft, publishHomepage, HomepageSnapshot type
│   ├── homepage-reads.ts       ← loadPublicHomepage (cached)
│   ├── pages.ts                ← CMS non-homepage page CRUD
│   ├── branding.ts             ← M1 branding basics (logo/favicon/colors)
│   └── reads.ts                ← loadPublicBranding, loadPublicIdentity
├── preview/
│   ├── jwt.ts                  ← signing/verifying preview tokens
│   ├── cookie.ts               ← PREVIEW_COOKIE_NAME
│   └── middleware.ts           ← readPreviewFromRequest, previewMatchesTenant

src/app/(dashboard)/admin/site-settings/
├── design/                     ← design token editor (grouped forms)
│   ├── page.tsx
│   ├── design-editor.tsx
│   ├── theme-preset-picker.tsx ← preset swatch cards
│   └── actions.ts              ← saveDesignDraftAction, applyThemePresetAction, etc.
├── structure/                  ← homepage composer (YOUR MAIN WORK AREA)
│   ├── page.tsx
│   └── homepage-composer.tsx   ← THE FILE YOU'LL EXTEND MOST
├── sections/                   ← section instance CRUD
│   ├── page.tsx                ← list all section instances
│   ├── new/page.tsx            ← create new section
│   └── [id]/page.tsx           ← edit individual section (renders that type's Editor)
├── identity/                   ← brand name, tagline, contact
├── branding/                   ← logo/favicon/colors (M1, pre-token system)
├── pages/                      ← non-homepage CMS pages
├── navigation/                 ← site nav (if exposed)
├── content/                    ← content hub index
├── audit/                      ← audit log viewer
├── seo/                        ← empty stub; hook if needed
└── system/                     ← empty stub

src/app/
├── page.tsx                    ← host dispatcher (agency/hub/marketing/app)
├── layout.tsx                  ← root layout (fonts, tokens on <html>, preview banner)
├── globals.css
├── token-presets.css           ← EVERY token/presentation CSS rule lives here
└── t/[profileCode]/page.tsx    ← profile page (has data-profile-* attrs)

src/components/
├── home/
│   ├── agency-home-storefront.tsx ← tenant homepage render (hasCmsComposition branch)
│   └── homepage-cms-sections.tsx  ← renders HomepageSnapshot slots
├── directory/
│   └── talent-card.tsx            ← directory card (has data-card-* attrs for family CSS)
└── public-header.tsx              ← shell header (reads data-token-shell-*)

supabase/migrations/
├── 20260620150000_saas_p5_m6_design_controls.sql
├── 20260628120000_saas_m7_theme_presets.sql
└── 20260629120000_saas_m8_talent_profile_editorial_fields.sql

docs/
├── M7_SITE_BUILDER.md              ← sprint 1 report
├── M7_1_SPRINT_REPORT.md           ← sprint 2 report
├── ADMIN_VERIFICATION_GUIDE.md     ← 4-browser test plan (sprint 2)
├── M8_ADMIN_BUILDER_EXECUTION_PLAN.md  ← the plan this sprint executed
├── M8_SHIPPED.md                   ← what sprint 3 shipped (read this)
└── HANDOFF_PAGE_BUILDER.md         ← this file
```

---

## Part 6 — Gotchas / learnings (things that bit me)

### 6.1 `unstable_cache` is sticky

Next's `unstable_cache` persists across dev server restarts (stored under
`.next/cache`). If you update a DB row out-of-band (e.g. via SQL) without
calling `updateTag(tagFor(tenantId, "branding"))`, the storefront serves
stale data. Two fixes:
1. Always go through the server action — it calls `updateTag`.
2. For SQL shortcuts during dev: `rm -rf web/.next && restart`.

### 6.2 Host registration / dev hosts

Middleware checks `agency_domains` on every request. `lvh.me` subdomains
are all registered:
- `app.lvh.me` (kind: app)
- `midnight.lvh.me` (kind: subdomain, tenant: Midnight)
- `marketing.lvh.me` / `lvh.me` (kind: marketing)
- `hub.lvh.me` (kind: hub)

`/prototypes/muse-bridal` is allow-listed on every host kind (see
`src/lib/saas/surface-allow-list.ts` — `PROTOTYPE_PREFIX`).

### 6.3 Admin login flow

The owner account needs:
- `auth.users` row (exists)
- `public.profiles` row with `app_role='agency_staff'`, `account_status='active'`, `onboarding_completed_at != null`
- `public.agency_memberships` row with `role='owner'|'admin'` for the tenant

If any of these are missing, login redirects to `/onboarding/role`.
`scripts/reset-midnight-owner.mjs` is a reset helper.

### 6.4 Tenant switcher is read-only with 1 membership

`components/admin/agency-switcher.tsx` falls through to a read-only label
when `tenants.length <= 1`. Multi-tenant staff (or super_admin with
synthetic memberships for every agency) see the popover.

### 6.5 The `editorial-ivory` background mode aliases legacy vars

When a tenant picks Editorial Bridal, `token-presets.css` **bridges the
legacy `--impronta-*` and shadcn `--background/--primary/--secondary`
CSS vars** to the editorial palette. This is why the existing public
header/directory/profile repainted without needing every component to
migrate to `--token-color-*` vars.

Rule: always test both presets when making CSS changes. Classic must not
regress.

### 6.6 Image URLs fail silently

Many Unsplash photo IDs I used 404'd. The img tag renders empty; the
CSS fallback (champagne background) is intentional graceful degradation.
When you ship the media library, validate URLs on save.

### 6.7 Next.js 16 webpack (not Turbopack for dev)

Dev script: `npm run dev` → `next dev --webpack -p ${PORT:-3000}`.
Don't assume Turbopack behavior. Client components must have `"use client"`
at the top. Server-component imports of client-only libraries = runtime error.

### 6.8 CSP `img-src https:` — Unsplash images work

Content-Security-Policy in `next.config.ts` allows any https image source.
If you switch to a different CDN, verify it's reachable.

### 6.9 Chrome-in-Chrome MCP bridge is unreliable

The Chrome MCP was offline from my session throughout. Use Claude Preview
(also an MCP) for browser automation — it's reliable. Or guide the user
to run tests in their own Chrome.

### 6.10 No screenshots (user preference)

The user explicitly said "please don't take any chrome screenshot at this
chat." Respect it. Verify via HTTP + DB + typecheck + explicit curl greps.

---

## Part 7 — How to verify each piece works

### 7.1 Storefront renders composition

```bash
curl -sH "Host: midnight.local" http://127.0.0.1:3000/ \
  | grep -oE "site-[a-z-]+" | sort | uniq -c
```

Should show all 9 section classes (`site-hero`, `site-trust-strip`,
`site-category-grid`, `site-featured-talent`, `site-process-steps`,
`site-destinations-mosaic`, `site-gallery`, `site-testimonials-trio`,
`site-cta-banner`).

### 7.2 All tokens flow to <html>

```bash
curl -sH "Host: midnight.local" http://127.0.0.1:3000/ \
  | grep -oE 'data-token-[a-z-]+="[^"]+"' | sort | uniq
```

Should show ~20 data-token attrs.

### 7.3 Profile page markers

```bash
curl -sH "Host: midnight.local" http://127.0.0.1:3000/t/TAL-00009 \
  | grep -oE 'data-profile-[a-z-]+' | sort | uniq
```

Should show: `data-profile-shell`, `data-profile-hero`,
`data-profile-name`, `data-profile-kicker`, `data-profile-portrait`,
`data-profile-section`, `data-profile-sticky-bar`.

### 7.4 Typecheck

```bash
cd web && npx tsc --noEmit 2>&1 | grep -v "dev-revalidate"
```

Must be empty output. Pre-existing error in `dev-revalidate/route.ts` is
known; ignore it.

### 7.5 DB state

```bash
# Tenant's section instances
node scripts/run-sql.mjs <<< \
  "SELECT section_type_key, name FROM public.cms_sections WHERE tenant_id='44444444-4444-4444-4444-444444444444';"

# Snapshot slots
node scripts/run-sql.mjs <<< \
  "SELECT jsonb_array_length(published_homepage_snapshot->'slots') FROM public.cms_pages WHERE tenant_id='44444444-4444-4444-4444-444444444444' AND is_system_owned=TRUE;"
```

---

## Part 8 — Dev server management

Three ports used:
- **3000** — Next.js dev (`npm run dev` in `web/`)
- **3102** — `app.local` proxy (`scripts/local-host-proxy.mjs 3102 app.local`)
- **3106** — `midnight.local` proxy (`scripts/local-host-proxy.mjs 3106 midnight.local`)

Configured in `.claude/launch.json`. Use `preview_start` MCP (Claude
Preview) or `npm run dev` manually.

Nuke cache: `rm -rf web/.next` + restart.

---

## Part 9 — The product vision (why this matters)

**The user's goal**: an agency owner — non-technical, paid customer — can
log in, pick a theme preset, compose a homepage from a visual section
library, edit text, upload images, publish, and have the live public
storefront match the quality of the Muse Bridal prototype at
`http://app.lvh.me:3102/prototypes/muse-bridal`.

**The platform vision**: multiple vertical demos (bridal, creator, studio,
staffing, wellness) all built on the same registries, each one a theme
preset + a section library subset + optional new section/variant types.

**The business driver**: this is a paid SaaS; admin UX quality is the
product. If the owner can't reproduce the design without a developer, we
don't ship.

Your sprint is the one that crosses the threshold from "architecturally
sufficient" to "operationally usable."

---

## Part 10 — Priority order for your sprint

If I had to sequence the work:

1. **Featured talent live card fetch** (half-day, unblocks the current Midnight homepage — the featured slot is a placeholder right now)
2. **Section library gallery UI** (1–2 days, highest admin UX leverage)
3. **Drag-and-drop reorder in composer** (half-day, @dnd-kit is ready)
4. **Live preview iframe** (1 day, preview JWT plumbing exists)
5. **Inline variant thumbnails in section editors** (half-day after library lands)
6. **Admin form for 12 new talent_profiles columns** (half-day; extends existing talent form)
7. **Empty-state onboarding** (half-day)
8. **Theme preset #3** (half-day; mostly JSON + CSS block)
9. **Media library / image picker** (1–2 days; starts new storage pattern if missing)

Total: ~6–8 days of focused work to close the gap between today's state
and "owner materially reproduces the prototype via dashboard alone."

---

## Part 11 — Don't do these things

1. **Don't rewrite `talent-card.tsx` or `profile/page.tsx`** — they have data-attrs now; CSS does the family-variant work. Rewrite risks regressing the dark-mode directory view.
2. **Don't build a new concurrency model** — CAS-on-version is the pattern. Adding optimistic locking or CRDTs is a different product.
3. **Don't ship a full Lexical/Slate rich-text editor yet** — `{accent}...{/accent}` parser is the agreed MVP (Part 11 of the execution plan, approved). A real editor is a dedicated 1-week sprint.
4. **Don't add new platform hosts (agency_domains rows) for testing** — `lvh.me` subdomains already work.
5. **Don't migrate to Turbopack** — `npm run dev` uses webpack (`--webpack` flag). Turbopack migration is out of scope.
6. **Don't delete legacy storefront components** (`FeaturedTalentSection`, `HowItWorks`, etc.) — they're the fallback for tenants without CMS composition.
7. **Don't assume `@dnd-kit` is integrated yet** — it's in deps but not wired. You need to wire it.
8. **Don't invent new section types without registering them** — ALL_SECTION_TYPE_KEYS is derived from SECTION_REGISTRY. Skipping registry = Zod save fails.
9. **Don't use `!important` in CSS unless you have to** — the presentation CSS uses it for unavoidable Tailwind-class overrides. Don't spray it elsewhere.
10. **Don't skip the Presentation panel in new section Editors** — every section MUST have it.

---

## Part 12 — Opening moves for the new chat

Before writing any code:

1. `cat web/src/lib/site-admin/M8_SHIPPED.md` — the previous sprint's output
2. `cat web/src/lib/site-admin/M8_ADMIN_BUILDER_EXECUTION_PLAN.md` — the full plan
3. `ls web/src/lib/site-admin/sections/` — confirm 12 dirs exist
4. Read one new section end-to-end (`process_steps/` is the cleanest) to internalize the pattern
5. Check admin is reachable: `curl -sH "Host: app.local" http://127.0.0.1:3000/admin/site-settings/design -o /dev/null -w "%{http_code}"` should return 307 (auth redirect, i.e. route exists)
6. Read `src/app/(dashboard)/admin/site-settings/structure/homepage-composer.tsx` — this is your main work area
7. Sit with the prototype open in one tab (`http://app.lvh.me:3102/prototypes/muse-bridal`) and the live demo in another (`http://midnight.lvh.me:3106/`) — the delta between them is the spec

Then pick a task from Part 10 and ship.

---

## Part 13 — Contact the previous chat's thinking

The approved product calls from M8 Part 11:

1. **Italic-accent rich text**: ship lightweight `{accent}text{/accent}` parser (DONE); Lexical editor deferred.
2. **Section library thumbnails**: static PNGs in `public/section-thumbnails/` (NOT DONE — your job).
3. **Profile block visibility**: admin-set per-tenant (DONE); per-profile override is later.

Key design principles already embedded in the system:
- Registries over hardcoding
- Data-attrs over component-level variant logic
- Tokens over per-component CSS
- Optional schema fields for backward compat
- CAS + revisions for every write
- Cache busting via `updateTag` tied to tenant + surface

If you follow those, your additions will feel native. If you fight them,
you'll add complexity the architecture already solves.

---

**End of handoff. Good luck.**
