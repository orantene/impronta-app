# Services rebuild: overnight execution plan (2026-09-24)

Target: every screen in `pages/p01..p38.png` matches 1:1 on Jor Beauty's
workspace at `localhost:3244/talent/services`, every action works on her real
data, evidence captured under `evidence/`. Branch `feat/services-rebuild` only.
No merge to main, no production pointer, no live-site restyle (owner decides).

## Loop per gap
1. Open PDF page, open the live screen, compare side by side.
2. Fix code, reload, screenshot to `evidence/pNN-*.png`.
3. Commit (small). Gates (typecheck, lint) every few commits.

## Gaps (ordered)
| # | PDF | Gap | Accept when |
|---|---|---|---|
| G0 | all | typecheck/lint never run on branch | both exit 0 |
| G1 | 3,4 | only 2/22 items have photos | every item shows a cover from her portfolio |
| G2 | 17-18 | top bar shows "91% Your website is live" | quiet "Website live" state when site is live |
| G3 | 4 | attention banner lacks "!" icon, button style | matches p04 |
| G4 | 5 | Add item type dialog | matches p05, each type opens editor |
| G5 | 6,7,12 | editor layout (steps) | matches, save works |
| G6 | 8-11 | publish flow, banner, preview | matches, state flips |
| G7 | 13,14 | duplicate, hide/show | row updates |
| G8 | 15 | selling defaults | persists |
| G9 | 17-21 | website reward sheet | matches, opens first missing field |
| G10 | 23-29 | product, extras, portfolio picker, add many, camera | matches |
| G11 | 31-35 | categories, organize, rename (unas -> Uñas) | matches, persisted |
| G12 | 37 | state chips | matches |
| G13 | 38 | public card + services_catalog widget | renders her live items on localhost — CODE DONE, structural render test 7/7 green (services-catalog-render.test.tsx). Reuses OfferingCta (real click-to-book, same tulala:offering-request/-instant/-slot events TalentSiteMessagesDock already listens for on every talent-site page — zero new wiring needed). Caught + fixed a real bug pre-browser: OfferingCta hardcodes --plt-* vars that don't exist on Max sites; aliased to --token-color-* in the widget's own CSS. NOT YET DONE: a real click in a real browser against Jor's page — the shared dev server/Browser pane was too unstable tonight (heavy multi-session load, one Turbopack panic, /talent/site hanging in the Browser pane specifically). Next session: open /talent/site, drop a services_catalog block on a page, Preview, click Select, confirm the chat dock opens with the offering attached. |
| G14 | all | Spanish copy parity | es screens render, no raw keys |

## Out of scope tonight (owner)
Merge to main, live-site band swap, live-money booking.
