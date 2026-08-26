# Media-kit PDF typeface — Noto Sans (subset)

`noto-sans-regular.ttf` and `noto-sans-bold.ttf` are the faces embedded into the
talent media-kit PDF by `../media-kit-font.ts`. They exist so a talent whose
display name is Cyrillic or Greek gets a correct PDF instead of a name mangled
into `?` placeholders by the WinAnsi fallback.

These are **not** the web fonts in `src/app/fonts/` — those are `.woff2`, which
`@pdf-lib/fontkit` cannot read. PDF embedding needs TrueType/OpenType.

## Licence

**SIL Open Font License 1.1** — full text in `OFL-NotoSans.txt`, fetched from
the upstream `google/fonts` OFL directory. OFL permits bundling, modification
(subsetting counts) and redistribution inside a larger work.

## Coverage

| Range | Script |
|---|---|
| `U+0000-00FF` | Basic Latin + Latin-1 Supplement (covers English and the full Spanish set) |
| `U+0100-017F`, `U+0180-024F` | Latin Extended-A / -B |
| `U+02B0-02FF`, `U+0300-036F` | Spacing modifiers, combining diacritics |
| `U+0370-03FF`, `U+1F00-1FFF` | Greek and Coptic, Greek Extended |
| `U+0400-04FF`, `U+0500-052F` | Cyrillic, Cyrillic Supplement |
| `U+2000-206F`, `U+20A0-20BF`, `U+2100-214F` | General punctuation, currency, letterlike symbols |

1603 codepoints per face. **CJK, Korean, Arabic, Hebrew, Devanagari and every
other script are deliberately NOT covered** — Noto Sans CJK alone is 10MB+ per
weight, which is not a sane thing to read off disk on every media-kit download.
Those names still degrade to the `?` placeholder via the sanitiser in
`../media-kit-pdf.ts`, exactly as they did before this font landed.

Do not assume "in the range" means "in the font": the runtime derives the real
coverage from the file's own `characterSet` (see `media-kit-font.ts`), so the
sanitiser tracks whatever these files actually contain.

## Size

~117 KB per face, ~234 KB total. `pdf-lib` re-subsets at `embedFont(…, {
subset: true })`, so the generated PDF only carries the glyphs it draws — a
typical kit adds single-digit KB, not 234 KB.

## Provenance (for refreshing later)

Upstream is the Noto Sans variable font. It was pinned to static 400/700
instances and then subset with `fonttools` (4.60.2). Reproduce with:

```sh
curl -sSL -o NotoSans-VF.ttf \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf'
curl -sSL -o OFL-NotoSans.txt \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/OFL.txt'

RANGES='U+0000-00FF,U+0100-017F,U+0180-024F,U+02B0-02FF,U+0300-036F,U+0370-03FF,U+1F00-1FFF,U+0400-04FF,U+0500-052F,U+2000-206F,U+20A0-20BF,U+2100-214F'

for w in 400:regular 700:bold; do
  fonttools varLib.instancer NotoSans-VF.ttf wght=${w%%:*} wdth=100 -o inst.ttf
  fonttools subset inst.ttf --unicodes="$RANGES" --layout-features= \
    --no-hinting '--name-IDs=*' --output-file=noto-sans-${w##*:}.ttf
done
```

`fonttools` is intentionally **not** a repo dependency and this is **not** a
build step: the subset files are committed. Run the above by hand if the
coverage ever needs to grow.

SHA-256 of the committed files:

```
eb9c99486385a181e596941cc2a68f803f605d0c38117113d9840c1aebd08154  noto-sans-regular.ttf
c637e28188e7c03cbb385d022f23add08f8248056666fb390ba430f82fd14c03  noto-sans-bold.ttf
```
