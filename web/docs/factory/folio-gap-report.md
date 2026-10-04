# folio gap report: Mateo Ferrer (TAL-93011) vs the pinned mockup

- Run: widths 390, 360, 1440, demos TAL-93011, TAL-93007, locale es. Source: `npm run qa:mockup-parity` on the integrator's prod build at localhost:3001 (not rebuilt), mockup served from `web/design-references/folio` on localhost:3098.
- Matching: **by the map's fallback selectors**. The product build under test predates the data-parity-key contract, so no section could be matched by key. Re-run after the integrator builds a branch that carries it; the tool then switches to keys on its own and this report should be regenerated.
- Classifier: gap.mjs (rules below). `deltas.json` beside the run holds every delta with evidence and a suggested file.

## Deltas by layer

| Layer | Count | What it means |
|---|---|---|
| token | 11 | a computed style differs on a token-bound property: change the design's tokens or palette |
| payload | 15 | the kit slot exists; the design's tree, content or media differs: edit the design payload |
| kit | 7 | same delta on every demo, or spacing with matching content: edit the kit section or block renderer |
| platform | 7 | overflow, overlap or shell behaviour: edit the renderer |
| new capability | 0 | the mockup unit has no kit slot: needs a new slot or variant |

## 390px

### token (2)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| hero | body font size | TAL-93011 | 21px vs mockup 30px |
| comp | section background | TAL-93011 | rgb(236, 234, 229) vs mockup rgb(17, 17, 17) |

### payload (5)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| about | section not in the mockup | TAL-93011 | About (product only): 373px tall, not part of TH02 |
| footer | section not in the mockup | TAL-93011 | Shell footer (product only): 421px tall, not part of TH02 |
| socket | section not in the mockup | TAL-93011 | Footer socket (product only): 225px tall, not part of TH02 |
| comp | measures label | TAL-93007 | no text matching (estatura/height) |
| rates | row actions (>= 3) | TAL-93007 | found 2, need 3 (a, button) |

### kit (1)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| comp | section height | TAL-93011 | 200px vs mockup 124px (+61%) |

### platform (3)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| header | header wraps to rows | TAL-93011 | 2 rows at 390px (mockup: 1) |
| header | header wraps to rows | TAL-93007 | 3 rows at 390px (mockup: 1) |
| hero | no horizontal overflow | TAL-93007 | section scrollWidth 395 > 390 |

## 360px

### token (2)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| hero | body font size | TAL-93011 | 21px vs mockup 30px |
| comp | section background | TAL-93011 | rgb(236, 234, 229) vs mockup rgb(17, 17, 17) |

### payload (5)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| about | section not in the mockup | TAL-93011 | About (product only): 373px tall, not part of TH02 |
| footer | section not in the mockup | TAL-93011 | Shell footer (product only): 421px tall, not part of TH02 |
| socket | section not in the mockup | TAL-93011 | Footer socket (product only): 225px tall, not part of TH02 |
| comp | measures label | TAL-93007 | no text matching (estatura/height) |
| rates | row actions (>= 3) | TAL-93007 | found 2, need 3 (a, button) |

### kit (1)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| comp | section height | TAL-93011 | 200px vs mockup 124px (+61%) |

### platform (3)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| header | header wraps to rows | TAL-93011 | 2 rows at 360px (mockup: 1) |
| header | header wraps to rows | TAL-93007 | 3 rows at 360px (mockup: 1) |
| hero | no horizontal overflow | TAL-93007 | section scrollWidth 367 > 360 |

## 1440px

### token (7)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| hero | heading 1 font size | TAL-93011 | 273.6px vs mockup 105.3px |
| hero | body font size | TAL-93011 | 34px vs mockup 30px |
| chapters | heading 1 font size | TAL-93011 | 56px vs mockup 38px |
| chapters | heading 2 font size | TAL-93011 | 56px vs mockup 38px |
| comp | section background | TAL-93011 | rgb(236, 234, 229) vs mockup rgb(17, 17, 17) |
| rates | heading 1 font size | TAL-93011 | 64px vs mockup 44px |
| statement | heading 1 font size | TAL-93011 | 140px vs mockup 64px |

### payload (5)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| about | section not in the mockup | TAL-93011 | About (product only): 391px tall, not part of TH02 |
| footer | section not in the mockup | TAL-93011 | Shell footer (product only): 420px tall, not part of TH02 |
| socket | section not in the mockup | TAL-93011 | Footer socket (product only): 179px tall, not part of TH02 |
| comp | measures label | TAL-93007 | no text matching (estatura/height) |
| rates | row actions (>= 3) | TAL-93007 | found 2, need 3 (a, button) |

### kit (5)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| hero | first photo aspect | TAL-93011 | 1.18 vs mockup 0.75 |
| comp | section height | TAL-93011 | 232px vs mockup 124px (+87%) |
| rates | section height | TAL-93011 | 413px vs mockup 710px (-42%) |
| statement | section height | TAL-93011 | 510px vs mockup 398px (+28%) |
| hero | first photo aspect | TAL-93007 | 1.18 vs mockup 0.75 |

### platform (1)

| Section | Check | Demo | Evidence |
|---|---|---|---|
| hero | no horizontal overflow | TAL-93007 | section scrollWidth 1736 > 1440; <span> "CAMPOS" right 1736 > 1440 |

## Section geometry (reference demo)

| Section | 390px product / mockup (px tall) | 360px product / mockup (px tall) | 1440px product / mockup (px tall) |
|---|---|---|---|
| Header (masthead bar) | 40 / 39 | 40 / 39 | 75 / 39 |
| Cover (magazine masthead) | 1079 / 1083 | 1027 / 1083 | 909 / 1083 |
| Contents (anchor index) | 183 / 193 | 183 / 193 | 183 / 193 |
| Chapters (portfolio sequence) | 1692 / 1681 | 1577 / 1681 | 1403 / 1681 |
| Comp card (measure strip) | 200 / 124 | 200 / 124 | 232 / 124 |
| Rate card (#services) | 735 / 710 | 735 / 710 | 413 / 710 |
| About (product only) | 373 / n/a | 373 / n/a | 391 / n/a |
| FAQ (product only) | absent / n/a | absent / n/a | absent / n/a |
| Closing statement (Next issue) | 473 / 398 | 473 / 398 | 510 / 398 |
| Shell footer (product only) | 421 / n/a | 421 / n/a | 420 / n/a |
| Footer socket (product only) | 225 / n/a | 225 / n/a | 179 / n/a |

## Rules

- token: heading or body font family, size (more than 10 percent or 2px), weight (100), colour (16 per channel) or section background differs.
- payload: section absent although its kit slot exists, section order, heading text or count, photo count, action count, structure rules failing on the product only, i18n leaks, sections the mockup lacks.
- kit: spacing or height with matching content, text-transform, first photo aspect; or a payload delta that every demo shows.
- platform: horizontal scroll, overlapping or clipped layout, header rows, stacked fixed bars.
- new capability: mockup unit with no `TALENT_KIT_SECTIONS` slot.

## How to read it

- Tokens and text are judged on Mateo only. TAL-93007 (Sofía Campos) is a second Folio demo in another look, so her colours and copy differ by design. She only contributes structure, layout and geometry, which is how a payload delta is promoted to a kit delta (same delta on every demo). No promotion happened in this run: the three structure deltas on Sofía (`comp` measures label, `rates` row actions, header rows) are her content and her wider header, and Mateo does not show the first two.
- Product-only sections (`about`, shell `footer`, `socket`) are listed as payload deltas because TH02 has none of them. `faq` is absent for Mateo (no FAQ content), which is not a delta.
- The mockup renders the 1440 frame at 1440, phones at 390 and 360. The hero is measured over `.fo-mast` + `.fo-name` + `.fo-spread` (the tool wraps those siblings in a measuring box).

## Reproduce

```
python3 -m http.server 3098 --bind 127.0.0.1 --directory web/design-references/folio   # mockup
cd web && npm run qa:mockup-parity -- --design folio --talents TAL-93011,TAL-93007 --widths 390,360,1440 --states static --out <dir>
npm run qa:parity-gap -- --from <dir> --report docs/factory/folio-gap-report.md
```
Interaction states (chat, dock, booking) are not compared for Folio: the TH02 mockup does not script them the way the Maison v2 mockup does.
