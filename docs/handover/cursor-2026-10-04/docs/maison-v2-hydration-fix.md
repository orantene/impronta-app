---
cursor:
  subagentId: "bc-209a146a-5454-506b-9c7d-fc4511e6b249"
---

# Maison v2 hydration fix — ALL talents

**Status:** ✅ **TIP-PROVE PASS** on LIVE `3a74b3ab` — Nail Designer desktop+390 + `/es` 302. Structural `37171149806` green → promote → LIVE catch-up ~03:10Z. Evidence `media/maison-v2-hydration/tip-prove/`. Pings sent to handover / front-chat / Done-board.  
**PR:** [#2511](https://github.com/orantene/impronta-app/pull/2511) · head was `149ae3b2a` on `cursor/maison-v2-hydration-b249`  
**Migration in PR:** `supabase/migrations/20261004015107_jor_locale_es_primary_en_secondary.sql` (in squash; remote ledger reconciled `20261004015125`→`20261004015107`)  
**Public prove:** `https://book-jorgelina.tulala.digital` (TAL-JORGBEAUTY)  
**Demo compare:** `https://camila-nails.tulala.digital`  
**Oran briefs:** [claude-defect-brief.png](../media/maison-v2-hydration/claude-defect-brief.png) · [expected-demo-look.png](../media/maison-v2-hydration/expected-demo-look.png)  
**Sibling:** [Own Jorgelina handover](bc-21017de6-ccea-5978-a9e4-47e76dded73a) DoD board · Edit chrome [bc-1bc0ffdd](bc-1bc0ffdd-d8d1-5dc4-ace9-3068f82674f7)

---

## Root cause (ranked)

1. **Silent empty apply** — `applyDesign` used `fallbackHydrationTokens` when `loadTemplateHydrationTokens` failed → empty headshot/gallery baked into the tree.
2. **Wrong headshot pick** — `load-starter-data` took `media[0]` by `sort_order`, so gallery work shots (lashes-classic) beat the `card` portrait (`jorgelina-portrait-v2.jpg`).
3. **Apply-time bake, no live heal** — hero / inset / about `src` were frozen at apply; profile photo changes never reached LIVE without re-apply.
4. **Nail Designer demo-only** — `placeDemoApps` ran only in the demo pipeline; real Maison v2 nail talents never got the band (pale Menu→About gap).
5. **Empty FAQ / reviews** — live-bound; Jor had 0 FAQ rows (heading could linger depending on prune/dataSources). Reviews empty → pruned band.
6. **Empty service photo slots** — `showPhoto: true` with missing `imageUrls` painted identical grey placeholders (read as “same stock thumb”).
7. **No “Refresh from my profile”** — only reapply layout / full design swap.

Not an allow-list on hydration tokens. Maison cohort flags gate setup UI only.

---

## Fix (code — all talents)

| Change | Effect |
|---|---|
| `applyDesign` hard-errors if hydration tokens missing | No more silent empty bake |
| Theme-release merge refuses empty hydration | Same |
| `pickHeadshotUrl` prefers card → hero → gallery | Portrait hero for everyone |
| `applyTalentLiveMedia` at render | Hero / inset / about heal without re-apply |
| `placeMaisonTradeApps` on apply + render | Nail Designer for nail trades (primary **or** secondary) |
| `refreshSiteContentFromProfileAction` + Design options row | Builder “Refresh from my profile” — **patches photos into existing draft only** (no `applyDesign` wipe) |
| Live-bind skips authored image overrides | `mediaId` / custom `src` / `liveMedia:false` preserved |
| Services catalog: no empty photo placeholder | No fake repeated thumbs |

**Jor content (configure OK):** published FAQ seeded (4 prompts + answers). Hero photo / About portrait srcs patched in published tree to portrait + hero work shot.

**Jor locale D1/D2 (in PR — migration `20261004015107_jor_locale_es_primary_en_secondary.sql`, applied LIVE):**  
was `preferred_locale=en` + empty `secondary_locales` while `languages=["Español","English"]` → `/es` page-slug **404**. Now `preferred_locale=es`, `secondary_locales=['en']`.

LIVE prove 2026-10-04 ~01:51Z (re-checked after handover stale 01:46 note):
| Check | Result |
|---|---|
| D1 `book-jorgelina…/es` | **302** → `/` + `Set-Cookie: locale=es` (matches camila-nails) |
| D1 `/en` | **200** + `locale=en` |
| D2 ES `/` visible hero | `Lashista`, `Ver servicios`, `Hola` — **no** visible `See services` / `Lashes that` / `The menu` |
| Nail Designer | still absent until hydration tip |

Handover board at ~01:48Z still listed D1 as 404 from a pre-fix probe — update DoD against this prove + tip.

---

## LIVE PASS/FAIL per defect (pre-tip snapshot)

| # | Defect | Pre-tip | Expected after tip |
|---|---|---|---|
| 1 | Real profile photos (hero/About) | **PARTIAL** — portrait+hero baked via SQL; gallery work still live | **PASS** — live media bind + card preference |
| 2 | Empty pale band Menu→About | **FAIL** — `#nail-designer` absent on LIVE; reviews empty/pruned | **PASS** — render-time `placeMaisonTradeApps` inserts band after Menu |
| 3 | FAQ heading, no questions | **PASS** — FAQ seeded; Questions + answers LIVE | **PASS** |
| 4 | Missing Nail Designer | **FAIL** on LIVE (pre-tip). **Pre-tip code prove PASS:** Jor taxonomy `Nail Artist` → trades `nails`; published `layerLabel:"Menu"`; `placeMaisonTradeApps` yields order `Menu → Nail designer → Reviews` with `anchorId:nail-designer` + `app_nail_designer` | **PASS** after tip on `book-jorgelina` vs `camila-nails` |
| 5 | Service rows same stock thumb | **PARTIAL** — Jor offerings already have varied media; empty-slot hide ships in tip | **PASS** |
| 6 | Recent work stock/repeat | **PASS-ish** — live portfolio from gallery (varied) | **PASS** |
| 7 | Hero floating card awkward | **PARTIAL** — improves with correct portrait/inset | **PASS** if inset+chip layout clean with real photos |

**Handoff-ready:** only after tip-prove shows every section 1:1 with demo (desktop + 390).

---

## Shots

| Set | Path |
|---|---|
| Oran briefs | `media/maison-v2-hydration/claude-defect-brief.png`, `expected-demo-look.png` |
| Demo desktop | `media/maison-v2-hydration/demo-desktop/` |
| Demo mobile 390 | `media/maison-v2-hydration/demo-mobile/` |
| Jor LIVE desktop | `media/maison-v2-hydration/jor-desktop/` |
| Jor LIVE mobile | `media/maison-v2-hydration/jor-live-mobile/` |
| Side-by-side | `media/maison-v2-hydration/side-by-side/` |

*(Filled on tip-prove pass.)*

---

## Gates / ship

- `npm run typecheck` — PASS  
- `npm run lint` — PASS  
- Merge when CI green on #2511  
- Tip = production pointer after structural gate on `main`  
- Post-tip: Cloud Chrome prove book-jorgelina vs camila-nails, desktop + 390  

## Coordination

- No fake bookings/payments on TAL-JORGBEAUTY  
- Edit site chrome break stays with sibling agent  
