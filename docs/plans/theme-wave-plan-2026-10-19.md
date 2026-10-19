# Theme wave plan (TUL-37 more finished themes, TUL-20 Theme Studio)

Date: 2026-10-19. PLAN ONLY. Written against `origin/main` at `cf3480b076`. No code, no DB read or write, no Notion write, no typecheck/lint/build was run. Every file path below was read on that commit unless marked "not verified".

Words: "talent theme" = a Design in the Talent Template Factory (`docs/factory/how-to-make-a-new-theme.md`). Agency starters are a different category and nothing here touches them.

## 0. Corrections to the brief

- PR #2852 is **CLOSED**, not open. It carried only the Theme Studio design doc, which reached main through integ batch #3185. The doc is `docs/plans/theme-studio-design-2026-10-08.md`.
- The solace/mono/frame DRAFT packs are not in #2852. They landed as TUL-328 in #2862 (`570b0a9f91`), and are on main under `web/design-references/{solace,mono,frame}/`.
- Those draft packs say in their own README: "Authored by the developer from the theme's existing tokens and sections ... Not an Oran artifact." That conflicts with owner rule 3 (port owner designs 1:1, never redraw). See decision O1.

## 1. Current state

### 1.1 Designs in code (`web/src/lib/talent-site/theme-catalog/`)

| Slug | Code | Gallery | Mockup pack | Authored overlay | Open gaps (`COLLECTION_DESIGN_GAPS`, `collection/designs.ts` L492) |
|---|---|---|---|---|---|
| `maison` (v1) | `maison/*` | listed in `GALLERY_DESIGNS` but not in finished list | none (starter seed) | none | n/a |
| `maison-v2` | `collection/maison-v2.ts` | finished | `design-references/maison-v2/` (has `kit.js`, `parity-baseline.json`, `compiled/`) | `collection/authored/maison-v2.overlay.json` | none |
| `folio` | `collection/designs.ts`, `folio-defaults.ts`, `folio-looks.ts` | finished | full pack incl. `demos.json`, `parity-closeout.json` | `authored/folio.overlay.json` | none |
| `gridline` | `collection/gridline.ts`, `gridline-looks.ts` | finished | full pack on disk | none | none |
| `solace` | `buildSolacePayload` in `designs.ts` | hidden | DRAFT (`index.html`, `kit.js`, `img/`, README) | none | "W-10 rotating word", "studio/villa hero toggle (app)" |
| `mono` | `buildMonoPayload` | hidden | DRAFT | none | "no-nav header style", "inline 3-tap slot picker (app)" |
| `frame` | `buildFramePayload` | hidden | DRAFT | none | "W-12 contact sheet tag filter and loupe" |

Gallery policy: `FINISHED_GALLERY_SLUGS = ["maison-v2","folio","gridline"]` (`gallery-meta.ts` L444). `visibleGalleryDesigns()` filters to it unless `TALENT_GALLERY_EXTRA_DESIGNS=1`. `src/lib/quality/theme-review-mockup.static.test.ts` already enforces: finished set keeps a full pack; solace/mono/frame stay out of the finished list and keep a DRAFT README.

Note: the old handover docs say "4 finished"; main's code lists 3 in the finished array plus legacy `maison`. The "4 today" on TUL-37 therefore counts `maison` v1. Not re-verified against the live gallery.

### 1.2 Tooling that exists

- Factory tab and design editor: `web/src/components/builder-lab/talent-factory/*` (`talent-factory-tab.tsx`, `theme-template-editor-mount.tsx`, `publish-design-button.tsx`, `save-as-new-design-dialog.tsx`, `new-design-actions.ts`).
- Release manager: `web/src/app/(workspace)/platform/admin/builder-lab/themes/*` (release page, dry run, demo rebuild panel, stale drafts panel).
- Authoring loop scripts: `npm run design:compile`, `qa:mockup-parity`, `qa:parity-loop`, `demos:rebuild`, `theme:pull-authored` (`web/package.json` L28, 280, 285, 288). Fix-loop protocol in `docs/factory/fix-loop.md`.
- Demo mapping: `web/scripts/demo-talents/unique-theme-map.ts`, `unique-theme-seed*.mts`, `theme-demos.ts`; TUL-38 plan `docs/plans/tul-38-demo-talents-unique-theme.md` (slice 1 demos: Alba maison-v2 TAL-93020, Mateo folio TAL-93011, Alex gridline TAL-93030, Valeria solace TAL-93001, Tomas frame TAL-93009; Mono Pablo TAL-93010 in slice 2).
- Design compiler gate report lives outside the repo at `~/.claude/plans/design-compiler-gate.md` (local, not committed). Its numbers: 271 units across 32 mockups, 154 exact, 63 near, 54 no match (80.1 percent exact or near; 56.8 exact only). Heuristic by its own caveat ("exact is generous").

### 1.3 Theme Studio (TUL-20) state

Design only, merged as docs. The doc's Phase 1 (Studio chrome on Folio) has no implementation on main: grep of `talent-factory/` finds no mockup compare pane. Decisions D1 to D6 in that doc: whether the owner approved them is **unknown**; I found no record. Treat D1 to D6 as open.

### 1.4 Release chain state (from `docs/plans/theme-release-runbook-2026-10-15.md`)

As of that runbook: latest versions folio 23, maison-v2 23, maison 14; frame, gridline, mono, solace at v1 with no release rows. Mono and solace had discarded drafts based on v15 snapshots; releasing them would jump live sites v1 to v15, so that needs its own dry run. These figures are a week old and were "reported, not re-run". Not re-verified today.

## 2. The gap to 32

- The owner workbook is "32 themes x 7 demos = 224 demos" (memory: theme gallery plan of record, Notion page 3f32c5ee974381c7ad8ece5a8d8c05a9; not fetched here).
- Untracked at the repo root: `Tulala-themes-1440-screenshots.zip` with 31 JPGs named `TH02-Folio` through `TH32-Mosaic` (TH01 would be Maison v2, not in the zip). These are the owner's 1440 reference screenshots; names (from the zip listing): Folio, Index, Solace, Tempo, Stage, Lumen, Frame, Common, Orbit, Ledger, Craft, Atlas, Table, Ribbon, Gridline, Muse, Fieldnote, Prism, Mono, Lesson, Signal, Atelier, Clarity, Counsel, Blueprint, Nest, Paw, Route, Spotlight, Studio, Mosaic.
- The compiler gate report says "Mockup folder has 31 incl. Maison v2 and Folio", i.e. the original 31 interactive mockups existed outside the repo (the Claude artifacts). Their current location is **unknown**; the repo has full packs for 3 and DRAFT packs for 3.

Arithmetic, no invented numbers: planned 32, finished 3 collection designs (+ legacy maison v1 = "4"). Built in code but unfinished: 3 (solace, mono, frame). Not built in code: 32 - 3 - 3 = **26** (counting maison-v2, folio, gridline, solace, mono, frame as the 6 in code). Of those 26, whether the original mockups are retrievable is unknown, so the pack work cannot be sized.

Capability families the 26 still need (from the gate report, count of themes): category explorer / credits image list / rotating word 11; other (pet profile preview, media or audio player) 7; interactive picker / route / estimator / swatches 6; featured offer / product / vehicle / trip card 4; timetable / progress / dashboard hero 3; illustrated map or SVG drawing hero 2; checklist / what to bring / document list / side rail 2; journal / lesson notes 2; video or reel hero 2. Families overlap themes, so these counts do not sum to a theme total.

## 3. Ground rules applied

1. Talent themes only, in the Talent Template Factory. No Studio (agency) sections, no agency starters, no shared pickers with them.
2. Editable defaults: every font, size, colour and shape is a token with a default, overridable in the builder. No hex in components. New widgets expose their knobs in the inspector layer.
3. Port owner designs 1:1. A pack only counts as finished when its source is an owner artifact, not a dev redraw.
4. Distinctness matrix (section 6) must pass before a theme is proposed for release.
5. All EN and ES. No em dashes in copy. Files at or under 800 lines. Four-layer rule per capability: schema, renderer, inspector plus preflight, add-gallery (`web/AGENTS.md`).
6. No agent writes to the DB, releases, or assigns demos. Every release step is marked **needs PM/Oran GO**. Starting new-theme build work also sits under the owner's 2026-10-08 ruling ("new theme work needs his permission") and the 2026-10-15 hold on TUL-38 (TUL-408). I do not know whether those holds are lifted today; assume the first step of each package needs a GO to start unless the PM says otherwise.

## 4. Ranked next three packages (one PR per flow)

Ranking logic: unblock the factory first (it multiplies every later theme), then close the smallest capability gap, then the shared capability with the widest reuse.

### Package 1 (rank 1). Theme Studio Phase 1 on Folio (TUL-20)

- **Scope:** side-by-side compare in the existing design editor: pinned mockup iframe next to the canvas, width switch 390/360/1440, a read-only "finished checklist" (pack files present, reference demo, parity state, `COLLECTION_DESIGN_GAPS` for the slug, overlay present, gallery flag) and a parity strip that reads the last report and keeps the CLI copy button. Entry from the Factory design card. No release semantics change. No scroll sync.
- **Files (likely, from the design doc section 11; confirm at build):** `talent-factory-tab.tsx`, `factory-copy.ts`, `factory-model.ts`, `talent-factory.server.ts` (already computes `galleryVisible`), `theme-template-editor-mount.tsx`, `theme-template-editor-copy.ts`; new small `studio-checklist.ts` (pure function, filesystem facts in, rows out); copy EN and ES.
- **Tests:** unit test for the checklist function over fixture dirs (complete pack, DRAFT pack, missing overlay); extend `talent-factory.test.ts` and `talent-factory-tab.render.test.tsx`; i18n parity lane (`npm run gates` includes it). Add to the single canonical `package.json` test lane, take main's line on conflict.
- **Size:** M by the design doc's own label for Phase 1. I have no hour estimate and will not invent one.
- **Depends on:** nothing in code. Hard-depends on owner decisions D1, D2, D4.
- **Risks:** (a) production cannot necessarily serve `web/design-references/**`; the doc flags this as unverified (open question 1). Mitigation: Phase 1 ships local and CI mode only, production shows a link plus last attached report, per option D2-B. (b) Admin UI not click-tested while signed in; needs Live QA on a prod build, never an agent browser run (memory: no agent browser QA). (c) Do not let the checklist copy contradict `FINISHED_GALLERY_SLUGS`.
- **Owner decisions needed:** D1 mode on the design editor vs new tab; D2 production compare A (committed iframe plus CI reports) or B (local only); D4 Folio as dogfood; D3 whether parity gates Publish or only Open to talents (can be deferred, Phase 1 does not wire the gate).
- **No release or DB write:** none. Pure read-only UI. Needs no migration.

### Package 2 (rank 2). Frame finish (TUL-37, first of the three unfinished)

- **Scope:** close the one open gap, "W-12 contact sheet tag filter and loupe", as a shared kit capability (never inside Frame), then complete the Frame Theme Review pack: `parity-map.json`, `content.json`, README out of DRAFT, and the README table row already exists. Frame has the smallest gap list (1) and the gate report shows 5 exact, 2 near, 0 none of 7 units, the best of the three.
- **Files:** schema and renderer under `web/src/lib/site-admin/sections/` (likely extends the portfolio block family; `portfolioBlock` and `portfolio-inspector.tsx` are the nearest existing pieces, to be confirmed in the capability design), inspector in `web/src/components/edit-chrome/inspectors/`, add-gallery entry and its ES strings (`editor-i18n-es-add-gallery-2.ts` pattern), `buildFramePayload` in `collection/designs.ts` (stay under 800 lines: `designs.ts` is 499 now), remove the gap string from `COLLECTION_DESIGN_GAPS`, `web/design-references/frame/{parity-map.json,content.json,README.md}`, update `theme-review-mockup.static.test.ts` only if Frame moves to the finished list (it must not in this PR).
- **Tests:** schema and preflight tests, renderer test, inspector test, add-gallery presence test, `designs.test.ts` gap assertion, mockup-pack static test (pack files present), EN/ES parity. Parity runs (`qa:mockup-parity`, `qa:parity-loop`) are the integrator's job on a prod build, not mine and not an agent's.
- **Size:** M to L, dominated by the four-layer capability. Unknown until the capability design is read in full.
- **Depends on:** Package 1 is nice to have, not required. Hard dependency on owner decision O1 (source of truth for the Frame mockup) and on the TUL-328 pack being replaced or approved.
- **Risks:** (a) rule 3: the current Frame pack is a dev redraw; building to it risks a second redraw. (b) Distinctness vs Folio (both image-led portfolio): differentiate on structure (filter-bar header, 4-column contact sheet) and type (Space Grotesk uppercase vs Instrument Serif), see the matrix. (c) Kit changes move every design: run the sweep across maison-v2, folio, gridline before merge. (d) Releasing Frame jumps its live sites from v1 to the current snapshot; the runbook already says do a staged dry run first.
- **Owner decisions needed:** O1 below; O2 whether Frame reference demo stays Tomas Aguilar TAL-93009; O3 widget behaviour of the loupe (hover, tap, keyboard).
- **No release or DB write:** everything except the release steps. Release, Open to talents, gallery flag flip, demo rebuild, `pull-authored` against a DB: **needs PM/Oran GO**.

### Package 3 (rank 3). Solace finish with the shared rotating-word capability (TUL-37)

- **Scope:** build "W-10 rotating word" as a shared kit capability (the gate report puts the rotating-word family in the largest group, 11 themes, so it is the highest-reuse widget) and the Solace hero studio/villa toggle if it is a block capability, then complete the Solace pack the same way as Frame. The "(app)" suffix in `COLLECTION_DESIGN_GAPS` for the toggle suggests an app-level behaviour rather than a block; whether it is in this PR or a follow-up is open (decision O4).
- **Files:** same four layers as Package 2; hero parts live in `theme-catalog/section-kit-hero-parts.ts` and `section-kit-hero-spec.ts`; `buildSolacePayload` in `designs.ts`; `web/design-references/solace/*`; reduced-motion handling for the rotating word (accessibility).
- **Tests:** as Package 2, plus a reduced-motion test and an ES test for every word list literal.
- **Size:** M to L. Unknown until the motion and word-list model is designed.
- **Depends on:** Package 2's pattern (reuse the capability scaffolding order and the pack finish steps); O1. Soft-depends on Package 1 for the checklist.
- **Risks:** motion and layout shift (CLS) on the hero; rotating-word bound to talent data vs literal text (ES for every literal); Solace v1 to v15 jump on live sites (2 sites v1 per the runbook), so its release needs a dry run first.
- **Owner decisions needed:** O1; O4 toggle in scope; O5 whether words are talent-authored or design-fixed.
- **No release or DB write:** same split as Package 2.

### Not ranked in the top three

- **Mono finish:** two gaps (no-nav header style, inline 3-tap slot picker). The picker family touches 6 themes and may overlap the booking flow, so it needs a booking-side design review first. Follow-on to Packages 2 and 3.
- **Maison v2 and Gridline pack completion (TUL-328 residue):** maison-v2 has `kit.js`, `parity-baseline.json`, an overlay; gridline lacks an overlay (needs a Factory publish then `pull-authored`, a DB read plus a release, so needs GO). Cheap but not new themes.
- **Next tranche of new themes:** blocked on O1 and on retrieving the original mockups. Candidates by gate report, lowest gap first: Table (7 of 7 exact), Ribbon (8 exact, 4 near), Clarity, Mosaic, Prism. Treat as a suggestion from a heuristic report, not a decision.

## 5. What can be built with no release, no DB write

- All code: capabilities (schema, renderer, inspector, add-gallery), design payload edits, Studio chrome, checklist logic, copy EN and ES.
- All repo content: `parity-map.json`, `content.json`, pack README, `data-w` labels, `img/`.
- Unit and static tests, `npm run gates` (via the shared queue, per `CLAUDE.md`; no ad-hoc tsc).
- `design:compile` (pure node, no network) on a mockup file.
- Nothing in this plan needs a migration. If Package 1 later needs a column for a persisted Open-to-talents gate, that is a new decision and migration (timestamp after the newest file; `db:push` before merge).

Needs **PM/Oran GO** (no agent does these):
- lifting the new-theme hold before starting each package;
- Factory "Publicar y actualizar demos", release rows, "Open to talents";
- `demos:rebuild --write`, `theme:pull-authored` against any database, stamp or upgrade scripts;
- adding a slug to `FINISHED_GALLERY_SLUGS` or setting `TALENT_GALLERY_EXTRA_DESIGNS`;
- demo assignment and the TUL-38 `unique-theme-seed --apply`;
- anything touching TAL-93938 or TAL-93900.

## 6. Distinctness matrix (proposal)

A new theme is proposed for release only if it differs from every released theme on at least 4 of the 7 axes below, and on at least one of axes 1 to 3 (structure, not just paint). The threshold is a proposal for the owner, not an existing rule.

| Axis | What is compared | Source of truth |
|---|---|---|
| 1. Hero structure | cover, split, centered statement, masthead, video, map | `section-kit-hero-*.ts`, mockup `data-w` hero unit |
| 2. Navigation chrome | overlay, filter bar, no-nav, sidebar, standard | `navChrome` in `shell()` payload |
| 3. Primary content shape | chapters, contact sheet, compact price list, cards, timeline | home tree section kinds |
| 4. Type system | heading family and case/weight, body family | `design-type-system*.ts`, gallery `fonts` |
| 5. Palette set | default look polarity (light/dark), accent hue family, contrast | `palettes` in `gallery-meta.ts` |
| 6. Shape and density | corner radius, spacing density, image shape | token defaults (`design-token-defaults.ts`) |
| 7. Trade fit | the 2 to 3 trades it is built for, no overlap on default demo | `gallery-meta.ts` demos, TUL-38 map |

Seed rows from what is readable today (heroes, nav, fonts, polarity taken from `designs.ts`, `gallery-meta.ts` and the pack READMEs):

| Design | Hero | Nav | Content shape | Type | Default look | Trade fit |
|---|---|---|---|---|---|---|
| Maison v2 | editorial, warm | standard | editorial sections | not extracted (maison-v2 tokens file) | Rose, light | beauty, nails |
| Folio | masthead / cover | stacked masthead | project-story chapters | Instrument Serif + Archivo | Stone, light | models, fashion |
| Gridline | split, alert pill | standard | service list, price rows | Gridline type system | default, light | trades, electrician |
| Solace | full-bleed cover | overlay | single column editorial services | Cormorant Garamond 300 + Inter | Linen & Clay, light | dance, wellness |
| Mono | centered type-only statement | standard | compact searchable price list | heavy weight 800 display | per `gallery-meta` | trainers, one-action trades |
| Frame | split 40/60 | filter bar | 4-column contact sheet | Space Grotesk 600 caps + Inter | Gallery White, light | photographers, DJs, tattoo |

First check to run before any build (read-only, free): Folio vs Frame, both image-led. They differ on axes 1, 2, 3, 4 and 7, so they pass; Solace vs Maison v2 (both soft, warm, serif display) differ on 1, 2, 3, 7 and need a type check once maison-v2 fonts are read. The matrix should become a test fixture (`theme-distinctness.static.test.ts`) fed by the real payloads, so a clone fails CI. That test is a candidate add-on to Package 1 or a small standalone PR; the threshold needs the owner's yes (O6).

## 7. Owner decisions needed (consolidated)

- **O1 (blocks Packages 2 and 3):** for solace, mono, frame, is the dev-authored DRAFT pack acceptable, or will Oran supply the original artifact exports (1:1 rule)? Recommendation: supply the originals (the 1440 screenshots TH04, TH08, TH20 exist; the interactive artifacts need to be located) and discard the drafts; if unavailable, approve drafts explicitly in writing as the interim reference. What I do on GO: rebuild the pack from the artifact, compile with `design:compile`, list the exact tickets.
- **O2:** reference demos stay as in `design-references/README.md` and TUL-38 (Valeria TAL-93001, Pablo TAL-93010, Tomas TAL-93009)? Recommendation: yes.
- **O3:** Frame loupe interaction model. Recommendation: tap to open, arrow keys to step, Esc to close; hover only as an enhancement.
- **O4:** Solace studio/villa toggle in scope for Package 3 or follow-up. Recommendation: follow-up unless it is a plain block; check its definition first.
- **O5:** rotating word content: design-fixed list vs talent-authored. Recommendation: talent-authored with an ES/EN default per locale, to avoid a literal that ships untranslated.
- **O6:** adopt the distinctness threshold and the CI fixture. Recommendation: yes.
- **D1 to D6 from the Studio doc:** approve or amend. Recommendations are in that doc (mode on the editor, committed iframe plus CI reports, warn on Publish and hard gate on Open to talents, Folio first).
- **Hold status:** confirm the 2026-10-08 new-theme hold and the TUL-38 hold (TUL-408) are lifted for build work (not release work).

## 8. Unknowns (honest list)

- Where the original 31 interactive mockups live today. Without them, Packages beyond 3 are not sizable.
- Whether D1 to D6 were already answered.
- Live gallery and release state today (the runbook numbers are from 2026-10-15).
- Whether production can serve `design-references` statically.
- Hour or point sizes: only relative sizes (M, M to L) are given; the Studio doc's M is its own label.
- Gate report percentages are keyword heuristics, not a verified capability audit.
- Maison v2 font and palette values were not extracted for the matrix.
