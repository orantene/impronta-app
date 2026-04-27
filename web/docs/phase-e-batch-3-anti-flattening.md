# Phase E Batch 3 — anti-flattening contract

**Created BEFORE any code changes.** Each Batch 3 section gets four explicit
answers before its Component is touched: *what makes it recognizable*, *what
the shared primitive is allowed to normalize*, *what must remain bespoke*,
*what would count as flattening*. If during migration I'm tempted to violate
the bespoke column, I stop.

This document is the contract. The migration is judged against it.

## Migration pattern (shared by all Batch 3 entries except hero / featured_talent)

The pattern for design-sensitive sections is **head-only migration**:

```tsx
<section className="site-X" {...presentationDataAttrs(presentation)} style={...}>
  <Container width="standard">
    <SectionHead align="center" eyebrow={eyebrow}
      headline={headline ? renderInlineRich(headline) : undefined}
      intro={copy} />
  </Container>
  {/* ↓ everything below here is the section's signature interior — UNCHANGED */}
  <BespokeInterior />
</section>
```

The Container + SectionHead share the eyebrow/headline rhythm with Batch 1+2.
Everything else stays exactly as-shipped. CSS for `__inner` / `__head` /
`__headline` is removed only after the migration is verified visually.

## Halfway batch (7 sections, in this order)

### 1. testimonials_trio (`site-testimonials-trio`)

- **Signature** — 4-color accent rotation (`blush` / `sage` / `champagne` /
  `ivory`) cycling per card, large stylized quote-mark SVG, italic quote text,
  `__author` + `__context` footer with metadata separator (`·`).
- **Shared** — eyebrow + centered headline rhythm; outer container width.
- **Bespoke (preserved)** — accent rotation logic, quote SVG, italic quote
  text, card padding, footer meta typography, the entire `__grid`.
- **Flattening criterion** — if a card from this section becomes
  indistinguishable from a generic 3-up "card grid" without reading copy,
  the unification has gone too far. The accent rotation is the section's
  identity at a glance.

### 2. magazine_layout (`site-mag`)

- **Signature** — editorial 1-hero + N-secondary asymmetric grid; hero card
  uses a deliberately larger `__title--hero` scale; per-card `__category`
  small-caps label; lazy-loaded media; mixed h3/h4 hierarchy by card role.
- **Shared** — eyebrow + headline; outer container width.
- **Bespoke (preserved)** — 1-hero-+-N-secondary asymmetric layout, hero
  card's bigger title scale, category labels, h3/h4 hierarchy by role,
  hero card's media treatment vs secondary cards.
- **Flattening criterion** — if the hero card stops looking distinctly bigger
  than the secondary cards, or if the grid loses asymmetry and reads as a
  uniform 3-up, the section's editorial identity is lost.

### 3. masonry (`site-masonry`)

- **Signature** — CSS-columns masonry (NOT CSS Grid); variable image heights
  driven by their natural aspect ratios; optional captions; per-tenant
  configurable column count via `--masonry-cols`.
- **Shared** — eyebrow + headline; outer container width.
- **Bespoke (preserved)** — `__cols` masonry layout (CSS `columns:` property),
  variable-height tiles, caption typography, configurable column count.
- **Flattening criterion** — if the layout collapses to a uniform-cell grid,
  or if all tiles end up the same height (defeating masonry's whole point),
  the unification has gone too far.

### 4. before_after (`site-ba`)

- **Signature** — pure-HTML range slider with clip-path reveal; before/after
  text labels overlaid on top corners of the frame; tiny enhancement script
  that wires the range-input value to a CSS custom property `--ba-pos`.
- **Shared** — eyebrow + headline; outer container width.
- **Bespoke (preserved)** — the entire `__frame` (range input, two `__img`
  layers, `__label--before/--after` overlays, the enhancement script).
- **Flattening criterion** — if the slider interaction is disrupted, if the
  range input loses its custom styling, or if the enhancement script gets
  detached from its `<section>` parent, the section is broken not flattened.
  This is a section where flattening risk is LOW but interaction risk is
  HIGH — handle the head-only swap carefully.

### 5. destinations_mosaic (`site-destinations-mosaic`)

- **Signature** — 1-hero-tile + N-rest asymmetric grid (similar to
  magazine but with different content semantic); tile overlay; per-tile
  `__region` small-caps label; image-backed tiles.
- **Shared** — eyebrow + headline + intro copy; outer container width.
- **Bespoke (preserved)** — hero/rest grid split, image+overlay treatment,
  region label typography, the `data-featured` styling on the hero tile.
- **Flattening criterion** — if the hero tile becomes the same size as
  the rest tiles, or if the section becomes indistinguishable from a
  generic image-grid, the destination story is lost.

### 6. video_reel (`site-reel`)

- **Signature** — `<video>` player with custom aspect-ratio frame; ordered
  chapters list with time formatting (`fmt()` h:mm:ss / m:ss); enhancement
  script that wires chapter clicks to `video.currentTime`.
- **Shared** — eyebrow + headline; outer container width.
- **Bespoke (preserved)** — the `__frame` aspect-ratio wrapper, the video
  element with all its props (controls/loop/muted/autoplay/playsInline/
  preload/track), the chapter list typography and clickability, the
  enhancement script.
- **Flattening criterion** — if the chapter list looks like a generic ordered
  list, or if the video frame loses its bespoke aspect-ratio framing, the
  reel's editorial feel is lost.

### 7. scroll_carousel (`site-carousel`)

- **Signature** — horizontal `scroll-snap` track that breaks out of the
  container and runs full-bleed across the viewport; card width set via
  vw-relative custom property `--carousel-card-w`; optional progress
  indicator at bottom.
- **Shared** — eyebrow + headline; outer container width AROUND THE HEAD.
- **Bespoke (preserved)** — the `__track` MUST remain full-bleed (outside
  the container's max-width); vw-based card width; horizontal scroll-snap;
  optional progress UI.
- **Flattening criterion** — if the carousel track gets constrained to the
  container width, or if cards stack vertically on any breakpoint instead
  of horizontally scrolling, the carousel's identity is destroyed. **Special
  case**: only the head is wrapped in Container; the track stays a sibling
  outside.

---

## NOT in halfway batch — handled later with extra care

### hero (`site-hero`)

- **Signature** — full-bleed photographic backdrop (single image OR
  cross-fade slider via @keyframes); aurora/scrim/vignette overlays per
  `data-hero-overlay`; mood data-attr controls type ramp; `<h1>` headline
  scale (60–120px range); two CTA variants (`__cta--primary` /
  `__cta--secondary`) with hero-specific styling distinct from the body
  Cta primitive.
- **Migration plan (Batch 3 final pass)** — DO NOT introduce SectionHead
  or Container. The hero is the section the master plan §418 explicitly
  says "survives Phase E unchanged." The most we can do is adopt the Cta
  primitive for the two buttons, IF that doesn't disturb the hero's
  bespoke CTA aesthetic. If it does, hero CTAs stay bespoke.
- **Risk** — highest in the entire migration. Hero touches face-value
  perception of every tenant. Only proceed if real-device verification
  passes.

### featured_talent (`site-featured-talent`)

- **Signature** — §23 mockup. The bespoke talent picker layout that the
  master plan §418 + §425 EXPLICITLY says stays intact: "the bespoke
  featured-talent picker (mockup §23) layout. These are the reasons the
  prototype reads as premium. They survive Phase E unchanged."
- **Migration plan** — DO NOT MIGRATE. Even the head/container swap is
  declined for this section. The plan's wording is binding.

### Remaining advanced/lower-priority (handled after device pass)

- hero_split, lookbook, image_orbit, lottie, map_overlay, sticky_scroll,
  code_snippet, booking_widget, blog_detail — applied with the head-only
  pattern after halfway device verification.

---

## What would invalidate the contract during migration

1. Visiting impronta.tulala.digital after the batch and not being able
   to tell two of these sections apart at a glance.
2. The carousel cards stacking vertically instead of scrolling.
3. A masonry layout that has equal-height tiles.
4. The before/after slider not responding to drag.
5. Any chapter/timecode interaction in video_reel that stops working.
6. The hero or featured_talent looking different than they did before.

If any of these appear during the audit, the change responsible is
reverted and the contract is re-examined before re-attempting.
