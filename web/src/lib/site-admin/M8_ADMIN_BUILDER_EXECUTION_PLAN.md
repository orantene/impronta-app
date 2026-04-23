# M8 — Admin Builder Execution Plan
**Prototype → Live Tenant via admin, and the foundation to scale to many demos.**

---

## TL;DR

- The architecture you already have is **sufficient** to reproduce Muse Bridal from admin. The work from here is **filling in fields, adding 5–6 missing section types, and polishing the admin builder UX** — not re-architecting.
- The **biggest single unlock** is a `SectionPresentation` block (background / padding / container width / alignment) that every section type inherits — **one change, all sections get a consistent, configurable presentation layer**.
- Profile pages are the largest remaining visual gap; the token is wired, the render switch is not yet structured.
- There's a clear, five-phase path from today's state to "owner clicks-through the Muse design in under 30 minutes" — and the same path produces the scaffolding for preset #3, #4, #5.

---

## Part 0 — Current-state snapshot (grounded)

### What already ships (operator-configurable today)
- **Theme preset picker**: Classic + Editorial Bridal, applies 30+ tokens in one click.
- **33 agency-configurable tokens**: palette (10), typography (5), shape (3), motion (1), density (3), icon family, shell variants (5), background mode, template families (2).
- **6 registered CMS section types**: hero, trust_strip, category_grid, destinations_mosaic, testimonials_trio, cta_banner. Each has a schema + editor + component + migrations.
- **Homepage composer with 11 slots** (hero, trust_band, services, featured, process, destinations, gallery, testimonials, final_cta, plus 3 legacy).
- **Storefront CMS-composition branch** (replaces legacy stack when non-hero slots are published).
- **Directory card family switch** (classic, service-professional, editorial-bridal) — tokenized.
- **Profile layout family switch** — token wired + first CSS overrides shipped; component-level variant selection still basic.
- **Revision history + draft/publish discipline** on design tokens + CMS sections + homepage composition.

### What's hardcoded (not reachable from admin today)
- Many "editorial" details the prototype relies on: italic-accent rich text, numeric serif accents, quote icons, specialty/event-style chip rules, profile block visibility, card ribbon rules, gallery aspect-ratio hints, header scroll threshold, reveal-stagger presets.
- Profile page **layout variants** (only light CSS right now — full block reorder, per-block visibility, portfolio mosaic pattern, sticky CTA bar toggle are not admin-controllable yet).
- **Section-level presentation** (background, padding, container width, alignment) — each section hardcodes its own.
- 5–6 section types the prototype uses that don't yet exist in the registry: `process_steps`, `image_copy_alternating`, `values_trio`, `press_strip`, `gallery`, `inquiry_form`, `featured_talent` (the current `hero` handles some of these, but not as dedicated blocks).

### The pattern the plan extends
- **Registry pattern is the right primitive.** `TOKEN_REGISTRY`, `SECTION_REGISTRY`, `THEME_PRESETS`, `SHELL_VARIANTS` all follow the same Zod-validated, CAS-safe, revision-logged pattern. Every piece below plugs into these — no new system needed.

---

## Part 1 — Target state (what "done" looks like)

**The test**: a new agency owner lands in admin, has never seen the codebase, and in under **30 minutes** of clicking can produce a site that is **visually 90% of the Muse Bridal prototype**, including homepage, directory, and profile pages.

To pass that test they need, from admin alone:
1. Pick **Editorial Bridal** theme preset → done in one click.
2. Upload **logo + favicon + cover photography** → existing branding UI, add a Bridal-ready asset library helper.
3. Compose the **homepage** from a section library: pick 6–8 sections, fill content, arrange via drag, publish.
4. Customize **per-section presentation**: background, padding, container width, variant — all from each section's editor.
5. Pick **directory card family** + **profile layout family** → already exists.
6. Configure the **profile layout**: which blocks show, section order, specialty chip style, sticky CTA bar on/off.
7. See a **live preview** of every change before publish.
8. Understand **what each control does** (inline hints, preview thumbnails, sensible defaults).

**Everything else** (SEO, inquiry form fields, testimonials library, etc.) can follow. This is the minimum "Muse reproducible by admin" bar.

---

## Part 2 — The gap analysis, consolidated

Four buckets of work. Priority order inside each.

### Bucket A — Section-level presentation controls (biggest ROI)
Every section today hardcodes its background / padding / container width / alignment. Adding a shared `SectionPresentation` sub-schema that every section registry entry inherits gives admins **per-section layout control on every section type at once**.

| Control | Values | Applies to |
|---|---|---|
| `presentation.background` | `canvas` \| `ivory` \| `champagne` \| `espresso` \| `blush` \| `sage` \| `custom` (+ color picker) | all sections |
| `presentation.padding_top` | `none` \| `tight` \| `standard` \| `airy` \| `editorial` | all sections |
| `presentation.padding_bottom` | same enum | all sections |
| `presentation.container_width` | `narrow` \| `standard` \| `wide` \| `editorial` \| `full-bleed` | all sections |
| `presentation.alignment` | `left` \| `center` \| `right` | sections with headline/copy |
| `presentation.divider_top` | `none` \| `thin-line` \| `gradient-fade` \| `decorative` | all sections |
| `presentation.mobile_stack` | `default` \| `single-column` \| `horizontal-scroll` | grids/mosaics |
| `presentation.visibility` | `always` \| `desktop_only` \| `mobile_only` \| `hidden` | all sections |

**Impact**: one 200-line change in `sections/types.ts` + the admin section editor → every section gets 8 new controls, immediately.

### Bucket B — Missing section types (to complete Muse)
Six new section types needed for 90% prototype coverage. Each follows the locked 5-file pattern (`schema.ts` / `meta.ts` / `migrations.ts` / `Component.tsx` / `Editor.tsx`):

1. **`process_steps`** — 3–4 numbered cards (01/02/03/04 serif italic) with layout variants (numbered-column / horizontal-timeline / alternating-image).
2. **`image_copy_alternating`** — one section that renders N items, each alternating image left/right. Used on Services page in prototype.
3. **`values_trio`** — 3-card values block. Used on About page.
4. **`press_strip`** — horizontal publication name / logo strip. Used on About page.
5. **`gallery_strip`** — editorial image mosaic with aspect-ratio cycling (wide/tall/square) and optional caption.
6. **`featured_talent`** — explicitly surfaces the directory card family on the homepage with source modes (manual pick, auto by service, auto by destination, featured flag).

Each ~2 hours mechanical work with the pattern locked.

### Bucket C — Profile page family render
The biggest single missing surface. Three pieces:

1. **Layout variants** as components (not just CSS overrides):
   - `classic` — current page as-is
   - `service-professional` — info-forward, packages prominent
   - `editorial-bridal` — portrait hero + specialties + packages + sticky CTA bar + related pros
2. **Per-block visibility toggles** (`profile.blocks.*`): hero / about / specialties / event_styles / portfolio / travel / packages / testimonials / related / sticky_cta. Each: `always` \| `if_not_empty` \| `hidden`. Admin-editable, per-tenant.
3. **Profile schema extension** — add the fields Muse needs but the platform lacks:
   - `intro_italic` (text)
   - `event_styles[]` (taxonomy, new table or reuse `talent_profile_taxonomy`)
   - `travels_globally` (bool)
   - `team_size` (text)
   - `lead_time_weeks` (range/text)
   - `starting_from` (text — display-only price hint)
   - `booking_note` (text)
   - `package_teasers[]` (array of inclusion lines)
   - `social_links[]` ({label, href}[])
   - `embedded_media[]` ({provider: spotify/soundcloud/vimeo/youtube, url})

### Bucket D — Admin builder UX polish
Today's admin is "forms in cards." To hit "agency owner in 30 minutes" we need:

1. **Live preview** — iframe into `midnight.lvh.me` with a `?preview=<token>` pattern that renders the draft (not live) state. Already partly wired via `preview/jwt.ts`; wire it to `/design` and `/structure`.
2. **Section library gallery** — a browse-and-click UI showing **thumbnail previews of each section variant**. Replace the current text-list picker.
3. **Drag-and-drop homepage composer** — already using `@dnd-kit` in dependencies; wire it to the composer.
4. **Section editor improvements** — variant selectors with thumbnails, required vs. optional field separation, inline help, auto-save on blur.
5. **Admin shell polish** — sidebar grouping, workspace switcher with all memberships, breadcrumbs.
6. **Empty-state education** — when a tenant has no composition, show "pick a preset to get started" with illustrated tiles.

---

## Part 3 — Phased roadmap (5 phases, 2–3 weeks)

Each phase ships independent value and leaves the system more complete than it found it.

### **Phase 1 — Section presentation controls + asset library (3 days)**
*Unlocks per-section layout control across every current and future section type.*

**Deliverables**:
1. `presentationSchema` Zod block added to `sections/types.ts`.
2. Every existing section's schema extends it (additive — legacy section instances still parse because fields are optional).
3. Section Editor gains a collapsible "Presentation" panel with 8 controls.
4. Storefront CSS consumes `data-presentation-*` attrs (new rules in `token-presets.css`).
5. An **asset library** surface under `/admin/site-settings/media` — upload + browse imagery used across sections. Backs onto Supabase storage.
6. **Acceptance**: change a section's background from ivory → champagne, see it land on the live storefront within one publish cycle.

### **Phase 2 — 6 missing section types + composer library UI (4 days)**
*Completes the section catalog to cover every Muse Bridal block.*

**Deliverables**:
1. New section types: `process_steps`, `image_copy_alternating`, `values_trio`, `press_strip`, `gallery_strip`, `featured_talent`. Each with schema + editor + component + CSS.
2. **Section library gallery** in the composer — thumbnail previews of each section type + variant, click-to-add.
3. Drag-and-drop reorder within slots (wire `@dnd-kit`).
4. **Acceptance**: new owner can build the exact Muse homepage (hero → trust → services → featured pros → process → destinations → gallery → testimonials → final CTA) by clicking through the library.

### **Phase 3 — Profile page family render + fields (5 days)**
*Closes the largest remaining visual gap.*

**Deliverables**:
1. Profile page refactor: `<ProfileFamilyRouter>` picks `classic` / `service-professional` / `editorial-bridal` based on the token.
2. `EditorialBridalProfile` component with the prototype's layout: portrait hero + stats ribbon + about + specialties + event styles + portfolio mosaic + travel + packages + testimonials + related + sticky CTA.
3. Profile schema extension (add 10 fields listed above). Migration + RLS + admin form extension in `/admin/talent`.
4. Per-block visibility toggles on `/admin/site-settings/design` under a new "Profile blocks" card.
5. **Acceptance**: open `/t/<slug>` for a Bridal-family tenant → see the full editorial profile with all blocks editable from admin.

### **Phase 4 — Admin live preview + UX polish (3 days)**
*Makes the builder feel modern.*

**Deliverables**:
1. Live-preview iframe on `/design` + `/structure` + section editors, with debounced draft-token application.
2. Each section editor gets inline thumbnail previews of its variants.
3. Inline help text (pulled from `TokenSpec.description`) and "sensible default" quickpicks on every field.
4. Workspace switcher always-clickable (show synthetic memberships for super-admins).
5. Empty-state tutorial on `/admin` for fresh tenants.

### **Phase 5 — Scale-out foundation: preset #3 + extraction kit (3 days)**
*Proves the architecture holds for multiple demos.*

**Deliverables**:
1. Ship one additional theme preset end-to-end (suggest: `Creator Social` — bold colors, sans display, grid-forward cards). This **proves a new brand family plugs in with zero registry changes**.
2. `docs/EXTRACT_DEMO.md` — a checklist any engineer follows to turn a prototype into a theme preset: required fields, imagery spec, section whitelist, variant additions.
3. A **theme-preset scaffolder** script (`scripts/scaffold-theme-preset.ts`) that reads a preset definition JSON and emits token map + draft assets.
4. **Acceptance**: a second, unrelated demo can be spun up by editing a single JSON file + adding one CSS block.

---

## Part 4 — Section × controls spec (the table)

Current sections with their proposed **full control surface** (existing + proposed new). Each row becomes the admin-side form for that section's editor.

| Section | Content fields | Variant | Per-section presentation | Section-specific controls |
|---|---|---|---|---|
| `hero` | eyebrow, headline (richtext w/ italic-accent), subhead, bg media + focal point, primary/secondary CTA | `fullbleed-editorial` \| `split-portrait` \| `slider-lifestyle` \| `video-ambient` \| `form-embedded` | all of Bucket A | overlay_strength (0–100), mood, slider speed, trust-badge row |
| `trust_strip` | eyebrow, headline, items[{label, detail, stat?}] | `icon-row` \| `metrics-row` \| `logo-row` | all of Bucket A | numeral_style (serif-italic / sans-large / roman / none), divider_style |
| `category_grid` | eyebrow, headline, copy, items[{service_ref OR label, tagline, iconKey, imageUrl, href}], footer_cta | `portrait-masonry` \| `horizontal-scroll` \| `small-icon-list` | all of Bucket A | columns_desktop (2–5), show_icons, show_descriptions, source_mode (manual/taxonomy) |
| `featured_talent` ✨ new | eyebrow, headline, source_mode, limit, cta | `grid-3` \| `grid-4` \| `carousel` | all of Bucket A | card_variant (inherits directory-card-family), sort_key (featured / updated / manual) |
| `process_steps` ✨ new | eyebrow, headline, steps[{label, detail}] | `numbered-column` \| `horizontal-timeline` \| `alternating-image` | all of Bucket A | number_style (serif-italic / sans-large / roman) |
| `destinations_mosaic` | eyebrow, headline, copy, items[], footnote | `portrait-mosaic` \| `tile-grid` \| `map-inspired` | all of Bucket A | hero_item_index, source_mode, show_regions |
| `gallery_strip` ✨ new | eyebrow, headline, items[{media, aspect_hint?}], caption | `mosaic` \| `scroll-rail` \| `grid-uniform` | all of Bucket A | mosaic_pattern_preset, lightbox on/off |
| `testimonials_trio` | eyebrow, headline, items[{quote, author, context, location, accent}] | `trio-card` \| `single-hero` \| `carousel-row` | all of Bucket A | default_accent, show_quote_icon |
| `image_copy_alternating` ✨ new | eyebrow, headline, items[{side, image, eyebrow, title, italic_tagline, body, list_items[], primary_cta, secondary_cta}] | `editorial-alternating` \| `info-forward` | all of Bucket A | gap, image_ratio |
| `values_trio` ✨ new | eyebrow, headline, items[{number_label, title, detail}] | `numbered-cards` \| `iconed` | all of Bucket A | number_style, background_tone |
| `press_strip` ✨ new | eyebrow?, items[{name or logo_media}] | `text-italic-serif` \| `logo-row` | all of Bucket A | — |
| `cta_banner` | eyebrow, headline, copy, reassurance, CTAs, bg image | `centered-overlay` \| `split-image` \| `minimal-band` | all of Bucket A | overlay_opacity, inset_card, image_side, band_tone |
| `inquiry_form` ✨ new | eyebrow, headline, copy, submit_label, success_message, field_toggles, required_fields | `stacked` \| `two-column` \| `embedded-side-rail` | all of Bucket A | deliver_to (email/webhook), intent_variants |

**✨ new** = doesn't exist yet (6 total).

---

## Part 5 — Shell / Site-wide controls spec

Adding to `TOKEN_REGISTRY` so admin editing doesn't require code:

| Token (new) | Values | Why |
|---|---|---|
| `shell.header-scroll-threshold` | `24px` \| `48px` \| `80px` \| `120px` | Muse prototype uses 48; users want control |
| `shell.header-transparent-routes` | text list | today hardcoded `["/"]`; let admin control which routes get transparent header |
| `shell.logo-variant` | `wordmark` \| `muse-split` \| `monogram` \| `custom-svg` | prototype uses `muse-split`; others may want full wordmark |
| `shell.footer-newsletter` | `on` \| `off` | lots of demos will want this |
| `shell.announcement-bar` | object `{enabled, copy, cta, dismissible}` | no tenant supports announcements yet |
| `motion.stagger-preset` | `none` \| `subtle` \| `editorial` \| `dramatic` | controls reveal cascade timing |
| `accent.palette-rules` | map `{blush, sage, champagne}` → color tokens | lets admin swap which palette colors the testimonial accent cycle uses |
| `profile.blocks.<key>.visibility` | `always` \| `if_not_empty` \| `hidden` | per-block toggles on profile |
| `profile.sticky_inquiry_bar` | `on` \| `off` | toggle the sticky bar |
| `directory.card.show_destination_ready_ribbon` | bool | badge rule |
| `directory.card.show_starting_from_price` | bool | badge rule |
| `directory.card.specialty_chips_max` | `0`–`5` | chip density |

---

## Part 6 — Admin UX framework (the builder, formalized)

This is how the admin should feel, regardless of which preset the tenant picks.

### Layout

```
┌─────────── Workspace Switcher ───────────┐
│  Midnight Muse Collective        [Admin] │
├────────────┬─────────────────────────────┤
│  SIDEBAR   │        CONTENT AREA         │
│  —         │    ┌─────────────────┐     │
│  Site      │    │                 │     │
│  • Theme   │    │   LIVE PREVIEW  │     │
│  • Design  │    │   (iframe)      │     │
│  • Sections│    │                 │     │
│  • Pages   │    └─────────────────┘     │
│  • Media   │    ┌─────────────────┐     │
│  • SEO     │    │  EDITOR PANEL   │     │
│  —         │    │  (tabbed)       │     │
│  Roster    │    └─────────────────┘     │
│  Inquiries │                             │
│  Analytics │                             │
└────────────┴─────────────────────────────┘
```

### Section editor pattern (applies to every section type)

```
┌──────────────────────────────────────────┐
│  [icon] Hero section                [×]  │
├──────────────────────────────────────────┤
│  VARIANT:  ○ Full-bleed  ● Split  ○ Slider│  ← thumbnails, not text
├──────────────────────────────────────────┤
│  Tabs: Content | Presentation | Advanced │
├──────────────────────────────────────────┤
│  CONTENT (default tab)                   │
│    eyebrow       [_____________________] │
│    headline (rt) [_____________________] │
│    subhead       [_____________________] │
│    primary CTA   [label] [href]          │
│  PRESENTATION                            │
│    background    [canvas ▼]              │
│    padding top   [standard ▼]            │
│    padding btm   [standard ▼]            │
│    container     [editorial ▼]           │
│    alignment     [left ▼]                │
│  ADVANCED                                │
│    mobile stack  [default ▼]             │
│    visibility    [always ▼]              │
│                                          │
│  [Save draft]  [Publish]                 │
└──────────────────────────────────────────┘
```

Every section editor gets the same 3 tabs. New section type = one schema definition, the shell is already built.

### Homepage composer UX

- **Slot headers labeled** — "Trust band", "Services", etc. (not slot_keys).
- Empty slot shows a **"+ Add section"** button that opens the section library gallery.
- Occupied slot shows the **section card** (type icon + name + variant) with drag handle, "Edit", and "Remove".
- **Order** is drag-and-drop within a slot.
- **Live preview** updates on every save-draft with a 500ms debounce.

### Theme / Design page

- Top card: **Preset picker** (swatches, description, ideal-for chips).
- Next card: **Tokens grouped** by concern (already shipped).
- Next card: **Shell preview** — thumbnail of each header / footer / mobile-nav variant, click to select.
- Next card: **Profile & directory families** — preview thumbnails, click to select.
- Next card: **Profile block visibility** — checklist of blocks with `always / if_not_empty / hidden` per row.

### Section library gallery

Modal or new page showing:
- **Category filter** (Hero / Trust / Content / Proof / Conversion / Layout)
- **Cards**: thumbnail image, name, "Used on Muse homepage", "Used on About page"
- Click card → modal variant picker → "Add to [slot]" dropdown → creates the section instance + assigns.

---

## Part 7 — Foundation for multiple demos

The architecture is already mostly demo-ready. These additions make adding demos 3 and 4 essentially free.

### Theme preset catalog (short-term roadmap)

| Preset | Shell register | For | Distinctive controls |
|---|---|---|---|
| Classic ✅ | solid nav, sans, crisp shadows | Default / legacy | — |
| **Editorial Bridal** ✅ | sticky-transparent, Fraunces serif, pillowy radii, espresso palette | Weddings, editorial agencies | italic-accent annotation, quote icon, blush/sage/champagne accents |
| **Creator Social** (Phase 5) | color-forward, bold sans, grid-dense cards | Creators, agencies with social-first talent | high-contrast palette, carousel variants |
| **Studio Minimal** (next) | monochrome, wide negative space, slab serif | High-end photography, boutique studios | larger type scale, fewer variants |
| **Staffing Operational** (next) | dense grid, info-forward, saturated accents | Staffing, gig, event ops | compact density preset, table variants |
| **Wellness Calm** (next) | warm, botanical accents, rounded type | Wellness collectives | soft shadow preset, botanical icon family |

Each preset = one JSON file + one CSS block. Structure locked.

### Icon family catalog (extension seam)

Currently: `lucide` | `editorial-line` | `geometric`. Adding a family is:
- One directory under `src/lib/site-admin/icons/<family>/`
- A CSS variable declaration
- An enum value

### Section variant catalog (extension seam)

Every section today has **3 variants**. Plan for 5 variants each. The admin editor already surfaces variants; adding one is a CSS block.

### Template family catalog (extension seam)

Currently: directory-card × 3 families, profile-layout × 3 families. Each new family is:
- An enum value in the registry
- A CSS block (or a new Component for radical layouts)

### Data model extension seam

When a preset needs fields the platform doesn't yet support:
- Add columns to `talent_profiles` or a side table
- Add a migration file
- Extend the talent-admin form

This is mechanical, documented, no surprises.

---

## Part 8 — Priorities & sequencing

If I could only ship **this sprint**, it would be:
1. Phase 1 (presentation controls) — single highest leverage
2. Phase 2 part 1 (missing section types) — completes Muse coverage
3. Phase 3 part 1 (profile editorial-bridal variant renderer) — closes the biggest visual gap

If I had a **second sprint**, it would be:
4. Phase 2 part 2 (library UI + drag-drop)
5. Phase 3 part 2–3 (profile schema + visibility toggles)
6. Phase 4 part 1 (live preview)

If I had a **third sprint**:
7. Phase 4 rest + Phase 5 (scale-out, preset #3)

**Total time estimate: 2.5–3 weeks of focused engineering.** Every phase ships user-visible value.

---

## Part 9 — Concrete first tasks to kick this off

Before committing to the full plan, three low-risk ships that validate it:

1. **Ship the `SectionPresentation` sub-schema** (Phase 1 kickoff, ~4 hours). Extends all 6 existing sections with 8 controls. Zero backward-compat risk.
2. **Ship one missing section (`process_steps`)** (~2 hours). Proves the new-section pattern still flows.
3. **Ship the Profile layout family component router** (~4 hours). Even a stub `EditorialBridalProfile` that just swaps the hero + font stack is a visible unlock.

Those three ship in one day and prove the plan direction is right.

---

## Part 10 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Admin UX turns into a form maze (too many controls, no progressive disclosure) | 3-tab Content/Presentation/Advanced pattern + inline hints + thumbnail previews for every variant |
| Each new preset balloons the CSS file | Scope presets under `html[data-token-*]` selectors (already the pattern) — they don't compound |
| Profile schema extension risks tenant-isolation bugs | All new columns go through `talent_profiles` + existing RLS; migrations sanity-test tenant_id FK |
| Section variant count explodes | Cap at 5 variants per section in the admin library; hide the rest behind "More variants" |
| Live preview slow (iframe reloads on every keystroke) | Debounce draft publishes + use a `?preview=jwt` pattern so the iframe doesn't refetch full page |
| Multiple demos fighting each other for the same tokens | Presets never override non-agency-configurable tokens; CSS rules always scoped to `html[data-token-*]` |

---

## Part 11 — What I want confirmed before Phase 1 starts

Three product calls, one confirmation each:

1. **Rich-text italic-accent annotation** — ship as lightweight Markdown-ish `{accent}text{/accent}` parser rendered inline, or as a proper Lexical-style editor? The former is ~1 day, the latter is ~5. My call: ship `{accent}` first, defer Lexical to later.
2. **Section library gallery** — do you want thumbnails to be **static design snapshots** (fast, easy) or **live-rendered mini iframes** (more accurate but heavy)? My call: static snapshots, one per variant, stored in `public/section-thumbs/`.
3. **Profile block visibility** — admin-set per tenant (all profiles render the same) or admin-set per profile (each profile can choose)? My call: per tenant first, per-profile in a future sprint.

If you agree with those three defaults, I start with Part 9 tasks.

---

*This plan is grounded in the actual shipped state of the codebase, cross-referenced against the Muse Bridal prototype files, and sized against the locked registry pattern. Deviations from this plan should be conscious product calls, not "we need to redesign" moments.*
