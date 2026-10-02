# How to make a new Tulala talent theme

For a designer or an agent. Follow the steps in order. Everything here is about TALENT designs.

## 0. Words

- **Design**: one talent theme (Maison v2, Folio, and so on).
- **Demo**: a demo talent that wears a design so we can see it with real content.
- **Reference demo**: the one demo whose content equals the mockup word for word (Alba for Maison v2, Mateo for Folio).
- **Overlay**: a committed JSON file that carries the editor's authored version into the code.

## 1. Where things live

Builder Lab, then **Talent Template Factory**. This is the only place for talent designs.

The agency or business Studio builder is a different product. Never mix them: do not open a talent design in the Studio builder, and do not use Studio sections for a talent design.

| What | Where |
|---|---|
| Factory tab (list of designs, Edit design in builder, Save as new design) | `web/src/components/builder-lab/talent-factory/*` |
| Design editor | `/platform/admin/builder-lab/talent-designs/<slug>/edit` |
| Release manager (release page, Open to talents) | `/platform/admin/builder-lab/themes` and `.../themes/<releaseId>` |
| Demo rebuild panel | on the release manager page (Rebuild demos) |
| Design code | `web/src/lib/talent-site/theme-catalog/collection/` |
| Authored overlays | `web/src/lib/talent-site/theme-catalog/collection/authored/<slug>.overlay.json` |
| Mockups | `web/design-references/<slug>/` |

## 2. Path A: change an existing design

1. Open the Factory tab and click **Edit design in builder**. You land on `/platform/admin/builder-lab/talent-designs/<slug>/edit`.
2. Pick a **demo** (the person shown in the canvas) and a **look** (palette). Pick the reference demo first.
3. Edit sections, text, colours and fonts. Your changes stay in a draft. They never touch a talent's site.
4. Click **Publicar y actualizar demos**. One click does all of this:
   - makes a new version and a release,
   - writes release notes in EN and ES automatically,
   - runs a dry run,
   - updates the demos.
5. Open the **release page** and review it. Check the demos, both languages, phone and desktop.
6. When you are happy, click **Open to talents**. Until then talents cannot pick the new version.
7. Commit the overlay so the code matches the database. From `web/`:
   ```
   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=<env> \
     scripts/theme-authoring/pull-authored.mts --design <slug>
   ```
   It only reads the database. It writes `authored/<slug>.overlay.json` and registers it in `authored/index.ts`. Commit both.

Why step 7 matters:
- **Sync rule**: the catalog sync never reverts an authored version. But if the code and the database disagree, the next code change fights the authored one. The overlay makes code equal database, and git keeps the history.
- **Render defaults**: the renderer falls back to the design's code defaults for anything the version does not set. Without the overlay, a fresh environment renders the old defaults.

The script refuses if the latest version is not authored, if the overlay does not reproduce it exactly, or if the code moved since the editor's base (use `--allow-code-moved` only if you checked the change).

## 3. Path B: a new design

1. Pick the **closest existing design**. Do not start from nothing.
2. In the Factory tab, click **Save as new design**. Give it a name and a slug. It starts as a hidden catalog draft.
3. Click **Edit design in builder** on the new design and edit as in Path A.
4. **Publicar y actualizar demos** publishes **v1**.
5. It stays hidden until you release it with **Open to talents** and add it to the gallery.
6. Pin a mockup if you have one (section 4) and prove it (section 5).

## 4. Mockups

A mockup is a static HTML page plus the shared review kit, `kit.js`.

- Every unit carries `data-w="<kit type> · <variant>"`, for example `hero · magazine-cover`. This attribute is the contract. The parity tool and the compiler map it to kit blocks.
- Pin it under `web/design-references/<slug>/`:
  - `index.html`, `kit.js`, `img/`
  - `README.md`: source artifact, version, capture date, reference demo, palettes, fonts, and a units table (selector, `data-w`, builder status)
  - `parity-map.json`: which mockup unit maps to which product section
  - `content.json`: the reference demo's content, word for word from the mockup
- Add a row to `web/design-references/README.md`.
- Serve it with `python3 -m http.server 3098 --bind 127.0.0.1 --directory web/design-references` (launch config `factory-mockup`).
- Fictional mockup data (addresses, handles, numbers) never ships as product data.

**The light compiler idea.** `npm run design:compile -- <mockup.html>` (planned) reads the `data-w` labels, matches them to kit blocks plus the token preset (palettes, fonts, corners), and lists every unit with no match as a new-capability ticket. The gate report is `~/.claude/plans/design-compiler-gate.md`. Today about 80 percent of units match exactly or nearly.

**Known missing widget families** (from the gate, by number of themes that need them):
1. Category explorer, credits image list, rotating word: 11 themes
2. Other (pet profile preview, media or audio player): 7
3. Interactive picker, route, estimator, swatches: 6
4. Featured offer, product, vehicle or trip card: 4
5. Timetable, progress, dashboard hero: 3
6. Hero with illustrated map or SVG drawing: 2
7. Checklist, what to bring, document list, side rail: 2
8. Journal, lesson notes, worked example sequence: 2
9. Hero with video or reel player: 2

Build each as a **kit capability**, never inside one design. Use the **4-layer rule**, one slice per capability:
1. **Schema**: the block type and its props.
2. **Renderer**: the block renders from the schema.
3. **Inspector**: the editor controls, plus **preflight** (allowed kinds, known placeholders, unique keys, ES for every literal).
4. **Add-gallery**: the block shows in the "add section" gallery.

**Never duplicate an existing component.** If a block nearly exists, add a variant to it. Kit and platform changes move every design, so run the sweep (section 5).

## 5. Proof

Run from `web/`. Never start the product server yourself and never build it; use the one you were given.

1. **Rebuild demos**: `npm run demos:rebuild` is a dry run. Add `--write` to apply (`--design <slug>`, `--only TAL-xxxxx`). Or use the Rebuild demos panel. Every run keeps a backup and can be restored (`--restore <runId>`). A second run must report all unchanged.
2. **Parity**: `npm run qa:mockup-parity -- --design <slug> --talents <ref demo> --widths 390,360,1440`. Pixel diff is enforced on the reference demo only. Other demos get structure checks.
3. **Fix loop**: `npm run qa:parity-loop -- --design <slug> --demo <ref demo> --section <key> --width 390`. Fix at the lowest layer: token, then payload, then kit, then platform. A missing widget is a ticket, not an improvisation. Full protocol: `docs/factory/fix-loop.md`.
4. **Baselines**: a delta you cannot fix now goes in `web/design-references/<slug>/parity-baseline.json` with a ticket. Never edit the mockup or the thresholds to go green. Delete stale entries.
5. **Attach the report**: path to `report.html`, delta counts by layer before and after, and the SHA.
6. **The owner reviews.** No design opens to talents without that.

## 6. Safety rules

- Demos update automatically. Real talents are never written by the factory. A talent changes only by their own click, and their own edits are kept.
- Only demo profiles are written (guard: demo flag, demo account, and in the registry). Never write a real talent.
- Test on localhost only (`localhost:<port>`), with demos. No live-tenant writes.
- Every string in EN and ES. No em dashes in copy.
- No hex colours in components. Use tokens.
- Files stay at or under 800 lines. Split before you cross it.
- Do not paste secrets in chat or commits.

## 7. Checklist

- [ ] Worked in the Talent Template Factory, not the Studio builder
- [ ] Started from the closest existing design (Path B) or the right slug (Path A)
- [ ] Edited in the design editor; tokens only, no hex
- [ ] New widgets built as kit capabilities with all 4 layers, none duplicated
- [ ] EN and ES for every string
- [ ] Published with Publicar y actualizar demos; release notes read in both languages
- [ ] Demos rebuilt; second run all unchanged
- [ ] Mockup pinned (README, parity-map.json, content.json) with `data-w` labels
- [ ] qa:mockup-parity green on the reference demo at 390, 360 and 1440, or deltas baselined with tickets
- [ ] Report path, layer counts and SHA attached
- [ ] Owner reviewed; then Open to talents
- [ ] `pull-authored` run; overlay and index committed
- [ ] Files at or under 800 lines
