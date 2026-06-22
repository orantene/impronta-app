# Impronta — Hero Slider + Header — Design Teardown (Noir & Or)

This documents EXACTLY how the Design 3 ("Noir & Or") hero slider and header behave, so it can be rebuilt as a freeform, configurable component in the page builder. It is the source-of-truth spec referenced by the developer prompt (`02-developer-prompt.md`).

- Live: http://localhost:4522/  (home), source: `web/public/impronta-mockup-3/`
- Markup: `index.html` (the `header.nav` + `section.hero` blocks)
- Styles: `assets/impronta.css` (search `/* nav */`, `/* hero */`, `/* marquee */`, `/* responsive */`)
- Behavior: `assets/impronta.js` (nav scroll state, hero carousel, mobile menu, reveal, EN/ES)
- Global easing used everywhere: `cubic-bezier(0.16, 1, 0.3, 1)` (referred to below as `--ease`)

---

## 1. The HERO SLIDER

### Structure
```
section.hero
  .hero__slides
    .hero__slide.active  > img
    .hero__slide         > img
    .hero__slide         > img
    .hero__slide         > img
  .hero__scrim        (gradient + vignette for legibility)
  .grain              (SVG film-grain overlay)
  .wrap.hero__inner   (the content: eyebrow, h1, sub, CTAs)
  .hero__meta         (slide counter "04 / 04" + dot indicators)
  .scroll-cue         (animated "SCROLL" line)
```

### Visual / sizing
- Height `100svh`, `min-height: 620px`, `overflow: hidden`, background `--espresso (#100e13)`.
- Each slide `img`: `object-fit: cover; object-position: center 28%`. In this theme the image is intentionally darkened/warmed: `filter: brightness(0.82) saturate(1.05)` so gold text and the gold UI read on top.
- `.hero__scrim`: a top-to-bottom dark gradient PLUS a radial vignette. This is what makes white/gold text legible over any photo. Strength is tuned for a dark theme; a light theme uses a softer scrim.
- `.grain`: inline SVG fractal-noise at `opacity 0.45; mix-blend-mode: overlay` — the subtle "film" texture.

### Motion (3 layers, all on the hero)
1. **Crossfade** between slides: `.hero__slide { opacity:0; transition: opacity 1.6s --ease } .active { opacity:1 }`.
2. **Ken Burns**: the active slide's image slowly zooms: `@keyframes kenburns { from scale(1.04) to scale(1.14) }`, `9s --ease forwards`, re-triggered each time a slide becomes active.
3. **Auto-advance**: JS `setInterval` every **5200ms**; disabled when `prefers-reduced-motion`.

### Controls (in `impronta.js`)
- Reads all `.hero__slide`; only activates carousel logic if `> 1` slide.
- `go(n)`: removes `.active`/dot `.on` from current, advances index (wraps), adds `.active`/`.on`, updates the counter text to `NN / NN` (zero-padded).
- Dot indicators (`.hero__dots button`): click → stop autoplay, `go(thatIndex)`, restart autoplay.
- Counter (`.hero__count`) shows `01 / 04` … in the display serif.
- Active dot is gold; inactive are translucent bars.

### Content block (`.hero__inner`) — bottom-left, `z-index: 5`
- **Eyebrow** `.hero__eye`: gold, uppercase, wide tracking, with a leading gold rule. e.g. `TALENT AGENCY · TULUM, MEXICO`.
- **H1**: display serif, `clamp(3.2rem, 9.6vw, 9rem)`, line-height `0.96`; an `<em>` word is italic + gold ("…with an *imprint.*").
- **Sub**: one line, `max-width: 46ch`, light weight.
- **CTAs** `.hero__cta`: two buttons — primary (gold gradient) + secondary (gold-outline). Either can be hidden.
- **Meta** `.hero__meta` (bottom-right): counter + dots. Hidden < 760px.
- **Scroll cue**: centered bottom, a 1px line that grows/shrinks on a `2.2s` loop.

---

## 2. The HEADER (nav)

### Two modes
- **Transparent-over-hero** (`header.nav`): used on the home page. `position: fixed; z-index: 100`, white text, NO background — it floats over the hero image.
- **Solid** (`header.nav.nav--solid`): used on interior pages (roster/model/about). `position: sticky`, dark glass background from the start.

### Scroll behavior (the key interaction)
- `impronta.js` adds class `.scrolled` to the transparent nav once `window.scrollY > 40`.
- `.scrolled` animates (over `0.5s --ease`): background → `rgba(10,9,12,0.82)` with `backdrop-filter: blur(16px) saturate(140%)`, vertical padding shrinks `24px → 15px`, a gold hairline + soft drop shadow appear, and the wordmark turns gold.
- Removing scroll past the threshold reverses it. Transitioned properties: `background, padding, box-shadow` (+ brand color).

### Contents (left → right)
- **Wordmark** `.nav__brand`: display serif, wide tracking. White over hero; gold when solid/scrolled. (Currently text "IMPRONTA"; should support an image logo too.)
- **Nav links** `.nav__links`: uppercase, tracked; hover grows a gold underline (`::after` width `0 → 100%`, `0.4s`).
- **Right cluster** `.nav__right`: EN/ES **language toggle** (active = gold), a **CTA button** (`.btn--light`, gold-outline), and the **burger** (mobile only).

### Mobile (≤ 1080px)
- Nav links + lang + CTA are hidden; the **burger** appears.
- Burger click toggles `body.menu-open`:
  - **Full-screen overlay** `.mobile-menu` (background `--espresso`) slides down from `translateY(-100%) → 0` over `0.6s --ease`.
  - Large display-serif links, hover gold; a footer line `Tulum · Mexico City · Ibiza`.
  - Burger bars **morph into an X** (CSS transforms).
- ≤ 760px: `.hero__meta` (counter/dots) hidden; H1 clamps smaller; section paddings shrink. Hero uses `100svh` so it respects mobile browser chrome.

---

## 3. Animation inventory (everything that moves)
| Element | Motion | Spec |
|---|---|---|
| Hero slides | Crossfade | opacity `1.6s --ease` |
| Hero image | Ken Burns zoom | `scale 1.04→1.14`, `9s`, per active slide |
| Hero autoplay | Auto-advance | every `5200ms` (off when reduced-motion) |
| Header | Transparent → solid | bg/padding/shadow `0.5s` at `scrollY>40` |
| Nav link | Underline grow | gold, width `0→100%`, `0.4s` |
| Wordmark | Color shift | white → gold on scroll |
| Scroll cue | Pulsing line | `2.2s` loop |
| Mobile menu | Slide-down | `transform 0.6s`; burger → X |
| On-scroll content | Reveal | IntersectionObserver adds `.in`; opacity + `translateY(28px→0)`, `1s`, staggered `.d1–.d4` |
| Marquee strip (below hero) | Infinite scroll | `38s linear`, pauses on hover |
| Cards/buttons | Hover | image `scale 1.05` + brighten; button `translateY(-2px)` + brightness |

All motion respects `@media (prefers-reduced-motion: reduce)` (animations off, reveals shown).

---

## 4. EVERY lever to expose as a freeform control
The design is a FOUNDATION, not a fixed layout. These are the knobs a developer should surface so nothing is locked:

### Slider-level
- Slide count: 1 (static hero) … N.
- Autoplay on/off; interval (ms); loop on/off.
- Transition type: crossfade / horizontal slide / vertical / none; transition duration.
- Ken Burns on/off; zoom amount; direction (in/out, pan L/R).
- Navigation UI: dots / arrows / progress bar / thumbnails / none; counter on/off; pause-on-hover on/off.
- Hero height: full (`100svh`) / large / medium / custom; min-height.
- Global overlay/scrim: none / light / dark / custom gradient + opacity; vignette on/off.
- Grain/texture: on/off + opacity.
- Default content alignment: horizontal (left/center/right) + vertical (top/middle/bottom).

### Per-slide (each slide is its own freeform canvas)
- Background: image (with focal-point/`object-position`), OR video, OR solid/gradient.
- Per-slide image filter: none / brightness / grayscale / duotone(gold) / blur.
- Per-slide scrim override.
- Content mode: **(a) freeform per slide** (drop any components into the slide), **(b) shared/fixed content** that stays put while only the background changes, or **(c) structured fields** (eyebrow / heading / sub / CTAs) for quick edits.
- Per-slide text color + alignment override.
- Per-slide CTAs: 0, 1, or 2 buttons, each with label + link + style.
- Ken Burns/transition override per slide.

### Header-level (see gap analysis in the dev prompt)
- Transparency over hero: on/off.
- Scroll-to-solid: on/off + threshold (px or % of hero); solid background color + blur amount; show/hide hairline + shadow.
- Position: fixed / sticky / static; header height; padding.
- Logo: text wordmark (font/tracking/color) OR uploaded image (+ height); link target.
- Nav links: editable list (label + link + optional dropdown/mega-menu); hover style.
- Language toggle: on/off; list of languages.
- CTA button(s): 0–2, each label + link + style.
- Social links: editable list (platform + URL → icon).
- Layout: logo position (left/center) and which region holds links (left/center/right); 3 freeform regions (left / center / right) where arbitrary components can be dropped.
- Mobile: breakpoint; menu style (full-screen overlay / side drawer / dropdown); what shows in the mobile menu (links, socials, CTA, language, secondary text).
- Per-page override of the shell header (e.g. a darker header on a specific landing page).

---

## 5. Color + type tokens (Noir & Or)
- Page bg `#0b0a0d`; dark band `--espresso #100e13`; panels `#1b1722`.
- Text `--ink #ece4d3` (warm off-white); muted `rgba(236,228,211,.48)`.
- Gold `--gold #c6a14e`; bright gold `--champagne #e0c074`; deep `--gold-deep #9c7d35`.
- Gold gradient (buttons/badges): `linear-gradient(135deg,#d9b96a,#c6a14e 55%,#a8843a)`.
- Hairline `rgba(198,161,78,0.26)` (gold-tinted).
- Display serif: **Cormorant Garamond** (600 for headings). UI/sans: **Jost** (300–500).
- All of the above should be theme tokens so the SAME component can render Espresso Editorial / Atelier Blanc / Noir & Or by swapping the token set.

> Note: the gold inset frame that used to sit around the hero has been removed per feedback. If a "framed hero" option is wanted, it should be an opt-in control, not a default.
