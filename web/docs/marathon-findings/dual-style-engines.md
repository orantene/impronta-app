# Builder marathon — Dual style engines (Clean + Easy)

Area key: `dual-style-engines`
Worktree audited: `/Users/oranpersonal/Desktop/impronta-builder-marathon` (clean `origin/main`, incl. shipped W3 client canvas, Form node, Classes tab, Layers rename).
Author: builder-marathon audit subagent. All claims cite file + line in this worktree.

---

## TL;DR

There are **two independent style systems** in the builder, with overlapping-but-incompatible vocabularies, separate projection strategies, separate editing code paths, and a lossy boundary between them:

- **Engine A — Freeform `BuilderNodeStyle`** (`builder-node/types.ts:41-396`). A ~180-field flat property bag (enum tokens + raw-CSS "escapes") with `responsive`, `containerQueries`, `hover`, `stateStyles`, a `token:<key>` binding sentinel, and a `classRef` linked-class system. Projected to the DOM as **~250+ `data-builder-style-*` attributes per node** (a giant static stylesheet matches them) **plus** an inline `style` object.
- **Engine B — Curated `SectionPresentation` + `nodePresentation`** (`sections/shared/presentation.ts`, `sections/shared/node-presentation.ts`). Section-level enums + `*Custom` pixel escapes + `customCss`, projected as **`data-section-*` attributes** (consumed by `token-presets.css`) plus inline styles; and a per-role (`headline`/`copy`/CTA) presentation object with **its own parallel raw-CSS escape set**.

The two meet in exactly three places, and each is a defect surface:
1. **`section_embed` wrapper** (`builder-node/section-embed-renderer.tsx:~230`) — the freeform wrapper div gets Engine A `style`; the section's internals get Engine B `presentation`. Both engines live on one component, on different layers.
2. **The inspector** — `style-panel.tsx` is **9,630 lines** and must drive both engines, branching on whether the selected node is a curated role (`legacy:…` id) → patches Engine B under a `__presentation` envelope, or a freeform node → patches Engine A `style`. The split is re-routed in `inspector-dock.tsx:693-712`.
3. **Section eject** (`builder-node/section-eject.ts`) — crossing B→A **drops** all `nodePresentation` tuning (no translation exists).

Net effect on the scores the area gates:
- **Clean**: two vocabularies for the same concepts (margin/padding/align/font/color), two projection pipelines, a 9.6k-line dual-mode inspector, and `nodePresentation`'s escapes duplicating `BuilderNodeStyleValue`'s escapes field-for-field with *different names and units*.
- **Easy**: the operator sees "one Style panel" but it silently behaves differently depending on what's selected; some controls write px-int (Engine B) and some write CSS-strings (Engine A); ejecting a section silently loses styling.

There is also a **latent trust bug inside Engine A**: linked style **classes never render on any surface** (editor canvas or published page) — the registry is `localStorage`-only and is never threaded to `renderBuilderNodes`. "Create class from this block" can therefore **blank a block's style**.

---

## Engine A — Freeform `BuilderNodeStyle`

### Shape
- `BuilderNodeStyleValue` (`types.ts:41-363`): ~180 optional props. Two layers stacked by convention:
  - **Token/enum presets**: `align`, `size`, `tone`, `maxWidth` (`narrow|reading|wide|full`), `marginTop`/`marginBottom`/`paddingX`/`paddingY` (`none|s|m|l`), `background`, `radius`, `aspectRatio` enum, etc.
  - **Raw-CSS escapes layered on top** (a "free value always wins" contract): `fontFamily`, `fontSize`, `letterSpacing`, `textColor`, `backgroundColor`, per-side `paddingTop/Right/Bottom/Left`, collision-safe `marginTopFree…`, `maxWidthFree`, `boxShadow`, `backgroundImage`, `backgroundLayers`, transforms, transitions, filters, grid/flex child + container props, `clipPath`, `animationPreset`, `parallax`, `revealOnView`, etc.
- `BuilderNodeStyle extends BuilderNodeStyleValue` (`types.ts:381-396`) adds `responsive.{tablet,mobile}`, `containerQueries.{tablet,mobile}`, `hover`, `stateStyles.{focus,active}`, and `classRef`.
- **Token binding** (`style-token-bindings.ts`): a string sentinel `token:<key>` on color/font fields → resolved at render to `var(--token-…, fallback)` (`resolveStyleTokenRef`, `:171`). Catalog derived from `COLOR_VAR_NAMES` (`tokens/resolve.ts:89`).
- **Linked classes** (`style-classes.ts`): `style.classRef` → page-scoped registry → `resolveNodeStyleWithClass` merges class style as BASE, node props win (`:164-177`).

### Projection (two outputs)
- `builderNodeStyleAttrs(style)` (`render.tsx:855`) emits the **data-attr matrix** — base + tablet + mobile + container-query blocks. The tablet block alone is ~60 attrs (`render.tsx:890-944`); with mobile + base + CQ it is ~250+ attrs per node. A static stylesheet consumes them (so responsive/state CSS can exist without runtime JS).
- `sharedNodeStyle(style)` (`render.tsx:1610`) emits the **inline `style` object** — tokens first, then every raw escape layered after (the "free wins" cascade), with `styleToken()` resolving `token:` sentinels (`:1638,1661,1662,1666`).
- Per-node entry resolves `classRef` once via `applyStyleClass` (`render.tsx:2384-2403`) so all ~80 downstream `node.props.style` reads see the merged style.

### Editing
- `style-panel.tsx` (freeform branch) + `linked-style-classes-bar.tsx`, `style-presets-bar.tsx`, `css-value-builders.tsx`, `motion-panel.tsx`, `responsive-panel.tsx`, `layout-panel.tsx`.

---

## Engine B — Curated `SectionPresentation` + `nodePresentation`

### `SectionPresentation` (`sections/shared/presentation.ts:148-329`)
- Section-scoped. Enum-first: `background`, `paddingTop/Bottom` (`none|tight|standard|airy|editorial`), `containerWidth` (`narrow|standard|wide|editorial|full-bleed`), `align`, `dividerTop`, `mobileStack`, `visibility`, `designPreset`, `cardStyle`, `borderStyle`, `radiusScale`, `elevation`, animation/scroll/parallax.
- **Its own pixel escapes** as `{ value, unit }` `CustomLength`: `paddingTopCustom`, `paddingLeftCustom`, `marginTopCustom`, `containerWidthCustom`, `backgroundColorCustom`, `overlapTop/Bottom`, `stickyTop`, `gridArea`, `zIndex` (`:186-285`).
- **`customCss`** — a raw per-section CSS string scoped to `[data-section-id="…"]` (`:197`, emitted by `presentationScopedCss` `:558`). This is a **third** way to write styles, distinct from both engines' structured props.
- Projection: `presentationDataAttrs(p)` → `data-section-*` attrs (`:344-432`, consumed by `token-presets.css`); `presentationInlineStyles(p)` → inline styles for the px companions (`:445-515`). Custom companion *suppresses* the matching enum's data-attr so the inline value wins (`:353-360`).

### `nodePresentation` (`sections/shared/node-presentation.ts:4-58`)
- Per-role styling for a curated section's text/CTA sub-elements (`headline`, `subheadline`, `copy`, `primaryCta`, …). Fields: `align`, `maxWidthPx`, `marginTopPx`/`marginBottomPx`/`marginInlinePx`/`marginLeftPx`/`marginRightPx`, `paddingTopPx`…, `size` enum, `tone` enum, plus **raw escapes**: `fontFamily`, `fontSizePx`, `fontWeight`, `letterSpacingPx`, `lineHeightPct`, `textTransform`, `textWrap`, `whiteSpace`, `lineClamp`, `textColor`, `backgroundColor`, `borderColor`/`borderWidthPx`/`borderStyle`. Has its own `breakpoints.{tablet,mobile}`.
- Projection: `nodePresentationInlineStyle(value, sizeMapper)` (`:130-200`) → inline style; `buildNodePresentationResponsiveCss` (`:108`) → scoped `@media` rules with `!important`.

### Editing
- The same `style-panel.tsx` (curated branch), routed by role detection: `resolveBuilderNodeRole` + `EDITABLE_ROLES_BY_SECTION` (`style-panel.tsx:900-902`), patches wrapped as `__presentation` (`:2031`, `:9248`…).

---

## Where they diverge / conflict (the actual bugs)

### 1. Vocabulary + unit fork for identical concepts
Same visual intent, three different encodings:

| Concept | Engine A (`BuilderNodeStyleValue`) | Engine B `nodePresentation` | Engine B `SectionPresentation` |
|---|---|---|---|
| top margin | `marginTop:'none\|s\|m\|l'` **and** `marginTopFree:'12px'` (string) | `marginTopPx: 12` (int) | `paddingTop:'editorial'` enum **and** `marginTopCustom:{value,unit}` |
| font size | `fontSize:'18px'` (string) | `fontSizePx: 18` (int) | — (section has no font size) |
| max width | `maxWidth:'reading'` enum + `maxWidthFree:'740px'` | `maxWidthPx: 740` (int) | `containerWidth` enum + `containerWidthCustom:{value,unit}` |
| color | `textColor:'#fff'` or `token:color.primary` | `textColor:'#fff'` (no token sentinel support) | `backgroundColorCustom:'#fff'` |
| breakpoint key | `responsive.tablet` / `.mobile` + `containerQueries` | `breakpoints.tablet` / `.mobile` | `breakpoints.tablet` / `.mobile` |

Consequences: the inspector has to keep **two number widgets** (px-int vs `LengthValue`/CSS-string — see `style-panel.tsx:540` "Curated NodePresentation stores plain numbers… while the NumberUnit…"), two clone/merge helpers (`cloneNodePresentation` `:1041` vs the `BuilderNodeStyle` mergers), two viewport models, and two "is this empty" checks. This is the bulk of why `style-panel.tsx` is 9.6k lines.

### 2. `nodePresentation` raw escapes are a verbatim duplicate of `BuilderNodeStyleValue` escapes
`fontFamily/fontWeight/letterSpacing/lineHeight/textTransform/textWrap/whiteSpace/lineClamp/textColor/backgroundColor/borderColor/borderWidth/borderStyle` exist in BOTH (`node-presentation.ts:24-43` vs `types.ts:77-95`) — same idea, **different field names/units** (`fontSizePx` vs `fontSize`, `letterSpacingPx` vs `letterSpacing`, `lineHeightPct` vs `lineHeight`). Two parsers, two inline emitters (`nodePresentationInlineStyle` vs `sharedNodeStyle`) that must be kept in visual lockstep by hand. Drift here = a control that looks the same but renders differently depending on whether the node is curated or freeform.

### 3. Section eject is lossy (B → A)
`ejectSectionInTree` (`section-eject.ts:24-48`) re-mints the section's role children with fresh roleless ids via `cloneNodeWithFreshIds`, but those children carry `BuilderNodeStyle` (`style`), **not** the section's `nodePresentation` (which lives on the section `config` and is applied by the curated Component at render). `section-eject.ts` and `snapshot-slot-bridge.ts` contain **zero** references to `nodePresentation` (verified by grep). So all per-role align/size/tone/margin/font tuning is **silently dropped** the moment an operator ejects a section to freeform — a direct "feels broken" event and a Clean/Easy regression.

### 4. Specificity collisions on one element
A `section_embed` can simultaneously carry: Engine A inline `style` (on the wrapper, `section-embed-renderer.tsx:~233`), Engine A `data-builder-style-*` → stylesheet rules, Engine B `data-section-*` → `token-presets.css` rules, Engine B `presentationInlineStyles` inline, Engine B `nodePresentation` inline + `!important` `@media` (`node-presentation.ts:101`), AND Engine B `customCss` scoped rules. Several of these use `!important` (node-presentation `@media`, the data-attr class rules referenced in `presentation.ts:352`). There is **no single documented cascade** describing who wins; correctness today is "whatever specificity happens to land." That is the literal "presentation vs freeform escapes" conflict the audit flagged.

### 5. (Engine A internal) Linked classes never render — and can blank a block
`linked-style-classes-bar.tsx:36-41` documents it: the registry is `localStorage`-only (`:44-74`) and "the EDITOR canvas + the PUBLISHED page are rendered SERVER-side and do not yet receive this client registry." Confirmed: **no caller in `web/src/` passes `styleClasses` to the renderer** (grep returns only `style-classes.ts`, its test, and `render.tsx` itself); `render.tsx:3207` defaults the registry to `{}`. So `resolveNodeStyleWithClass` always sees an empty registry on every real render → linked nodes fall through to their own `style`.

The trap: "Create class from this block" rewrites the block's own style down to just `{ classRef }` (per the bar's documented behavior, `:29-32`), expecting the class to drive it. With an empty registry at render, `resolveNodeStyleWithClass` returns `stripClassRef(style)` = **empty** → **the block renders unstyled** on the canvas and after publish. This is data-loss-shaped, not merely "doesn't cascade." It is the W3 "Classes tab" promise rendered inert. This is the highest-severity item in this area because it is *active*, not cosmetic.

---

## Why this is worth fixing now (scores)
- **Clean** is held down by: 3 style vocabularies, 2 projection pipelines, a 9.6k-line dual-mode inspector, and field-for-field escape duplication.
- **Easy** is held down by: one "Style" surface with two hidden behaviors, px-int vs CSS-string controls, lossy eject, and a Classes feature that silently no-ops/blanks.
- The reframes apply: **profile before you cut** (don't rip Engine B out — curated sections rely on `data-section-*` CSS that ships real design value), **seatbelt before surgery** (parity tests exist: `builder-node-editor-published-parity.test.ts`, `node-presentation-render.test.ts`, `style-classes.test.ts`), **Classes-don't-publish is a TRUST bug** (it's worse than not-publishing — it can blank content), **don't add Capability before Feel** (the fix is convergence + correctness, not new style props).

---

## Recommended UNIFIED style model

**Principle: one *authoring* model and one *resolver*, two *projection adapters* (keep the data-attr CSS that already ships value). Do NOT try to delete Engine B's `data-section-*` CSS or rebuild curated sections.**

### Target model: `BuilderNodeStyle` is the canonical style type
`BuilderNodeStyle` is already the superset (it has tokens, raw escapes, responsive, container queries, hover, state, classRef, token sentinels). Make it the single source of truth for *element-level* styling. Re-express Engine B's two pieces in terms of it:

1. **`nodePresentation` becomes a thin adapter over `BuilderNodeStyle`, not a parallel type.**
   - Define one conversion pair: `nodePresentationToBuilderStyle(np): BuilderNodeStyleValue` and `builderStyleToNodePresentation(style): NodePresentation` (the px-int ↔ CSS-string + key-name mapping: `marginTopPx`↔`marginTopFree`, `fontSizePx`↔`fontSize`, `maxWidthPx`↔`maxWidthFree`, `lineHeightPct`↔`lineHeight`, etc.).
   - The inspector edits **`BuilderNodeStyle` only**. For a curated role, it writes through the adapter back into `config.nodePresentation` (so curated render is unchanged and back-compat holds). This **deletes the entire second branch of `style-panel.tsx`** (the px-int widgets, the second clone/merge/viewport logic) — the single biggest Clean win available.
   - Curated `nodePresentationInlineStyle` stays as the *render-time* emitter for stored `nodePresentation` (back-compat with every saved page); it can be reimplemented as `sharedNodeStyle(nodePresentationToBuilderStyle(np))` so there is **one** inline-style emitter, not two.

2. **`SectionPresentation` stays as the *section-frame* model** (background band, container width, section padding, dividers, scroll/parallax) — it is genuinely a different scope (the section shell, not an element) and its `data-section-*` CSS is shipped design value. But:
   - Document it explicitly as "section frame," not "a style engine," so the conceptual count drops from 2 engines to **1 element-style model + 1 section-frame config**.
   - Fold its element-ish escapes (`backgroundColorCustom`, `overlayColor/Opacity`, `borderStyle`, `radiusScale`, `elevation`, `cardStyle`) so the *inspector controls* for them reuse the same widgets/tokens as Engine A (shared `css-value-builders.tsx` + `kit/color-picker` + token catalog), even though they persist into `presentation`. Same UI, same token list, one mental model.

3. **One documented cascade.** Write the precedence ladder once (section-frame data-attr CSS < section inline companions < element token data-attr CSS < element inline `sharedNodeStyle` < `nodePresentation`/role inline < `customCss`) and pin it with a render-output test. Remove gratuitous `!important` where the documented order already wins.

4. **Fix linked classes (Engine A) as part of this** — because a unified model is the moment to make `classRef` actually work end-to-end:
   - Persist the class registry **into the page snapshot** (alongside the tree) instead of `localStorage`.
   - Thread it through every `renderBuilderNodes` caller (editor canvas, `homepage-cms-sections.tsx`, `PublishedShell.tsx`) into the existing `options.styleClasses` (the renderer side is already built — `applyStyleClass` `render.tsx:2384`).
   - Add an editor↔published parity test for a linked class (extend `builder-node-editor-published-parity.test.ts`). Until persisted, **guard "Create class from this block" from stripping the block's own style** (keep the style inline as a fallback) so it can never blank content.

### Migration path (no broken pages)
All existing pages keep parsing — every field in both engines is optional and additive; nothing is removed from storage.

- **Wave 1 (seatbelt + truth):** add the `nodePresentation ↔ BuilderNodeStyle` adapter + tests; add a render-output cascade test; **fix the linked-class blanking guard** (1-line safety: don't strip inline style on "create class"). Ship. No UI change yet. *(S, low risk.)*
- **Wave 2 (Classes actually render):** persist class registry into the snapshot + thread `styleClasses` into all three render callers + parity test. This closes the trust bug. *(M, low–med risk — additive option already exists on the renderer.)*
- **Wave 3 (collapse the inspector):** route the curated-role branch of `style-panel.tsx` through the adapter so it edits `BuilderNodeStyle` and writes back via `builderStyleToNodePresentation`. Delete the duplicate px-int widgets/merge/viewport code. Keep `SectionPresentation` frame controls. This is the large Clean+Easy win and the only step that touches the 9.6k-line file structurally. *(L, medium risk — gated by the Wave-1 adapter tests + existing parity tests.)*
- **Wave 4 (lossless eject):** in `ejectSectionInTree`, translate each role's stored `nodePresentation` into the corresponding child's `style` via the adapter so eject preserves the look. *(S–M, low risk once the adapter exists.)*
- **Wave 5 (doc + dedupe escapes):** make the section-frame escapes reuse Engine A widgets/token catalog in the inspector; write the "1 element model + 1 section frame" doc; optionally `@deprecated`-annotate the parallel `nodePresentation*Px` fields in favor of the adapter (storage stays for back-compat). *(S, low risk.)*

### Explicit non-goals (honor the reframes)
- Do **not** delete `SectionPresentation` / `data-section-*` / `token-presets.css` — that's shipped design value, and rebuilding curated sections is out of scope and against "don't add Capability before Feel."
- Do **not** add new style properties. This is convergence + correctness only.
- Do **not** start with the inspector refactor (Wave 3) — it's the riskiest; the adapter + class-render fix (Waves 1–2) de-risk it and deliver the trust fix first.

---

## Sequencing note
**Mostly sequential within this area** (Waves 3–5 depend on the Wave-1 adapter; Wave 4 depends on the adapter; Wave 3 is the only one that edits the shared `style-panel.tsx` heavily). **Waves 1 and 2 can run in parallel** with each other and with the edit-context "no whole-editor re-render" work (different files: this area is `builder-node/*` + `sections/shared/*` + `inspectors/style-panel.tsx`; the re-render tax is `edit-context.tsx`). The linked-class **render-wiring** (Wave 2) touches the same three server render callers as the Classes-publish item in other findings — coordinate so one PR threads `styleClasses` rather than two.
