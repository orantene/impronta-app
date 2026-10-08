# Jorg Beauty LIVE — public Maison v2 prove

Updated: 2026-10-03 ~23:28Z · Agent `bc-201be4bd`  
Account: `oranteneai@gmail.com` → **Jorg Beauty** · **TAL-JORGBEAUTY** · Web Office · `https://book-jorgelina.tulala.digital`  
Goal: [production-talent-goal.md](./production-talent-goal.md) · Shots: [media/oran-live-sweep/public-maison-live/](../media/oran-live-sweep/public-maison-live/)

## Result (Oran — handoff signal)

| Check | Result |
|---|---|
| Surface under test | **Public talent site** `book-jorgelina.tulala.digital` (not dashboard Design/Colors) |
| Tip SHA | `c3214cac3` |
| Deploy | `dpl_AmaKaEA8AFiMkuzxuQxpXFRKwjKi` |
| Flag | `TALENT_MAISON_THEME_ENABLED=all` (Production + Preview) |
| DB | `theme_design_slug=maison-v2`, `theme_design_version=23`, custom palette **Rosé**, published |
| Public render | **PASS** — `data-talent-design="maison-v2"`, soft chrome, editorial type, Rosé `#B3174A` / `#FCF7F7` |
| Rosé fonts | **PASS after fix** — live CSS `Bodoni Moda` + `Figtree` (was Fraunces/Inter from stale page `__design`) |
| Routes | One-pager: `#gallery` Work · `#services` Menu · `#about` · `#location` (Visit). Separate `/services` etc. correctly 404. |
| Dashboard claim | Mi sitio “Maison v2 · Rosé” matches the public site after the font fix |

**Handoff for public Maison v2 on Jor:** YES — LIVE public site is Maison v2 · Rosé working.

Dashboard Change design / Colors alone is **not** this prove. Prior sibling handoff that stopped at Mi sitio controls is insufficient and is superseded here.

## What was wrong

1. **False “Folio” read:** HTML substring matches on `portfolio` / `sb-portfolio` were mistaken for Folio design. Canvas already had `data-talent-design="maison-v2"` and Maison node ids (`maison-v2-*`).
2. **Real defect:** Home page `talent_pages.theme.__design.tokens` still held a 2026-09-24 override (`Fraunces` + `Inter` + old pink page colors). Color keys are blocked from overriding site palette (the “Jorg Beauty case” in `accent-contrast.test.ts`), but **font keys still won**, so public headings rendered Fraunces instead of Rosé Bodoni/Figtree while the dashboard correctly claimed Maison v2 · Rosé.

## What we changed (ops / configure-only)

- Cleared `talent_pages.theme.__design.tokens` and `tokensDraft` to `{}` on home page `bad420b5-…` for TAL-JORGBEAUTY.
- No theme swap, no fake bookings, no test payments, no QA seed data.
- No code deploy required for this prove.

## Evidence (public site)

| Shot | What |
|---|---|
| [public-maison-01-home.png](../media/oran-live-sweep/public-maison-live/public-maison-01-home.png) | Hero · inset · next-free chip · ticker · Rosé CTA |
| [public-maison-02-services.png](../media/oran-live-sweep/public-maison-live/public-maison-02-services.png) | `#services` menu rail + service cards |
| [public-maison-03-gallery.png](../media/oran-live-sweep/public-maison-live/public-maison-03-gallery.png) | `#gallery` Recent work |
| [public-maison-04-about.png](../media/oran-live-sweep/public-maison-live/public-maison-04-about.png) | `#about` |
| [public-maison-05-location.png](../media/oran-live-sweep/public-maison-live/public-maison-05-location.png) | `#location` Visit + rich footer |

Dashboard-only shots from the prior pass (Mi sitio / gallery / Colors) remain under [media/oran-live-sweep/](../media/oran-live-sweep/) as control evidence only — they do not prove public Maison.

## #2508 / tip lag

[#2508](https://github.com/orantene/impronta-app/pull/2508) is on `origin/main` (`fd789c22b`) — Change design/Apps fallback. Production tip at prove time is still `c3214cac3`. Not required for this PASS: Maison=`all` + applied `maison-v2` already serve the public site.

## Rules honored

- No fake bookings / test payments / QA data on TAL-JORGBEAUTY.
- Configure-ok: cleared stale page `__design` font override only.
- Paid/booking QA stays on TAL-93900.
