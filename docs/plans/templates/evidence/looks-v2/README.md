# Looks v2 — the three flagships on the QA tenant (2026-09-16, localhost:3061, `tpl-qa-studio`)

Composed with `lookId: ember` (POST /api/dev/compose-site), the tenant's own images from the Visual Asset Engine run (15 tenant-generated frames), no AI copy provider locally (fallback copy), owner logo absent (wordmark header).

- `ember-home-1440.webm` — **the recording**: hero Ken Burns + crossfade over three tenant frames, marquee, statement, sections rising on scroll, sticky story, gallery rail with hover zoom.
- `ember-home-1440.jpg`, `ember-home-390.jpg` — full pages after a scroll pass (entrance animations need the viewport to reach them; a cold full-page capture shows unrevealed sections as blank, which is the animation working, not a hole).
- `ember-menu-1440.jpg`, `ember-gallery-1440.jpg`, `ember-about-1440.jpg`, `ember-contact-1440.jpg` — inner pages under the same Look (menu shows the honest "not published yet" state: the fixture has no menu items).

Known on these captures: the header/footer wordmark reads "AURA MODELS" (dev sign-in banner tenant + the shell flag on this dev server), not what a tenant sees; the "Rendering…" pill is the dev overlay.

Renderer fixes made for this Look (in the branch): the native kinds' secondary text (`sticky_scroll` body, eyebrows, `p2a-copy`, marquee tags…) was a fixed dark `rgba(18,18,18,…)` and vanished on a dark canvas, now `color-mix` from `--token-color-ink`; the sticky story stacks under 768 px; hero CTAs follow the theme radius.

## `luxe` (beauty default) — nail salon fixture "Uñas Marisol"

Facts: gel and acrylic nail art, "women who want a calm hour for themselves", hours, WhatsApp, 4 staff. The engine made 16 nail-salon frames for the tenant ($0.20 over two jobs); the previous sushi frames were correctly left out (a tenant's images are bound to the type they were made for). `luxe-home-1440.webm`, `luxe-home-1440.jpg`, `luxe-home-390.jpg`. Porcelain canvas, rose primary (swapped from plum after the first capture: plum vanished on the hero scrim), plum accent, editorial serif, blur-in reveals, plum statement band.

## `tide` (wellness default) — spa fixture "Spa Ceiba"

Facts: massage and temazcal rituals, couples and travellers, "a jungle garden in Tulum", hours, WhatsApp, 6 staff. 7 tenant frames ($0.09); one slot `moderation_blocked` after the reword retry (a massage "client's moment"), one slot outside the tenant set, so the story picture and one rail frame fall to the **universal pack (a DJ, a photo studio)**: exactly the gap the family seed closes; it waits for the owner's go. `tide-home-1440.webm`, `tide-home-1440.jpg`, `tide-home-390.jpg`. Deep green canvas, sand primary, pale statement band, fade-in reveals.

Runner finding on this run: the organisation's image limit is **5 per minute** (`rate_limit_exceeded … input-images per min: Limit 5`). The runner now paces two-in-flight then 26 s, and a rate-limited slot stays queued for the next cron minute instead of failing (D-TPL-39).

## The other ten Looks, upgraded in place (`preview/`)

Every remaining v1 Look was rewritten to the v2 recipe with its own palette and motion, keeping its id so nothing that references a Look breaks: `bold` (fitness: black + electric lime, uppercase display, slide-up), `night` (events: indigo + neon magenta, zoom-in), `editorial` (agency: white + black + orange, editorial serif, fade-left), `classic` (professional: navy + sky, rise), `playful` (education: white + coral + yellow, bounce-in, aurora), `studio` (hospitality: graphite + mint, blur-in), `warm` → titled "Amber" (craft: walnut + amber, rise), `coastal` (tours: white + turquoise + amber, slide-up), `minimal` (custom: white + black + one blue, fade-in), `dark` (charcoal + orange, rise). Captured through the preview route with the fixture business "Casa Ejemplo" and the marketing fixture photos (so the pictures repeat; the Looks are what differs): `preview/<look>-1440.jpg`, `preview/contact-sheet.jpg`. No v1 layout remains.
