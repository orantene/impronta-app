# TUL-38 — Demo talents, unique theme each (first slice)

**Card:** [TUL-38](https://app.notion.com/p/3ef2c5ee9743818b899ffac2028b0775) · Epic [TUL-110 Themes & demos](https://app.notion.com/p/3f22c5ee9743817abb6dfc52b3be7706) · Done-checklist **#78**

**Goal:** ~11 curated demos (not 224 workbook rows), each on a **distinct** gallery theme, with real-looking content packs (Spanish primary, English secondary) and **platform stock images only**.

**This PR (slice 1):** plan + guarded seed for the first **5** demos. Dry-run by default. PM runs `--apply`.

---

## Rules

| Rule | Detail |
|---|---|
| One theme per curated demo | No two curated showcase demos share a design slug |
| Locales | `preferred_locale = es`; `supported_locales = [es, en]`; every user-facing string has both |
| Imagery | Platform lifestyle stock only (`platform_stock_images` / Tulala Stock). No Unsplash, no mockup local files |
| Targets | `TAL-93xxx` + `is_demo = true` + demo email + `app_metadata.demo_batch`. Never TAL-93938 (Jorgelina). Never write TAL-93900 from this script |
| Apply | PM only. Agent dry-runs. No `db:push` |

Code: `web/scripts/demo-talents/unique-theme-map.ts`, `unique-theme-seed-lib.ts`, `unique-theme-seed.mts`.

---

## Theme → demo → content pack

### Slice 1 (this PR) — five demos

| # | Theme | Demo | Code | Slug | Trade | Stock type → family | Pack id |
|---|---|---|---|---|---|---|---|
| 1 | `maison-v2` | Alba | TAL-93020 | `alba-nail-artist` | Nail & lash artist | `nail-salon` → `beauty` | `pack-maison-v2-alba` |
| 2 | `folio` | Mateo Ferrer | TAL-93011 | `mateo-ferrer` | Fashion model | universal `custom` (no solo-model type) | `pack-folio-mateo` |
| 3 | `gridline` | Alex Treviño | TAL-93030 | `alex-trevino` | Electrician | `handyman` → `professional` (closest stock type) | `pack-gridline-alex` |
| 4 | `solace` | Valeria Ortiz | TAL-93001 | `valeria-baila` | Dance instructor | `dance-studio` → `fitness` | `pack-solace-valeria` |
| 5 | `frame` | Tomás Aguilar | TAL-93009 | `tomas-retratos` | Portrait photographer | `portrait-photographer` → `craft` | `pack-frame-tomas` |

### Slice 2+ (planned, not seeded here)

| Theme | Demo | Code | Notes |
|---|---|---|---|
| `mono` | Pablo Serrano | TAL-93010 | Personal trainer; unfinished theme, still a curated slot |
| `maison` (v1) | — | — | Gallery uses the Maison seed pack (`demo_nails`), not a TAL-93 talent. Skip until a dedicated talent demo exists |
| Next finished themes (TUL-37) | TBD | TBD | Each new finished theme gets exactly one curated showcase demo |

Remaining gallery demos (Camila, Renata, guide THEME_DEMOS, etc.) stay as **profession variants** on a shared theme; they are not the unique-theme showcase set.

---

## Content pack shape

Each pack (see `unique-theme-map.ts`) carries:

1. **Identity** — theme, profileCode, siteSlug, city, trade labels (es/en)
2. **Locales** — Spanish primary, English secondary
3. **Copy** — tagline, bio, hero eyebrow/heading/lede, service names + descriptions (es + en). Neutral Mexican Spanish (tú). No em dashes. No "buyer" / "cart"
4. **Stock slots** — ordered roles (`hero`, `portrait`, `gallery`×N, `detail`) resolved at run time from `queryLifestyleStockForType` (type → family → universal). Dry-run prints picks; `--apply` attaches only after every required slot resolves
5. **Theme** — design slug the site draft must wear (showcase uniqueness)

Prices stay on the existing demo offering rows; this slice does not invent new money paths.

---

## Seed script

```bash
cd web
# Dry run (default): plan only, zero writes
DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=.env.local \
  scripts/demo-talents/unique-theme-seed.mts

# First five only is the default; optional filter:
... unique-theme-seed.mts --only TAL-93020,TAL-93011

# PM apply (writes). Never run from an agent session against production.
... unique-theme-seed.mts --apply
```

**Guards (hard refuse):**

- Profile code not in the slice-1 allow-list
- Code not matching `TAL-93\d{3}`
- Email not on a demo domain
- `is_demo !== true`
- Auth `demo_batch` missing / mismatched when checked
- Forbidden codes: TAL-93938, TAL-93900, and any non-allow-listed code
- Missing stock for a required slot → refuse apply for that demo (dry-run still reports the gap)

**Apply does:** bilingual profile fields (`short_bio`, `bio_i18n`), preferred locale, site theme draft alignment, stock media attach onto the demo profile. Does **not** publish. PM can publish / `demos:rebuild` afterwards.

---

## Why these five first

Finished gallery themes (`maison-v2`, `folio`, `gridline`) each get their featured reference demo. Solace and Frame are the strongest unfinished designs that already have built demos and cover different trades (dance, photography). Mono waits for slice 2 so the first five stay visually and professionally distinct.

---

## Out of scope (later slices)

- Seeding all ~11 / 224 workbook rows
- Finishing solace/mono/frame (TUL-37)
- Replacing Unsplash on non-curated guide demos
- Publishing or aliasing QA hosts
- Theme Studio (TUL-20)
