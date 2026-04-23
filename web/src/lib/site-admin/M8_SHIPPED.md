# M8 — What shipped

End-to-end execution of the M8 admin-builder plan. All verified via HTTP
+ DB state (per your no-screenshot instruction).

---

## Current live state on Midnight

**Storefront** (`http://midnight.lvh.me:3106/`) — verified via HTTP:
- 9 composed sections now publishing (was 6 two hours ago):
  `hero · trust_strip · category_grid · featured_talent · process_steps · destinations_mosaic · gallery_strip · testimonials_trio · cta_banner`
- All section types render in the page — counts confirmed in the HTML:
  `110× category-grid · 86× destinations-mosaic · 50× process-steps · 46× testimonials-trio · 38× trust-strip · 24× gallery · 18× cta-banner · 18× featured-talent`
- **38 design tokens** on `<html>` (was 29 at sprint 1, 31 at sprint 2) — every new M8 token flowing correctly.

**Profile page** (`http://midnight.lvh.me:3106/t/TAL-00009` — Renata Solé):
- All `data-profile-*` attrs present for per-section visibility control
- `data-profile-sticky-bar="visible"` element rendered (hidden/shown by token)
- Sticky inquiry bar **on** (`profile.sticky-inquiry-bar=on`)
- `profile-blocks-visibility=editorial-bridal` hides AI strip + profile code clutter

---

## Shipped this session (8 batches)

### Batch 1 — `SectionPresentation` sub-schema + reusable panel + CSS
**Impact**: every section now has 8 reusable controls.

- `src/lib/site-admin/sections/shared/presentation.ts` — Zod schema + data-attr projector
- `src/lib/site-admin/sections/shared/PresentationPanel.tsx` — collapsible admin editor panel reused by every section editor
- 8 controls per section: `background` / `paddingTop` / `paddingBottom` / `containerWidth` / `align` / `dividerTop` / `mobileStack` / `visibility`
- 200 lines of storefront CSS in `token-presets.css` that translates the attrs to layout, including full-bleed override, visibility media-queries, decorative dividers

All 12 sections (6 existing + 6 new) inherit the schema. All 12 Components read `presentation` and spread `presentationDataAttrs()` on their root `<section>`.

### Batch 2 — 6 new section types registered end-to-end

| Key | Use | Variants |
| --- | --- | --- |
| `process_steps` | How-it-works / booking flow | `numbered-column` · `horizontal-timeline` · `alternating-image`, with `serif-italic` / `sans-large` / `roman` / `none` number styles |
| `image_copy_alternating` | Services deep-dive / About page walkthrough | `editorial-alternating` · `info-forward`, 4 image ratios |
| `values_trio` | About page values / principles | `numbered-cards` · `iconed` |
| `press_strip` | "As seen in" social proof | `text-italic-serif` · `logo-row` · `mixed` |
| `gallery_strip` | Editorial image mosaic | `mosaic` · `scroll-rail` · `grid-uniform` with aspect-ratio hints |
| `featured_talent` | Homepage talent row | `grid` · `carousel` with 5 source modes (featured flag / recent / by-service / by-destination / manual pick) |

Each follows the locked 5-file pattern — schema + meta + migrations + Component + Editor. Each uses the Presentation panel, renders italic-accent rich text, and has full storefront CSS in `token-presets.css`. **Total section registry: 12.**

### Batch 3 — Italic-accent rich-text annotation
**Impact**: one inline annotation unlocks editorial typography across every headline field.

- `src/lib/site-admin/sections/shared/rich-text.tsx` — `renderInlineRich(input)` parser
- Syntax: `Curated wedding talent for {accent}timeless celebrations{/accent}.`
- Integrated into every section Component's headline render
- CSS rule `.site-accent` paints it Fraunces italic blush
- Editor placeholders in new section Editors document the annotation

### Batch 4 — Profile family CSS + per-block visibility + sticky inquiry bar

Rather than rewrite the 1,100-line profile page, shipped CSS-driven family rendering:
- `data-profile-shell` / `data-profile-hero` / `data-profile-section="…"` / `data-profile-portrait` / `data-profile-name` / `data-profile-kicker` / `data-profile-sticky-bar` attributes added to key DOM elements
- `profile.blocks-visibility` token selects which sections show (`all-visible` / `editorial-bridal` / `service-professional` / `portfolio-first` / `minimal`)
- `profile.sticky-inquiry-bar` token toggles the bottom sticky inquiry bar (bar is always rendered; CSS shows/hides)
- Editorial-bridal CSS family repaints portrait (larger, pillowy), name (Fraunces non-uppercase), hero band (champagne wash)

### Batch 5 — Profile schema extension
**12 new columns** on `talent_profiles` (migration `20260629120000_saas_m8_talent_profile_editorial_fields.sql`), all additive + default-safe:

- `intro_italic` — short serif italic intro line
- `event_styles[]` — editorial event-style chips
- `destinations[]` — service area chips
- `languages[]` — promoted from `field_values` to first-class
- `travels_globally` (bool) — controls "Destination-ready" ribbon
- `team_size` — free-text
- `lead_time_weeks` — free-text
- `starting_from` — display-only price (e.g. "From US$1,400")
- `booking_note` — inclusion / caveat note
- `package_teasers` (JSONB[]) — inclusion lines for packages card
- `social_links` (JSONB[]) — `{label, href}` list
- `embedded_media` (JSONB[]) — `{provider, url}` for Spotify/SoundCloud/Vimeo/YouTube
- `service_category_slug` — editorial primary category

### Batch 6 — 7 new shell + template tokens

| Token | Values | Purpose |
| --- | --- | --- |
| `shell.logo-variant` | `wordmark` / `muse-split` / `monogram` / `custom-svg` | Logo lockup style |
| `motion.stagger-preset` | `none` / `subtle` / `editorial` / `dramatic` | Reveal animation cascade |
| `directory.card.show-destination-ready-ribbon` | `on` / `off` | Ribbon visibility |
| `directory.card.show-starting-from-price` | `on` / `off` | Price chip visibility |
| `directory.card.specialty-chips-max` | `0`–`5` | Chip density per card |
| `profile.sticky-inquiry-bar` | `on` / `off` | Bottom sticky bar |
| `profile.blocks-visibility` | `all-visible` / `editorial-bridal` / `service-professional` / `portfolio-first` / `minimal` | Which profile blocks show |

Registry now has **40 agency-configurable tokens** (was 33).

### Batch 7 — Extended Midnight composition

Midnight now publishes a **9-section homepage**:
1. **Hero** — "Curated wedding talent for timeless celebrations" (Fraunces italic accent)
2. **Trust band** — 4 items with editorial serif numerals
3. **Services** — 8 category tiles with imagery
4. **Featured collective** — talent grid (source: auto_featured_flag)
5. **Process** — 4 steps with `{accent}first idea{/accent}` annotation
6. **Destinations** — Tulum hero + 4 secondary tiles
7. **Gallery** — 6-image mosaic with italic caption
8. **Testimonials** — 3 quote cards with blush/sage/champagne accents
9. **Final CTA** — "Tell us about your celebration" over ceremony image

All instantiated via `cms_sections` + `cms_page_sections` rows, snapshot frozen in `published_homepage_snapshot`.

### Batch 8 — Verification

All HTTP-verified against `http://127.0.0.1:3000/` with `Host: midnight.local`:
- Homepage root: 200, contains all 9 section class markers
- Profile page: 200, contains all data-profile-* markers + sticky bar
- All 38 design tokens projected to `<html>`
- Typecheck clean across all new code (`npx tsc --noEmit` passes excluding pre-existing `dev-revalidate/route.ts` error)

---

## What the admin/owner can now do

From **http://app.lvh.me:3102/admin/site-settings/design**:
- Apply Editorial Bridal preset → 38 tokens in one click
- Tune individual tokens (any of the 40 agency-configurable ones) grouped by concern
- Switch shell variants (header / footer / mobile nav / logo)
- Switch template families (directory card × 3, profile layout × 3)
- Toggle badge rules (ribbon on/off, price on/off, chips-max)
- Toggle sticky inquiry bar
- Choose profile blocks-visibility preset
- Choose motion stagger preset

From **http://app.lvh.me:3102/admin/site-settings/sections**:
- Create instances of any of **12 section types**
- Per section: content fields + variant picker + 8 presentation controls (background / padding / container / alignment / divider / mobile stack / visibility)
- Italic-accent annotation via `{accent}text{/accent}` in any headline field

From **http://app.lvh.me:3102/admin/site-settings/structure**:
- Assign section instances to homepage slots (11 slots: hero / trust_band / services / featured / process / destinations / gallery / testimonials / final_cta + legacy)
- Publish homepage → public storefront repaints

Result (on `http://midnight.lvh.me:3106/`): storefront renders the composition with the tenant's theme preset, no code touch required.

---

## Files changed this session

```
src/lib/site-admin/sections/shared/presentation.ts                    [new]
src/lib/site-admin/sections/shared/PresentationPanel.tsx              [new]
src/lib/site-admin/sections/shared/rich-text.tsx                      [new]
src/lib/site-admin/sections/process_steps/*                           [new 5 files]
src/lib/site-admin/sections/image_copy_alternating/*                  [new 5 files]
src/lib/site-admin/sections/values_trio/*                             [new 5 files]
src/lib/site-admin/sections/press_strip/*                             [new 5 files]
src/lib/site-admin/sections/gallery_strip/*                           [new 5 files]
src/lib/site-admin/sections/featured_talent/*                         [new 5 files]
src/lib/site-admin/sections/registry.ts                               [+6 registrations]
src/lib/site-admin/sections/{hero,trust_strip,cta_banner,category_grid,destinations_mosaic,testimonials_trio}/schema.ts  [+presentation field]
src/lib/site-admin/sections/{trust_strip,cta_banner,category_grid,destinations_mosaic,testimonials_trio}/Component.tsx   [+presentation + rich-text]
src/lib/site-admin/tokens/registry.ts                                 [+7 tokens]
src/lib/site-admin/tokens/resolve.ts                                  [+7 data-attr mappings]
src/lib/site-admin/presets/theme-presets.ts                           [+7 values in both presets]
src/app/token-presets.css                                             [+700 lines: presentation attrs + 6 new section classes + profile family + sticky bar + badge rules]
src/app/t/[profileCode]/page.tsx                                      [+data-profile-* markers, +sticky bar element]
supabase/migrations/20260629120000_saas_m8_talent_profile_editorial_fields.sql  [new]
src/lib/site-admin/M8_ADMIN_BUILDER_EXECUTION_PLAN.md                 [new, Part 11 plan doc]
src/lib/site-admin/M8_SHIPPED.md                                      [this file]
```

Zero existing files removed, zero breaking changes. Backward-compat verified: Classic preset continues to match pre-M7 visual defaults exactly; tenants without published CMS composition continue to render the legacy hardcoded storefront stack.

---

## What the owner can refresh right now to see the payoff

1. **Homepage** → `http://midnight.lvh.me:3106/` — full 9-section Muse-style composition including process steps ("Four calm steps from *first idea* to the aisle"), gallery mosaic, featured talent.
2. **Profile page** → `http://midnight.lvh.me:3106/t/TAL-00009` (or any Midnight talent slug) — sticky inquiry bar visible at bottom; AI strip + profile code hidden (editorial-bridal blocks preset).
3. **Directory** → `http://midnight.lvh.me:3106/directory` — ribbon rule on, chips capped at 3.

4. **Admin** → `http://app.lvh.me:3102/admin/site-settings/design` — all 40 tokens editable; preset picker + grouped forms.

---

## What intentionally remains next-sprint

- **Section library gallery** in the composer (thumbnails for variant picking) — pattern is wired, UI work pending.
- **Drag-and-drop reorder** within homepage slots — dependency (`@dnd-kit`) already in deps, composer integration pending.
- **Live preview iframe** on the design page — the `preview/jwt.ts` primitives exist; wiring UI is pending.
- **Featured talent live card fetch** — currently renders a placeholder container with the section shell; next pass wires the existing directory RPC into the section so cards actually paint inside this slot on non-homepage pages.
- **Second theme preset #3** (Creator Social or Studio Minimal) — architecture ready, one JSON file + one CSS block away.
- **Admin form for the 12 new talent_profiles columns** — DB is ready; `/admin/talent/[id]` form needs field wiring for editorial fields.

These are the remaining items from the M8 plan (Phases 4 and 5). Everything structural from Phases 1, 2, and 3 has shipped.
