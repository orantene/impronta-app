# Looks v2 — `ember` flagship on the QA tenant (2026-09-16, localhost:3061, `tpl-qa-studio`, sushi fixture)

Composed with `lookId: ember` (POST /api/dev/compose-site), the tenant's own images from the Visual Asset Engine run (15 tenant-generated frames), no AI copy provider locally (fallback copy), owner logo absent (wordmark header).

- `ember-home-1440.webm` — **the recording**: hero Ken Burns + crossfade over three tenant frames, marquee, statement, sections rising on scroll, sticky story, gallery rail with hover zoom.
- `ember-home-1440.jpg`, `ember-home-390.jpg` — full pages after a scroll pass (entrance animations need the viewport to reach them; a cold full-page capture shows unrevealed sections as blank, which is the animation working, not a hole).
- `ember-menu-1440.jpg`, `ember-gallery-1440.jpg`, `ember-about-1440.jpg`, `ember-contact-1440.jpg` — inner pages under the same Look (menu shows the honest "not published yet" state: the fixture has no menu items).

Known on these captures: the header/footer wordmark reads "AURA MODELS" (dev sign-in banner tenant + the shell flag on this dev server), not what a tenant sees; the "Rendering…" pill is the dev overlay.

Renderer fixes made for this Look (in the branch): the native kinds' secondary text (`sticky_scroll` body, eyebrows, `p2a-copy`, marquee tags…) was a fixed dark `rgba(18,18,18,…)` and vanished on a dark canvas, now `color-mix` from `--token-color-ink`; the sticky story stacks under 768 px; hero CTAs follow the theme radius.
