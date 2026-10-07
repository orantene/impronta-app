# Page builder + design UX audit (Maison-class leftovers)

Date: 2026-10-04 · Checkout tip at audit: `2982c647d` · Surfaces: talent site page builder, Maison v2 / theme demos, sticky docks, Nail Studio, demo hosts.

Same defect class as the last ~20 minutes of Maison/demo UX work: constrained desktop sections, white `surface-raised` slabs, sticky bottom chrome collisions, mobile-good/desktop-broken widgets, Save/share clutter, demo host naming.

---

## Severity key

| Sev | Meaning |
|---|---|
| **P0** | Blocks or obscures a primary guest action on a live demo |
| **P1** | Clear desktop / demo visual-layout defect |
| **P2** | Secondary polish / consistency |

---

## In-flight ownership (do not collide)

| Finding class | Owner |
|---|---|
| Maison services width / nail white `surface-raised` / desktop Nail Studio / Save-look modal | [#2528](https://github.com/orantene/impronta-app/pull/2528) — **do not duplicate** |
| Language prompt stuck under See services / chat dock (yield while Maison dock/pill up) | [#2527](https://github.com/orantene/impronta-app/pull/2527) (`cursor/language-bar-dock-yield-0f6c`) — **do not duplicate** |
| `{slug}-demo.tulala.digital` hosts | [#2526](https://github.com/orantene/impronta-app/pull/2526) (`cursor/demo-host-suffix-08c9`) |

---

## P0 — sticky bottom chrome

### P0-1. English language bar under See services / Hablar — **owned by [#2527](https://github.com/orantene/impronta-app/pull/2527)**

| Layer | Pointer | Detail |
|---|---|---|
| Locale banner | `web/src/components/locale-suggestion-banner-client.tsx` L77–80 | `fixed … bottom-0 z-50`, `data-locale-suggestion` |
| See services pill | `web/src/lib/site-admin/builder-node/services-catalog-filter.tsx` L510–536 | `.cb-bar` / `mobileBar: "pill"` |
| Yield (PR) | `catalog-booking-styles.ts` via #2527 | Hides `[data-locale-suggestion]` while `.cb-dock` / `.cb-bar` is up (same pattern as consent) |

**Do not duplicate.** This audit worker does not edit that yield CSS.

### P0-2. Hablar / help bubble ignore locale (and legacy `.mn-bar`) — **fixable now**

| Pointer | Issue |
|---|---|
| `web/src/app/t/[profileCode]/_chat/use-yield-booking-bar.ts` L30–53 | Measures `.cb-bar` / pill / dock only — never `[data-locale-suggestion]` or `.mn-bar` |
| `web/src/app/t/[profileCode]/_chat/help-bubble-logic.ts` L98–112 | `findHelpBubbleBarTops` same gap |

Even after locale yields to the dock, Hablar still sits on the language strip when the dock is idle. Complementary to P0-1 (lift FAB/bubble; do not reposition the locale banner).

### P0-3. Soft sticky category chips sandwich phone chrome — **fixable now**

| Pointer | Issue |
|---|---|
| `web/src/lib/talent-site/theme-catalog/collection/design-type-system-soft.ts` L66–69 | Phone sticky chips `top: calc(var(--site-header-h,0px) - 1px)` — **0px fallback** vs desktop `72px`; no dock clearance / `scroll-padding-bottom` |

Header + chips + See-services pill eat the viewport on Maison soft chrome phones.

---

## P1 — width / white panels / Nail / catalogs

### P1-1. Maison services half-width + AUD-042 — **owned by [#2528](https://github.com/orantene/impronta-app/pull/2528)**

| Pointer | Detail |
|---|---|
| `render.tsx` L4518, L4561–4565 | Catalog children capped 1120px unless `data-content-width="full"` |
| `maison-v2.ts` L350–400 | New publishes set `contentWidth: "full"` + `maxWidth: "full"` |
| `maison/design-payload.ts` L47–62 | Legacy Free Maison: wide + `surface-raised` |

**Do not duplicate** Maison tree / band / payload edits. Shared kit `design-parts.ts` width opts for **non-Maison** Designs (Gridline/Folio) remain this worker’s leftover.

### P1-2. White `surface-raised` bands / nested cards — **owned by [#2528](https://github.com/orantene/impronta-app/pull/2528)** (Maison bands)

| Pointer | Detail |
|---|---|
| `gallery-meta.ts` L328, L469–470 | Rosé page `#FCF7F7`, section `#FFFFFF` → `color.surface-raised` |
| `maison-v2.ts` L120, L305, L372, L479 | `SURFACE_BAND` on menu / about / ticker |
| `services-catalog-row-card-css.ts` L22, L31 | Row cards also `surface-raised` |

### P1-3. Soft FAQ / reviews solid SURFACE — **leftover (CSS, this PR)**

| Pointer | Detail |
|---|---|
| `design-type-system-soft.ts` | Reviews/FAQ solid `SURFACE`; flat when page≈section (Porcelain) |

Tint / color-mix on soft chrome only — does **not** retouch Maison `SURFACE_BAND` (#2528).

### P1-4. Nail Studio band desktop constrained — **owned by [#2528](https://github.com/orantene/impronta-app/pull/2528)**

| Pointer | Detail |
|---|---|
| `demos/app-placement.ts` L31–46 | `nailBand()`: `maxWidth: "wide"` + `surface-raised` |
| `nail-designer-frame.tsx` / `public/apps/nail-studio/` | Desktop layout + Save-look modal |

### P1-5. Save / Share / Download clutter — **owned by [#2528](https://github.com/orantene/impronta-app/pull/2528)**

Only public app under `web/public/apps/` is `nail-studio`. No second Save-look surface.

### P1-6. Gridline / Folio / Solace catalog width — **fixable now (template)**

| Pointer | Detail |
|---|---|
| `design-parts.ts` L81–86 | Every Design’s services band: `maxWidth: "wide"` |
| `gridline.ts` L59–73, L100 | Matrix in 960 band; **no** `contentWidth: "full"` — gallery audit: Alex “squeezed / empty right” |
| `designs.ts` `buildSolacePayload` L71–83 | Intentional `columns: 1` editorial — **do not “fix”** without design ask |
| `designs.ts` Folio L317–335 | fullBleed shell + magazine rate_card; rows stay 1-col (tall Rates) |
| `services-catalog-matrix.tsx` L57–91 | `@container … 720px` can keep phone cards inside a padded 960 nested preview |

Highest-leverage leftover: Gridline `contentWidth: "full"` (+ optional section `maxWidth: "full"`) via Builder Lab publish.

---

## P2 — naming / secondary chrome

### P2-1. Demo hosts `{slug}-demo.tulala.digital` — **owned by #2526**

Bare slugs still live on production until that draft merges + deploys. Do not reopen unless broken after merge.

### P2-2. Legacy `.mn-bar` z-45 vs locale z-50

`web/src/app/t/[profileCode]/_maison/maison-styles.tsx` L234. Builder shell uses `.cb-bar`; legacy `/t/<code>` Maison path still ships `.mn-bar`. Hablar should yield for it (same as P0-2).

### P2-3. Consent vs locale stacking

Consent already yields for dock; #2527 also yields locale for dock. Residual: when dock is idle and both consent + locale show, locale (z-50) covers consent (z-40). Defer until after #2527 merges (same CSS line) — then optionally `body:has([data-locale-suggestion]) [data-consent-banner]{display:none}`.

### P2-4. Other bottom chrome

Demo toast (`render.tsx` ~L4504), ticket float, `bottom_tab` nav, public flash — secondary; coordinate bottoms after P0 stack is clean.

---

## Bottom chrome z-index map

| Chrome | Selector | z | Yields to dock? |
|---|---|---|---|
| Consent | `[data-consent-banner]` | 40 | Yes |
| Legacy Maison bar | `.mn-bar` | 45 | n/a |
| Locale suggestion | `[data-locale-suggestion]` | 50 | **No** (owned) |
| See services / Continuar | `.cb-bar` / `.cb-dock` | 80 / 81 | — |
| Guest chat | `[data-guest-chat-launcher]` | 95 | Continuar only today |
| Help bubble | `.tl-hello` | 97 | Anchors to dock ask |

---

## Fix plan for this worker

Draft PR: [#2530](https://github.com/orantene/impronta-app/pull/2530) (`cursor/builder-design-ux-357b`).

| ID | Action | Status |
|---|---|---|
| P0-1 | Owned by [#2527](https://github.com/orantene/impronta-app/pull/2527) | skip |
| P1-1, P1-2, P1-4, P1-5 | Owned by [#2528](https://github.com/orantene/impronta-app/pull/2528) | skip |
| P2-1 | Owned by [#2526](https://github.com/orantene/impronta-app/pull/2526) | skip |
| P0-2 | Lift Hablar + help bubble for locale + `.mn-bar` (complementary to #2527; no yield CSS) | **[#2530](https://github.com/orantene/impronta-app/pull/2530)** |
| P0-3 | Soft sticky chip `72px` fallback + dock scroll-padding | **[#2530](https://github.com/orantene/impronta-app/pull/2530)** |
| P1-3 | Soft FAQ/reviews tint mix (no Maison band edits) | **[#2530](https://github.com/orantene/impronta-app/pull/2530)** |
| P1-6 | Gridline/Folio `contentWidth: "full"` (+ kit opt, matrix viewport MQ) | **[#2530](https://github.com/orantene/impronta-app/pull/2530)** |
| P2-3 | Consent↔locale idle stack | defer post-#2527 |

---

## Oran verify checklist (after this PR + sibling merges)

**Alba demo** (`alba-nail-artist` / `-demo` once #2526 is live):

1. Desktop menu width + Nail band + Save-look → verify on [#2528](https://github.com/orantene/impronta-app/pull/2528) after it merges (not this PR).
2. Soft chrome phone: sticky category chips sit under the header; last service rows stay tappable above See services (**this PR**).
3. English visitor: language strip yields while See services / chat dock is up ([#2527](https://github.com/orantene/impronta-app/pull/2527)); Hablar sits above the strip when the dock is idle (**this PR**).
4. Nail Studio Save-look modal → [#2528](https://github.com/orantene/impronta-app/pull/2528).

**Second demo (Gridline Alex or Camila Maison):**

5. Gridline services matrix shows the desktop comparison table (not stacked phone cards) and spans the band after Design republish / **this PR**.
6. Soft FAQ/reviews cards keep a soft tint (not flat white-on-white on Porcelain) — **this PR**.
7. Host naming: prefer `*-demo.tulala.digital` after [#2526](https://github.com/orantene/impronta-app/pull/2526); bare host should 308 once that ships.

---

## Search coverage

`surface-raised`, `cb-bar` / `cb-dock`, locale suggestion, consent banner, AUD-042 / `contentWidth`, Save look / share / download, `-demo`, maison-v2, nail studio / `app-placement`, Folio / Gridline / Solace `servicesSection`, soft chrome sticky chips, help-bubble / yield booking bar.
