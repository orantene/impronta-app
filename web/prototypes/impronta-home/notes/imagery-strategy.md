# Imagery strategy

## Current limitation
No licensed real Impronta talent photography is available yet. Across v1–v4 the
single recurring acceptance blocker was that abstract placeholders (initials /
avatar-blob) read as "unfinished / not a real agency."

## Temporary choice (v5)
**Refined, art-directed editorial *illustrated* placeholders** — SVG portraits
with chiaroscuro side-lighting, hair/jaw/neck/shoulder forms, a warm dark-gold
duotone, film grain, and an editorial crop. Seeded per talent so the set looks
like one coherent photoshoot, with variation (light side, palette, hair, tilt)
so cards aren't clones.

Deliberately **not**: real strangers' photos presented as fictional Impronta
talent (legal/likeness/taste risk), generic avatar silhouettes, cartoon faces,
or cheap AI-looking art. The goal is *premium believability until real photos
arrive* — not to pretend these are photographs.

## Final direction
Replace every placeholder with **licensed Impronta talent photography**. The v5
markup is built so this is a data swap, not a redesign.

## Image slots (what's needed)
Each talent surface is tagged `data-img-slot="<slot>"` and driven by a single
`TALENT` data object. Set a talent's `image` and an `<img>` automatically
replaces the SVG — no layout change.

| Slot | Where | Count | Aspect | Suggested px |
|---|---|---|---|---|
| `heroTalentImage` | Hero stage (1 main + 2 layered) + "Featured in Riviera Maya" strip | 3 + 8 | 3:4 | main 1200×1600; layered 900×1200; strip 240×320 |
| `featuredTalentImage` | "A curated few" cards | 4 | 3:4 | 900×1200 |
| `categoryImage` | "Talent, by discipline" cards (lifestyle/discipline shots) | 6 | 3:4 (large card taller) | 1000×1250; large 1100×1600 |
| `mapTalentFaceImage` | Location preview panel faces (per pin) | 3 / location | 3:4 | 480×640 |
| `profileCardImage` | Reserved — directory & profile surfaces (not on home yet) | — | 3:4 | 900×1200 |

Format: optimized **WebP/JPG**, dark-room-friendly grade, editorial crop,
consistent warm tone so the wall of cards stays cohesive.

## How to swap real photos in later
1. Drop files into `assets/portraits/` (talent), `assets/categories/`
   (discipline/lifestyle), `assets/lifestyle/` (hero/ambient).
2. In the v5 `<script>`, set each entry's `image`, e.g.
   `"Sofía R.": { ..., image:"assets/portraits/sofia-r.jpg" }`.
   Category images: set `image` on the matching `CATS` entry.
3. Done — `portrait(name, slot)` renders `<img class="pt" data-img-slot=...>`
   instead of the SVG; CSS, crop, hover and overlays are unchanged.

No HTML/CSS edits required to go from placeholder → real photography.

## Folders
```
impronta-home/assets/
  portraits/    # talent headshots/editorial (3:4)
  categories/   # discipline / lifestyle cover shots
  lifestyle/    # hero & ambient imagery
```
