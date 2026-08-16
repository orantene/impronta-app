# Self-hosted build-time fonts

These `.woff2` files replace `next/font/google` in `src/app/layout.tsx`
(loaded via `next/font/local` from `src/app/fonts.ts`). Self-hosting removes
the build-time network dependency on `fonts.googleapis.com` /
`fonts.gstatic.com` that intermittently broke `main` (Turbopack
`Module not found` on a flaked `.woff2` fetch, e.g. CI run 31917624075).

All seven families are licensed under the **SIL Open Font License 1.1**
(<https://openfontlicense.org>), which permits bundling and redistribution.
The full license text for each family's authors is included alongside this
file (`OFL-<Family>.txt`, fetched from the upstream `google/fonts` OFL
directory).

| File | Family | Weight(s) as used in `layout.tsx` | Style | License |
|---|---|---|---|---|
| `geist.woff2` | Geist | 400, 500, 600, 700 | normal | `OFL-Geist.txt` |
| `geist-mono.woff2` | Geist Mono | variable (100–900, no explicit weight in source) | normal | `OFL-GeistMono.txt` |
| `raleway.woff2` | Raleway | 400, 500, 600, 700 | normal | `OFL-Raleway.txt` |
| `inter.woff2` | Inter | 400, 500, 600, 700 | normal | `OFL-Inter.txt` |
| `cinzel.woff2` | Cinzel | 400, 500, 600, 700 | normal | `OFL-Cinzel.txt` |
| `playfair-display.woff2` | Playfair Display | 400, 500, 600, 700 | normal | `OFL-PlayfairDisplay.txt` |
| `fraunces.woff2` | Fraunces | variable (100–900, opsz 9–144, SOFT 0–100) | normal | `OFL-Fraunces.txt` |
| `fraunces-italic.woff2` | Fraunces | variable (100–900, opsz 9–144, SOFT 0–100) | italic | `OFL-Fraunces.txt` |

## Why one file per family covers every requested weight

Each of these families ships to Google Fonts as a **variable font**. When
`next/font/google` requested the discrete weights `400;500;600;700`, Google
returned the *same* variable `.woff2` URL for all four `@font-face`
declarations (verified by diffing the `src:` URLs in the returned CSS) — the
discrete weights are just different `font-weight` values pointing at one
file, and the browser renders the requested instance from the variable axis.
So one download per family, declared in `next/font/local` with a
`weight: "<min> <max>"` range, reproduces the exact same runtime rendering
as the original multi-weight `next/font/google` config, with no extra bytes.

`geist.woff2`, `raleway.woff2`, `inter.woff2`, `cinzel.woff2`, and
`playfair-display.woff2` are byte-identical to the pre-existing test fixtures
at `../../../scripts/fidelity/fonts/*.woff2` (same upstream source, same
`latin` subset, same weight range) — confirmed by SHA-256. `geist-mono` and
`fraunces` differ from those fixtures because the fidelity harness uses a
narrower approximation (400–700, no extra axes) than what production
actually requests.

## Subsetting: latin only

`next/font/google`'s CSS response includes `@font-face` blocks for every
subset Google serves for a family (cyrillic, cyrillic-ext, greek, latin,
latin-ext, vietnamese, ...) — the `subsets: ["latin"]` option passed in code
only controls which subset gets `rel=preload`, it does **not** filter which
files ship in the build. All of those extra-script files were being silently
bundled and shipped to every visitor before this change.

This repo's UI copy is English and Spanish only (see
`reference_i18n_two_systems` in project memory / `ES_TEXT` catalog). The
Latin-1 range downloaded here (`U+0000-00FF` plus common punctuation/currency
marks) fully covers both languages, including Spanish diacritics (á é í ó ú
ñ ¿ ¡). Dropped: cyrillic, cyrillic-ext, greek, greek-ext, latin-ext,
vietnamese — none of which this product serves. This is a deliberate size
reduction, not an oversight; if a future locale needs latin-ext or another
script, download the matching `/* <subset> */` block from the same CSS2
response and add it as an additional `next/font/local` `src` entry with the
matching `unicode-range`... next/font/local doesn't support multiple
unicode-range files per weight directly, so that would need a small custom
`@font-face` addition instead.

## Provenance (for refreshing later)

Downloaded with a desktop Chrome user agent (to get `.woff2`) from:

```
https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap
https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap
https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap
https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&display=swap
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap
https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap
https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,100..900,0..100;1,9..144,100..900,0..100&display=swap
```

then the `latin`-subset `.woff2` URL was extracted and downloaded directly
from `fonts.gstatic.com`. These are exactly the URLs Next's own
`next/font/google` loader would have generated for the weight/style/axes
config previously in `layout.tsx` (verified by calling Next's internal
`getFontAxes` / `getGoogleFontsUrl` helpers with the same arguments).

These are production assets — unlike `scripts/fidelity/fonts`, they are
served to real visitors via `next/font/local`, not test-only.
