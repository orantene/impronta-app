# Section Type Icons — Design Spec

**Status**: Sprint 3 design track. Engineering swap-in is a follow-up
(~1 day) once design delivers SVGs.

**Purpose**: replace generic Lucide icons (`Layout`, `Image`, `Type`,
etc.) used in the chip + picker + navigator with section-specific
custom icons that **look like** the section. The audit's #14 item:

> "Section type icons are weak — they're generic shapes that don't
> communicate the section's purpose. A 'Hero' icon should look like a
> hero (image + headline). A 'Stats' icon should look like stats."

## Where these icons render

Three surfaces consume `<SectionTypeIcon typeKey={...} size={N} />`
(`web/src/components/edit-chrome/kit/section-type-icon.tsx`):

| Surface | Size | Context |
|---|---|---|
| Chip on selected canvas section | 13–15 px | Floating dark chip, white-on-dark icon |
| Inspector header | 15 px | White card on warm paper, ink-on-paper icon |
| Navigator panel rows | 14 px | Quiet ink-on-paper, must read at small size |
| Section picker popover | 16 px | New Sprint 3 surface, ink-on-paper, ~32 px tile |
| Drag ghost during reorder | 18 px | White-on-dark, slightly larger |

A single SVG per section type, rendered at multiple sizes, must
remain legible across all four surfaces.

## Visual language

**Stroke-based geometry, single weight.** Wireframe-style: imagine you
asked a designer to sketch each section as a 16×16 pictogram with a
fine-tip pen. Filled shapes are reserved for a single accent rectangle
per icon (the "hot" element — the headline bar in Hero, the photo in
Featured Talent, the CTA chip in CTA Banner).

- **Stroke width**: `1.5 px` at 16 px target (scales proportionally)
- **Color**: `currentColor` so the consumer surface owns the ink
- **Single accent fill**: `currentColor` at `0.22` opacity
- **Corner radius**: `1 px` for boxes, `0.5 px` for tight inner detail
- **Padding inside the 16×16 box**: 1 px on every side (icons sit in
  a 14×14 visual cell)

**No icon should look like another icon.** A "Trust strip" and a
"Press strip" are similar at small sizes — the spec treats this
explicitly: trust strip has 4–5 evenly-sized logos, press strip has
3–4 logos with one being italic-serif (signaling "publication
masthead").

## The 15 default-tier sections

Each entry: `typeKey` · operator-facing label · what the icon should
"read" as (the visual mnemonic).

1. **`hero`** — Hero
   - Two stacked rules (headline + tagline) above a CTA pill, sitting
     on top of a faint imagery rectangle. Reads: "image with text and
     a button on it."
2. **`hero_split`** — Hero (split)
   - Same as Hero, but the imagery is on the right half and the text
     stack is on the left half. Reads: "image and text side-by-side."
3. **`featured_talent`** — Featured Professionals
   - Three small portrait rectangles in a row (rounded corners
     suggesting headshots). Reads: "people grid."
4. **`category_grid`** — Categories
   - 2×2 of equal squares with a tiny label rule below each. Reads:
     "uniform grid of tiles."
5. **`gallery_strip`** — Gallery
   - Five varied-width rectangles in a horizontal strip (mosaic-ish).
     Reads: "images in a row."
6. **`testimonials_trio`** — Testimonials
   - Three quote-mark glyphs OR three rounded cards each with a
     short rule and a tiny avatar dot. Reads: "quotes."
7. **`stats`** — Stats
   - Three large numerals stacked over short labels (the numerals are
     the visual hook — fill them as the accent). Reads: "numbers as
     headlines."
8. **`press_strip`** — Press Strip
   - Three publication-style logos in a row, one rendered as an
     italic-serif "M" to differentiate from trust_strip. Reads:
     "as seen in publications."
9. **`trust_strip`** — Trust Strip
   - Four uniformly-sized logo bars in a row, all geometric (not
     italic-serif). Reads: "client logos."
10. **`cta_banner`** — CTA Banner
    - One bold headline rule + one CTA pill, on a wide low rectangle.
      The CTA pill is the accent fill. Reads: "ask."
11. **`image_copy_alternating`** — Image + Copy
    - A square (image) on one side, two stacked rules (heading + body)
      on the other. Reads: "image-and-text section."
12. **`values_trio`** — Values
    - Three short columns each with a tiny circle (icon spot) above
      two rules. Reads: "three pillars."
13. **`split_screen`** — Split Screen
    - Two equal-width cards side-by-side, each with an inner rule.
      Reads: "two-column layout."
14. **`faq_accordion`** — FAQ
    - Three chevron-tipped horizontal rules stacked, the top one
      expanded showing a body rule below. Reads: "questions list."
15. **`contact_form`** — Contact Form
    - Three input-field rectangles stacked, the bottom one filled as
      a button. Reads: "form with submit."

## Advanced-tier sections (defer)

The remaining 18 advanced types (process_steps, marquee,
destinations_mosaic, timeline, pricing_grid, team_grid, anchor_nav,
before_after, content_tabs, code_embed, blog_index, donation_form,
magazine_layout, map_overlay, site_footer, video_reel, masonry,
blog_detail) keep their current Lucide icons until the default tier
is migrated and verified. Don't try to do all 33 in one design pass.

## Deliverable format

- **One SVG per section type** in `web/src/components/edit-chrome/kit/section-icons/`
  named `${typeKey}.svg`
- 16×16 viewBox, `stroke="currentColor"`, `fill="none"` for outlines,
  `fill="currentColor" opacity="0.22"` for the accent rectangle
- **No inline `<style>` blocks**, no embedded fonts, no Lucide imports
- Keep total path count modest — 4–8 paths per icon — so they
  rasterize crisply at 13–14 px

## Engineering follow-up (after design ships)

1. Drop the SVGs into the directory above.
2. Modify `kit/section-type-icon.tsx` to import the SVGs by typeKey
   with a fallback to the existing Lucide map.
3. Visual diff via the existing prototype `/prototypes/audit-phase-e`
   route (renders all section types) on local prod build.
4. Push + deployed verification on `impronta.tulala.digital`.

Estimated engineering: **1 day** once SVGs land.
