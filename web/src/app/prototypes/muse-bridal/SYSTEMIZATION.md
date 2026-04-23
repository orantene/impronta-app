# Muse Bridal Collective — Systemization Map

> From prototype → reusable theme + CMS. For every section, what belongs to
> **Theme / Site Options** (global across a tenant), what belongs to a **CMS
> Section** (page-builder block), what belongs to a **Template Variant**
> (layout mode), and what new **Field Model** extensions are needed.

This prototype was built as a thin composition on purpose. Every page is a
`sections[]` array today — the promotion path is a schema migration, not a
rewrite.

---

## 1. Visual Direction

The end goal is for any tenant to pick **Muse Bridal** as a *feel preset*
and get the same editorial register across header, cards, buttons, motion,
spacing, and radii — without touching CSS.

| Feel | Muse Bridal value | Tenant setting |
| --- | --- | --- |
| Palette | Ivory `#F6F1EA` / Champagne `#E8D8C3` / Soft Blush `#D8B7B0` / Muted Sage `#A8B1A0` / Espresso `#4A403A` | `site_theme_tokens.color_*` |
| Display type | Fraunces (variable serif, optical + softness axes) | `site_font_preset = "editorial-bridal"` |
| Body type | Inter | bundled with preset |
| Corner radii | 6 / 10 / 18 / 28 / pill | `site_theme_tokens.radius_*` |
| Shadow | Soft `0 22px 48px -28px rgba(74,64,58,0.22)` | `site_theme_tokens.shadow_*` |
| Motion | 280–900ms ease `cubic-bezier(0.22, 0.61, 0.36, 1)` | `site_motion_preset = "refined"` |
| Density | Section-Y `clamp(72px, 9vw, 132px)` | `site_density_preset = "editorial"` |
| Icon family | thin line 1.4 stroke | `site_icon_family = "editorial-line"` |

All CSS variables in `muse.css` are **single-pull tokens** so this promotes
to a theme preset cleanly — no per-component CSS changes.

---

## 2. Page-Level Structure → CMS Section Catalog

Every page in this prototype is rendered by composing typed section
components. Each one is a candidate for a CMS section. Shape below
mirrors how the real `homepage_page_json.sections[]` would look.

### 2.1 Hero — `section.hero`

| Today (props) | Field model | Variant |
| --- | --- | --- |
| `eyebrow` | `eyebrow: text` | all |
| `headline` | `headline: rich_text` (supports `{italic-accent}`) | all |
| `subhead` | `subhead: rich_text` | all |
| `image` | `media: media_ref` with focal point | `fullbleed-editorial` |
| `primary` / `secondary` | `cta: { label, href, style }[]` | all |
| `overlay` | `overlay_strength: 0..1` | `fullbleed-editorial`, `video-ambient` |
| `align` | `align: "left" \| "center"` | all |
| `compact` | `density: "hero" \| "interior"` | all |

**Template variants** (all drop-in replacements under the same `section.hero` type):
- `fullbleed-editorial` (this prototype) — image + gradient + serif + 2 CTAs
- `split-portrait` — half-image, half-copy
- `slider-lifestyle` — multi-image crossfade with pause
- `video-ambient` — silent video loop with poster fallback
- `form-embedded` — hero that includes an inline lead-capture form

### 2.2 Trust Strip — `section.trust_strip`

Small positioning row. Three variants:
- `icon-row` (this prototype, uses numeric serif accents)
- `metrics-row` (replaces each label with a stat + caption)
- `logo-row` (press/brand logos horizontally aligned)

Fields: `items[] { label, detail, icon_key?, accent_style? }`,
`divider_style`, `background_tone`.

### 2.3 Category Grid — `section.category_grid`

Used on home + services pages.

Fields: `items[] { service_ref }`, `columns_desktop`, `layout_variant`,
`show_kicker`, `show_description`. Items are **foreign keys** into the
`taxonomy.services` table — so when the tenant adds "Bridal Styling" as a
new service, every grid using it picks it up automatically.

### 2.4 Featured Professionals — `section.featured_talent`

Fields:
- `source_mode`: `manual_pick` | `auto_by_service` | `auto_by_destination` | `auto_featured_flag`
- `limit`: int (default 6)
- `columns`: 3 | 4
- `card_variant`: ties directly into the Directory card variant system (§4)

### 2.5 Process / How Booking Works — `section.process`

Fields: `items[] { label, detail, icon_key? }`, `number_style`
(`serif-italic` | `sans-large` | `roman`), `layout_variant`
(`numbered-column` | `horizontal-timeline` | `alternating-image`).

### 2.6 Destinations — `section.destination_strip`

Fields:
- `items[] { destination_ref }` — FK to `taxonomy.destinations`
- `layout_variant`: `portrait-mosaic` (this prototype) | `map-inspired` | `tile-grid`
- `source_mode`: `manual_pick` | `auto_featured`
- `hero_index`: which item gets the oversized treatment

### 2.7 Gallery / Moments — `section.gallery`

Fields:
- `items[] { media_ref, aspect? }`
- `layout_variant`: `mosaic` (this prototype) | `scroll-rail` | `grid-uniform`
- `caption_rich_text?`

### 2.8 Testimonials — `section.testimonials`

Fields:
- `items[] { quote, author, context, location, accent }`
- `layout_variant`: `trio-card` (this prototype) | `carousel` | `single-hero`
- Each testimonial's `accent` pulls from the theme palette (`blush` | `sage`
  | `champagne`) — so the same section looks right on any future brand.

### 2.9 Final CTA — `section.cta_banner`

Fields:
- `eyebrow`, `headline`, `copy`, `primary_cta`, `secondary_cta?`,
  `reassurance_italic?`
- `background_mode`: `image` | `solid` | `gradient`
- `layout_variant`: `centered-overlay` (this prototype) | `split-image` | `minimal-band`

### 2.10 Image + Text Editorial — `section.image_copy_alternating`

Lives on the Services page. Each block is one service with alternating
sides. Fields: `items[] { side: "left" | "right", media, eyebrow, title,
italic_tagline, body_rich_text, list_items[], primary_cta?,
secondary_cta? }`.

### 2.11 Values Trio — `section.values`

Used on About. Fields: `items[] { number_label, title, detail }`,
`number_style`, `background_tone`.

### 2.12 Press Strip — `section.press_strip`

Horizontal band of publication names or logos. Fields: `eyebrow?`,
`items[] { name_or_logo_ref }`.

### 2.13 Inquiry Form — `section.inquiry_form`

See §5 for the full field-model breakdown.

---

## 3. Header / Footer / Mobile Nav — Theme-Scoped Partials

These are site-wide, not per-page, so they live on the **tenant theme
record**, not in CMS sections.

### 3.1 Header

Variants:
- `editorial-sticky` (this prototype) — transparent over hero, solid on scroll, centered serif logo, nav center/right, CTA right
- `espresso-column` — always-solid dark variant for interior-only sites
- `centered-logo-split` — logo center, nav split left/right (editorial magazine style)
- `compact-utility` — dense SaaS-y variant (not for bridal brands)

Per-variant configurables:
- `logo_variant`: `muse-split` (`Muse` serif + `Bridal Collective` spaced mono) | `wordmark` | `monogram`
- `nav_items[] { label, href, target? }`
- `cta_enabled`: bool
- `cta`: `{ label, href, style }`
- `scroll_threshold`: px before going solid
- `transparent_on`: list of route prefixes (default: `["/"]`)

### 3.2 Mobile Nav

Variants:
- `full-screen-fade` (this prototype) — stacked serif links with staggered reveal + sticky bottom CTA
- `drawer-right` — compact slide-in
- `sheet-bottom` — casual mobile-first (not bridal-appropriate)

Per-variant configurables: reuses header `nav_items[]` and `cta`. Adds
`close_label`, `transition_preset`.

### 3.3 Footer

Variants:
- `espresso-column` (this prototype) — 4-column dark footer with large serif brand block
- `ivory-minimal` — light variant for bright brands
- `serif-editorial` — single-page sign-off

Fields: `brand_blurb: rich_text`, `columns[] { title, links[] }`,
`legal_line`, `social_links[]`, `locale_switcher_enabled`,
`newsletter_enabled`.

---

## 4. Directory Card — Template Variant Family

The same `Professional` data shape renders in different templates depending
on roster type. This is a **Template Variant**, not a CMS section — a
tenant chooses one card style for their entire directory.

Variants:
- `editorial-portrait` (this prototype, 4:5 portrait ratio, ribbon, chip strip)
- `square-clean` — photographer-heavy rosters, 1:1 crop, minimal chip use
- `wide-landscape` — estate/venue listings, 16:9 media, description-forward
- `minimal-list` — dense directories, image is secondary
- `magazine-feature` — single-item-per-row with large editorial image

All variants consume the same fields — variant differs only in layout.

**Badge rules** (theme-controlled, not per-card):
- `show_destination_ready_ribbon` (uses `travels_globally` field)
- `show_starting_from_price`
- `show_specialty_chips_max`: int

---

## 5. Profile Page — Template Variant + Modular Blocks

### 5.1 Profile layout variants

- `editorial-long` (this prototype) — portrait hero, long editorial scroll
- `split-gallery` — portrait left / gallery right
- `magazine-feature` — full-bleed portrait hero + ribbon stats
- `compact-card` — single-screen card view for dense rosters

### 5.2 Modular profile blocks

Each block is a candidate for a "profile section" the agency can toggle on
per-profile (or per-profile-category):

| Block | Present in prototype | Future field model |
| --- | --- | --- |
| `profile.hero` | ✅ | `portrait_media`, `name`, `role_label`, `intro_italic`, `meta_row` |
| `profile.stats_ribbon` | ✅ | `items[] { label, value }`, fixed 4-up grid |
| `profile.about` | ✅ | `paragraphs: rich_text[]` (first gets display-serif treatment) |
| `profile.specialties` | ✅ | `specialties[]` — outlined chip |
| `profile.event_styles` | ✅ | `event_styles[]` — blush accent line |
| `profile.portfolio` | ✅ | `media[]` — mosaic with 4-row pattern |
| `profile.travel` | ✅ | `destinations[]`, `travels_globally: bool` |
| `profile.packages` | ✅ | `starting_from`, `booking_note`, `inclusions[]` |
| `profile.testimonials` | ✅ | `testimonial_items[]` |
| `profile.related` | ✅ | auto-computed or manual pick |
| `profile.faq` | ❌ (proposed) | `qa_items[] { q, a }` |
| `profile.embedded_media` | ❌ (proposed for Music/Video) | Spotify / SoundCloud / Vimeo / YouTube embed URL |
| `profile.inquiry_cta` | ✅ | final CTA block |
| `profile.sticky_inquiry_bar` | ✅ | template-level toggle |

Each block has `visibility: "always" | "if_not_empty" | "hidden"` so a
partially-filled profile still looks considered.

---

## 6. Field Model — New Extensions Needed

Fields in the prototype that are **not** covered by the current platform
schema, and would need to be added for this brand direction to land
end-to-end:

### 6.1 On `professional_profiles`

- `intro_italic: text` — short serif italic lead line (distinct from long bio)
- `event_styles: text[]` — taxonomy FK, distinct from `specialties`
- `destinations: text[]` — taxonomy FK
- `travels_globally: bool` (already implied but needs surfacing)
- `team_size: text` (free-text because "Solo + 3 coordinators" varies)
- `lead_time_weeks: text` or range
- `starting_from: text` (display as-is; full pricing lives in the quote engine)
- `booking_note: text`
- `social_links: { label, href }[]`
- `embedded_media: { provider: enum, url }[]` — Spotify / SoundCloud / Vimeo

### 6.2 On `taxonomy.services`

- `tagline: text` — italic serif accent line
- `ideal_for: text[]` — short bullet list for service blocks
- `icon_key: enum` — pulled from the theme's icon family

### 6.3 On `taxonomy.destinations`

- `tagline: text`
- `region: text`
- `cover_image: media_ref`
- `featured: bool`

### 6.4 On `testimonial_items`

- `accent: enum("blush","sage","champagne")` — picks palette pairing on the
  testimonial section; the actual colors resolve from the theme so a future
  Luma/Midnight brand paints them correctly.

### 6.5 Inquiry form configuration

- `enabled_fields: enum[]` — partner_name, event_type, event_date,
  destination, services_multiselect, guest_count, budget_range,
  notes, referral_source
- `required_fields: enum[]`
- `submit_label: text`
- `success_message: rich_text`
- `deliver_to: { email? , webhook?, crm_integration? }`
- `intent_variants: { apply, press, team, concierge, gift, default }` — URL
  param `?intent=...` pre-fills the form with the right tone

---

## 7. Copy Tone — Reusable Voice Presets

Copy register varies by brand — the "quiet, refined, unhurried" voice here
should be one of several tone presets a tenant can pick.

Proposed presets:
- `editorial-bridal` (this prototype) — warm, unhurried, italic-accented
- `editorial-nightlife` — sharper, present tense, more negative space
- `editorial-commercial` — neutral, portfolio-forward
- `concierge-soft` — reassuring, service-professional

Each preset drives default copy for:
- empty states
- form helper text
- error messages
- CTA default labels ("Book Your Team" vs "Book Talent" vs "Book Crew")
- reassurance italic lines under CTAs

---

## 8. Global vs Page-Specific

| Concern | Scope |
| --- | --- |
| Palette, typography, radii, shadow, motion, density | **Global** (theme) |
| Header / footer / mobile nav variants + contents | **Global** (theme) |
| Directory card variant | **Global** (theme) |
| Profile layout variant + enabled blocks | **Global** (theme) |
| Icon family | **Global** (theme) |
| Tone preset | **Global** (theme) |
| Homepage section order and content | **Page-specific** (CMS) |
| Services/About/Contact section content | **Page-specific** (CMS) |
| Per-profile block toggles | **Profile-specific** (opt-in override) |
| Per-directory-page default filters | **Page-specific** (CMS) |
| Inquiry form enabled fields | **Page-specific** (CMS) |

---

## 9. Promotion Path (prototype → real product)

1. **Extract tokens**: every CSS variable in `muse.css` becomes a row in a
   `theme_preset` record. Ship as `editorial-bridal`.
2. **Wire typed sections**: each `Section*` component in `_components/`
   becomes a registered CMS block with a Zod schema that matches §2.
3. **Extend taxonomy**: add fields from §6 to `taxonomy.services`,
   `taxonomy.destinations`, and `professional_profiles`.
4. **Card + profile variants**: register the card/profile variants from §4
   and §5 in the template registry.
5. **Header / footer / mobile nav variants**: promote `MuseHeader`,
   `MuseFooter`, `MuseMobileNav` to theme-scoped partial renderers selected
   by `theme.header_variant`, `theme.footer_variant`, `theme.mobile_nav_variant`.
6. **Motion / density presets**: ship `refined` motion + `editorial`
   density as the first non-default presets.
7. **Icon families**: register `editorial-line` as the first alternative
   icon family alongside the existing `lucide` family.
8. **Tone presets**: add `editorial-bridal` copy strings as the first
   non-default tone preset.

At that point a new wedding-adjacent agency onboarding can pick "Editorial
Bridal" from the theme picker and land in this exact visual register —
only the content differs.
