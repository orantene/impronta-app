# Add Gallery Freeform Marathon — Inventory

Branch: `feat/edit-chrome/add-gallery-freeform-marathon`

## Implementation classes

| Class | Meaning | Insert method |
|-------|---------|---------------|
| **A — Native freeform** | Full `builderTree` subtree | `sectionTemplate` |
| **B — Connected freeform** | Editable intro layers + one labeled `section_embed` child | `sectionTemplate` |
| **C — Curated embed only** | Truly dynamic blocks | `sectionEmbed` / `connectedNode` |
| **D — Hidden / roadmap** | Duplicate or deferred; not insertable | `disabledComingSoon` |

## Add Gallery insert on composition-slot pages

Section templates insert as **unbound root `section` nodes** (`sectionTypeKey: custom`, no `sectionId`). On pages that still have composition slots (homepage, new-page `blank_section` starter), those sections are stored in `builderTree` but were **not painted on the canvas** until the marathon follow-up render path in `homepage-cms-sections.tsx` (`collectUnboundRootGallerySections`). Click-to-add uses `parentId: null` (page root) — drag-drop can target a specific container.

## Hard rules (never break)

- No Add Gallery path to `composition[]`, `cms_page_sections`, or `applyStarterComposition`
- `assertAddGalleryBuilderTreeOnly` blocks `legacyCompositionSlot` and `cmsPageSectionSlot`
- Legacy pages with old composition slots keep rendering unchanged
- Use **Intro Text**, not Eyebrow/Kicker, in layer names

---

## Sections tab inventory (post-marathon)

| Registry ID | Label | Strategy | Template / embed | Status |
|-------------|-------|----------|------------------|--------|
| `sec-hero-centered` | Hero Centered | A | `hero-centered` | Done |
| `sec-hero-split` | Hero Split Image | A | `hero-split` | Done |
| `sec-hero-search` | Hero Search | A | `hero-search` | Done (form single-layer — see below) |
| `sec-hero-minimal` | Hero Minimal | A | `hero-minimal` | Done |
| `sec-about-simple` | About Simple | A | `about` | Done |
| `sec-about-split` | About Split Image | A | `about-split` | Done |
| `sec-about-stats` | About Stats | A | `about-stats` | Done |
| `sec-services-grid` | Services Grid | A | `services` | Done |
| `sec-services-list` | Services List | A | `services-list` | Done |
| `sec-gallery-grid` | Gallery Grid | A | `gallery` | Done |
| `sec-gallery-strip` | Gallery Strip | A | `gallery-strip` | Done (was embed) |
| `sec-featured-talent-grid` | Featured Talent Grid | B | `featured-talent-wrapper` | Done (was embed) |
| `sec-roster-grid` | Roster Grid | B | `roster-wrapper` | Done (was embed) |
| `sec-testimonials-trio` | Testimonials Trio | A | `testimonials-trio` | Done |
| `sec-cta-banner` | CTA Banner | A | `cta-banner` | Done |
| `sec-cta-split` | CTA Split | A | `cta-split` | Done |
| `sec-faq-accordion` | FAQ Accordion | A | `faq-accordion` | Done |
| `sec-contact-form` | Contact Form | A | `contact-form` | Done |

## Connected tab inventory (post-marathon)

| Registry ID | Label | Strategy | Target | Status |
|-------------|-------|----------|--------|--------|
| `conn-talent-grid` | Talent Grid | B | `featured-talent-wrapper` | Done (deduped) |
| `conn-featured-talent` | Featured Talent | B | `featured-talent-wrapper` | Done (deduped) |
| `conn-collection-grid` | Collection Grid | B | `featured-talent-wrapper` | Done (deduped) |
| `conn-agency-logo` | Agency Logo | A | `agency-logo` | Done (was embed) |
| `conn-inquiry-button` | Inquiry Button | A | `inquiry-cta` | Done (was embed) |
| `conn-talent-search` | Talent Search Bar | C | `directory` embed | Kept dynamic |
| `conn-directory-grid` | Talent Directory Grid | C | `directory` embed | Kept dynamic |
| `conn-booking-button` | Booking Button | C | `booking_widget` embed | Kept dynamic |

## Elements tab — deduped embeds (roadmap-hidden)

| Element ID | Was embed | Action |
|------------|-----------|--------|
| `el-cta-banner` | `cta_banner` | Roadmap — use Sections → CTA Banner |
| `el-testimonial` | `testimonials_trio` | Roadmap — use Sections → Testimonials Trio |
| `el-faq-group` | `faq_accordion` | Roadmap — use Sections → FAQ Accordion |
| `el-gallery` | `gallery_strip` | Roadmap — use Sections → Gallery Strip/Grid |
| `el-stats-counter` | `stats` | Roadmap — use Sections → About Stats |
| `el-logo-strip` | `logo_cloud` | Roadmap — use Connected → Agency Logo |
| `el-inquiry-button` | `cta_banner` | Roadmap — use Connected → Inquiry Button |

**Kept as element-scale dynamic embeds:** `el-booking-button`, `el-search-bar`

---

## Hero Search — Search Form limitation (Phase 6)

The directory search UI is one `form` node with `layerLabel: "Search Form"`. Input and submit button are `form.props.fields`, not separate Page Structure layers. Splitting into Search Input + Search Button child layers would require form renderer changes and GET wiring — documented as stretch; not implemented in this marathon.

`Stats Text` on Hero Search is static copy, not bound to `tenant_talent_count`.

---

## Legacy SECTION_REGISTRY mapping (Phase 8)

Compat-only = renders on existing pages; not in Add Gallery until promoted.

| sectionTypeKey | Label (approx) | Add Gallery tab | Strategy | Insert | Editable layers | Risk | Priority |
|----------------|----------------|-----------------|----------|--------|-----------------|------|----------|
| `hero` | Hero | — | compat | composition | limited | low | P3 |
| `hero_search` | Hero Search | Sections | A | template | full freeform | low | P1 (done) |
| `hero_split` | Hero Split | — | compat | composition | limited | low | P3 |
| `editorial_split_hero` | Editorial Split | — | compat | composition | limited | med | P3 |
| `trust_strip` | Trust Strip | — | hide | — | — | low | P2 future |
| `cta_banner` | CTA Banner | Sections | A | template | full | low | P1 (done) |
| `testimonials_trio` | Testimonials | Sections | A | template | full | low | P1 (done) |
| `faq_accordion` | FAQ | Sections | A | template | full | low | P1 (done) |
| `gallery_strip` | Gallery Strip | Sections | A | template | images | low | P1 (done) |
| `featured_talent` | Featured Talent | Sections/Connected | B | wrapper+embed | intro+grid | med | P1 (done) |
| `directory` | Directory | Connected | C | embed | embed only | med | P1 (kept) |
| `booking_widget` | Booking | Connected | C | embed | embed only | med | P1 (kept) |
| `logo_cloud` | Logo Cloud | Connected | A | template | logos | low | P2 (done as agency-logo) |
| `stats` | Stats | — | A alt | template | stat cards | low | P2 (about-stats) |
| `talent_type_grid` | Talent by Discipline | — | compat | composition | none | **high** (homepage) | P1 future |
| `category_grid` | Category Grid | — | compat | composition | limited | med | P3 |
| `location_discovery` | Markets | — | compat | composition | limited | med | P2 future |
| `process_steps` | How it works | — | compat | composition | limited | med | P2 future |
| `values_trio` | Values | — | compat | composition | limited | low | P3 |
| `press_strip` | Press | — | compat | composition | limited | low | P3 |
| `destinations_mosaic` | Destinations | — | compat | composition | limited | med | P3 |
| `image_copy_alternating` | Image + Copy | — | compat | composition | limited | med | P3 |
| `marquee` | Marquee | — | compat | composition | limited | low | P4 |
| `split_screen` | Split Screen | — | compat | composition | limited | med | P3 |
| `timeline` | Timeline | — | compat | composition | limited | med | P4 |
| `pricing_grid` | Pricing | Roadmap | — | — | — | low | P4 |
| `team_grid` | Team | — | compat | composition | limited | med | P4 |
| `contact_form` | Contact Form | Sections | A | template | form layer | low | P1 (done) |
| `join_register` | Join / Register | — | compat | composition | limited | med | P4 |
| `site_header` | Site Header | — | shell | composition | limited | high | shell |
| `site_footer` | Site Footer | — | shell | composition | limited | high | shell |
| `blank_section` | Blank | — | native | section node | full | low | P4 |

### Homepage composition trap (compat-only)

Live homepage sections (`hero_search`, `talent_type_grid`, `testimonials_trio`, etc.) remain in `composition[]` until an operator re-inserts via Add Gallery. No auto-migration in this marathon.

### Manual migration path

Operators can eject legacy slots via `section.ejected` and rebuild with Add Gallery templates. See `builder-node/types.ts` section props.

---

## QA script (Phase 9)

### Automated (every commit)

```bash
cd web && node --import tsx --test src/lib/site-admin/add-gallery/*.test.ts
cd web && node --import tsx --test src/components/edit-chrome/freeform-layer-name.test.ts
cd web && node -r ./scripts/eslint-node-polyfill.cjs ./node_modules/eslint/bin/eslint.js \
  src/lib/site-admin/add-gallery src/components/edit-chrome/freeform-layer-name.ts --quiet
```

### Manual per converted section

1. Click-to-add from Add Gallery
2. Page Structure: verify semantic layer names (Title, Intro Text — not generic Heading)
3. Canvas: select Title → outline + CanvasTextToolbar
4. Canvas: select Button / Card / Quote Text / Answer
5. Parent section → section-level inspector
6. Undo/redo after inline edit
7. Save draft → reload → layers persist
8. Confirm builderTree only (no new composition slots)

### Screenshot matrix

Baseline polish: `web/docs/builder-mockups/add-gallery-polish/`

Marathon freeform captures: `web/docs/builder-mockups/add-gallery-freeform/` (see README in that folder)

---

## Test coverage

21 add-gallery tests (`insert.test.ts` + `section-templates.test.ts`) — all templates assert required `layerLabel`s via `assertTemplateLayerLabels()`.

Connected wrappers assert exactly one labeled `section_embed` child (`Talent Grid`, `Directory Grid`).
