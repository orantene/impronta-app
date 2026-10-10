# TUL-208 — Theme experience audit (PM 5:35 F revalidation)

**Date:** 2026-10-09  
**Status:** Dev QA · Chat = Cursor · ranked findings only (no theme release, no code ship)  
**Method:** Code + docs walk of Builder Lab → release → talent gallery → publish; read-only production HTTP on public demos. **Never signed in.** No Factory release. No writes to talent sites.  
**Priors:** [Oct 8 audit PR #2851](https://github.com/orantene/impronta-app/pull/2851) (`docs/plans/theme-experience-audit-2026-10-08.md` on that branch), [theme-release-chain-audit](../../handover/cursor-2026-10-04/docs/theme-release-chain-audit.md), [how-to-make-a-new-theme](../../factory/how-to-make-a-new-theme.md), L1 state machine (Project store `internal/epic-l1-theme-lifecycle-state-machine.md`).

---

## Verdict

The release ladder and draft-first gallery path are clearer on tip than on 2026-10-08. **G1** (`window.confirm`) is gone: Manager uses `ThemePickDraftDialog`. Finished-demo **`/en` returns 200** on Alex / Mateo / Camila / Alba (was 404). The talent experience is still weak where **apply ≠ live**, **Factory sync is raw JSON**, **Theme Review packs are incomplete**, and **EN seed still leaks Spanish** on live demos. Signed-in Builder Lab and talent dashboard were **not** browser-verified this pass.

| Lane | Score (clarity / steps / look) | Delta vs 2026-10-08 |
|---|---|---|
| A. Builder Lab Factory → release | 4/10 (code map only) | Unchanged: sync still `JSON.stringify`; Open to talents ≠ Make default |
| B1. Discover / gallery / switch | 6/10 | **Up:** draft-first dialogs on tip; **open:** Publish CTA, warn sheet, count honesty |
| B2. Public demos ES home | 8/10 | Stable |
| B3. Public demos EN `/en` | 5/10 | **Up:** HTTP 200 on ref demos; **still:** Spanish body copy (Mateo, Alba) |
| B4. Soft-nav between demos | 3/10 | Unchanged (curl titles OK; browser soft-nav not re-proven) |
| B5. Theme Review mockups | 4/10 | Unchanged: maison-v2 no `kit.js`; solace/mono/frame none |

---

## End-to-end flow (code)

1. **Author** — Platform admin → `/platform/admin/builder-lab` Talent Template Factory (`talent-factory-tab.tsx`) → edit `/talent-designs/<slug>/edit` → draft in `talent_theme_drafts`.
2. **Publish demos** — Publicar y actualizar demos → version + release + channel `demos` (`publish-design-button.tsx` → `publish-core` / `release-manager.server.ts`). Not open to talents.
3. **Open to talents** — `/platform/admin/builder-lab/themes/<releaseId>` → optin (`release-panel.tsx`). Notices only; catalog version does **not** flip.
4. **Make default** — channel `default` flips `talent_theme_catalog` (`pickApplyDesign` still prefers newest published optin/default).
5. **Talent pick / switch** — Maison setup (`PublishDesignDialog`) or Manager gallery (`ManagerThemeGallery` → `ThemePickDraftDialog`) → `theme-apply-core` draft pin. Live visitors unchanged until Publish.
6. **Theme update** — `ThemeUpdateNotice` → preview → apply draft → separate Publish (`publishMaxSiteAction`).
7. **Edit / publish** — `/talent/page-builder` + Publish drawer preflight.

Channel ladder (code): `draft → demos → optin → default`. UI labels: Draft / Demos / Open to talents / Make default. There is no channel named `stable`.

---

## Revalidation (2026-10-09 read-only)

| Check | Result |
|---|---|
| `alex-trevino-demo…/en` | **200** · title Alex Treviño |
| `mateo-ferrer-demo…/en` | **200** · body still has **Casting en persona** (ES on EN) |
| `camila-nails-demo…/en` | **200** |
| `alba-nail-artist-demo…/en` | **200** · `html lang=en` · service/review lines still Spanish (e.g. Manicura rusa, review quotes) |
| `sofia-nails-demo…/en` | **404** |
| Hard-load demo titles | Distinct per host (Camila / Lucía / Alex) |
| Soft-nav wrong-talent flash | Not re-browsered; still open as G2 / TUL-322 |
| `ManagerThemeGallery` | Uses `ThemePickDraftDialog` (no `window.confirm`) on tip |
| Factory sync UI | Still `<pre>{JSON.stringify(syncJson)}</pre>` in `talent-factory-tab.tsx` |
| `web/design-references/maison-v2/kit.js` | **Missing** |
| `solace` / `mono` / `frame` mockup dirs | **Absent** under `design-references/` |
| Gallery apply success | Text only (“saved to draft… Publish…”) — no primary Publish CTA control |

---

## Ranked findings (still open on tip)

Priority: **P0** = trust / wrong content / leave visitors on old design · **P1** = blocks good theme UX or EN · **P2** = Factory polish / inventory.

### P0

| ID | Finding | Evidence | Status | Board / PR |
|---|---|---|---|---|
| **F1** (was G5) | Apply to draft leaves live site on old design; success is a sentence, not a Publish action | `ThemeGallery.tsx` applySuccess text; `ThemeUpdateNotice` has no post-apply Publish CTA on tip | Open | [TUL-325](https://app.notion.com/p/3f32c5ee974381119f93fc782fb357dc) [#2860](https://github.com/orantene/impronta-app/pull/2860) |
| **F2** (was G2) | Soft-nav between `*-demo` hosts can show previous talent until hard reload | Oct 8 evidence; curl titles correct today | Open | [TUL-322](https://app.notion.com/p/3f32c5ee974381669f2cd57cba9a35c4) (Public bucket) |
| **F3** (was G3 residual) | EN demos load but Spanish seed remains; some demos still 404 `/en` | Mateo “Casting en persona”; Alba ES services/reviews; sofia `/en` 404 | Open | [TUL-323](https://app.notion.com/p/3f32c5ee974381d696ccc5caee6562cf) + [TUL-494](https://app.notion.com/p/3f42c5ee9743819aa8bec6daaf216b5f) [#3112](https://github.com/orantene/impronta-app/pull/3112) (needs demos:rebuild) |

### P1

| ID | Finding | Evidence | Status | Board / PR |
|---|---|---|---|---|
| **F4** (was G8) | Theme Review packs incomplete; blocks TUL-37 | maison-v2 no `kit.js`; solace/mono/frame no folders | Open | [TUL-328](https://app.notion.com/p/3f32c5ee97438147accbc413ba72a720) [#2862](https://github.com/orantene/impronta-app/pull/2862) CONFLICTING |
| **F5** (was G11) | Factory sync dumps raw JSON; catalog lag vs Open to talents confuses operators | `talent-factory-tab.tsx:88`; L1 catalog vs optin | Open | [TUL-330](https://app.notion.com/p/3f32c5ee97438190b7f9d82e4440d505) [#2871](https://github.com/orantene/impronta-app/pull/2871) |
| **F6** | Change-theme keep/map/warn/undo not live; warn sheet UI missing | [#3114](https://github.com/orantene/impronta-app/pull/3114) behaviour table; report-only unmatched | Open (PM review) | [TUL-421](https://app.notion.com/p/3f32c5ee974381859375c505d40549d6) epic L / TUL-421 |
| **F7** (was G12) | Gallery implies richer library than the 4 finished designs | `FINISHED_GALLERY_SLUGS` = 4 | Open | [TUL-331](https://app.notion.com/p/3f32c5ee9743811eabb4ffaf8bb6a362) [#2906](https://github.com/orantene/impronta-app/pull/2906) |
| **F8** | Signed-in Builder Lab → release → talent pick → edit → publish never browser-verified this wave | Platform admin + talent session required; out of read-only scope | Open | Live QA on TAL-93900 |

### P2

| ID | Finding | Evidence | Status | Board / PR |
|---|---|---|---|---|
| **F9** (was G10) | PresenceLiveFallback chrome thinner than Maison setup | Prior audit | Verify merge | [TUL-329](https://app.notion.com/p/3f32c5ee9743811baf50fcd604574264) |
| **F10** (was G13) | Font proxy 400s observed on Alba (Oct 8) | Console during capture | Open | [TUL-332](https://app.notion.com/p/3f32c5ee974381bebd85cf0e5651559f) |
| **F11** | Authored-overlay gate + many Builder Lab errors EN-only | L6 error catalogue; `authored-sync-rule.ts` | Open | Epic L follow-ups |

---

## Closed or improved since 2026-10-08 (do not re-file)

| Was | Now |
|---|---|
| **G1 / G9** dual `window.confirm` vs publish dialog | **Closed on tip** — Manager `ThemePickDraftDialog` + Maison `PublishDesignDialog` (draft primary) |
| **G3** `/en` → 404 on Alex/Mateo/Camila | **HTTP fixed** on those hosts; residual = seed/leak (F3) |
| **G7** planned demos silent fallback | **In tip** (TUL-327 hide path) |

---

## Top 8 by talent impact (today)

1. **F1** — Strong Publish CTA after theme update / gallery apply  
2. **F3** — Finish EN seed + demos:rebuild (TUL-494 / TUL-323)  
3. **F2** — Soft-nav host cache  
4. **F6** — Land + Live QA TUL-421 change theme (warn sheet next)  
5. **F5** — Factory sync human summary  
6. **F4** — Theme Review mockups (maison-v2 kit + solace/mono/frame)  
7. **F7** — Honest finished-theme count  
8. **F8** — Signed-in end-to-end Live QA script on TAL-93900  

---

## Theme Review mockup (definition, unchanged)

Pinned under `web/design-references/<slug>/`: `index.html`, `kit.js`, `img/`, `README.md`, `parity-map.json`, `content.json`, index row, parity proof, reference demo, authored overlay. **No theme is finished without a Theme Review mockup** (PM on TUL-37).

| Design | Mockup | Gap |
|---|---|---|
| maison-v2 | Partial | **no `kit.js`** |
| folio | Complete | — |
| gridline | Complete on disk | overlay / README row hygiene |
| solace / mono / frame | **None** | Full pack before TUL-37 |

---

## Surfaces not verified (sign-in required)

- Factory edit, sync, Save as new design, Publicar y actualizar demos  
- Release manager Open to talents / Make default / Rebuild demos  
- Talent gallery → Use this design → Publish on TAL-93900  
- ThemeUpdateNotice accept/skip on a live update row  
- PublishDrawer preflight with real blockers  

---

## Delivery notes

- Checklist lines for residual findings appended to Public sites (TUL-516) and Dashboard (TUL-519) buckets. **No new cards. Lines not ticked.**  
- Oct 8 evidence remains on [#2851](https://github.com/orantene/impronta-app/pull/2851); this doc is the F revalidation ranked list.  
- **NOT done:** signed-in pass, theme releases, merges, demos:rebuild, Live QA ticks.

## Done checklist (this F pass)

- [x] Chat = Cursor · F started stamp  
- [x] Code + docs walk of full ladder  
- [x] Read-only production HTTP revalidation  
- [x] Ranked findings doc under `docs/plans/theme-lifecycle/`  
- [x] Bucket checklist lines (unticked)  
- [ ] Signed-in Builder Lab / talent dashboard pass  
- [ ] Ticket Done (blocked on Live QA + open fix PRs)
