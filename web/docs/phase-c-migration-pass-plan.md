# Phase C — Migration-pass plan

**Phase:** Builder Convergence Plan, Phase C — Inline rich-text WYSIWYG.
**Companion to:** `phase-c-editor-base-evaluation.md` (decision: Lexical + 4-package allow-list + custom AccentNode + ESLint enforcement).
**Status:** Plan only. No code, no `package.json` change.

This plan is the answer to the user's eight prompts:
(1) file structure, (2) which files get touched, (3) what's replaced vs. wrapped,
(4) one-coherent-pass migration strategy, (5) `LinkPicker` reuse,
(6) marker round-trip mechanics, (7) rollback path, (8) verification sequence on a real tenant.

---

## 1. Exact file structure / architecture

The editor primitive is a self-contained module. Public render path is unchanged.

```
web/src/components/edit-chrome/inline-editor/        ← NEW MODULE
├── index.ts                          re-exports public API
├── RichEditor.tsx                    the primitive (single-line + multi-line variants)
├── RichEditorContext.tsx             internal, for Toolbar + LinkPopover to read editor instance
├── nodes/
│   └── AccentNode.ts                 custom Lexical node for {accent}…{/accent}
├── transformers/
│   ├── markerToLexical.ts            string → EditorState
│   ├── lexicalToMarker.ts            EditorState → string (round-trip-deterministic)
│   └── transformers.test.ts          snapshot test on real DB rows
├── plugins/
│   ├── ToolbarPlugin.tsx             floating toolbar (Bold / Italic / Accent / Link)
│   ├── LinkPickerPlugin.tsx          bridge to existing shared/LinkPicker
│   ├── KeyboardShortcutsPlugin.tsx   Cmd-B / Cmd-I / Cmd-K only
│   └── ToolbarPlugin.test.tsx        jsdom-level interaction test
├── theme.ts                          Lexical theme tokens (accent uses tenant brand-accent)
└── README.md                         contract: what it is, what it isn't, hard caps

web/src/components/edit-chrome/inline-editor.tsx     ← REPLACED IN-PLACE
   becomes a thin shim:
   - keeps the dblclick-to-edit driver
   - keeps the image hover/replace pill (unchanged)
   - delegates the toolbar UI + selection model to the new module's ToolbarPlugin
   - stops emitting raw {b}/{i}/{accent}/[](…) into a contentEditable div
```

**Net new dependency footprint** (locked by the ESLint rule below):

```
"lexical": "^x"
"@lexical/react": "^x"
"@lexical/link": "^x"
"@lexical/selection": "^x"
```

That's the entire allow-list. Anything outside it is an ESLint error, not a code-review note.

```
web/.eslintrc.json                   ← TOUCHED (one rule added)
   "no-restricted-imports": [
     "error",
     {
       "patterns": [
         {
           "group": ["@lexical/*"],
           "message": "Phase C scope cap: only @lexical/react, @lexical/link, @lexical/selection allowed.",
           "allowImportNames": []
         }
       ],
       "paths": [
         { "name": "@lexical/history", "message": "Banned by Phase C scope cap." },
         { "name": "@lexical/list",    "message": "Banned by Phase C scope cap." },
         { "name": "@lexical/markdown","message": "Banned by Phase C scope cap." },
         { "name": "@lexical/code",    "message": "Banned by Phase C scope cap." },
         { "name": "@lexical/rich-text","message": "Banned by Phase C scope cap." },
         { "name": "@lexical/plain-text","message": "Banned by Phase C scope cap." },
         { "name": "@lexical/overflow","message": "Banned by Phase C scope cap." },
         { "name": "@lexical/headless","message": "Banned by Phase C scope cap." }
       ]
     }
   ]
```

---

## 2. Which existing files get touched

Strict accounting. Anything not in this list is **untouched** in Phase C.

### Replaced in place (kept as a file, body rewritten)

| File | What was | What it becomes |
|---|---|---|
| `web/src/components/edit-chrome/inline-editor.tsx` | 718-line monolith: dblclick→contentEditable + raw-marker toolbar + image-replace pill + banner + toolbar | Slim driver: dblclick→`RichEditor`, image-replace pill (unchanged), banner (unchanged). Toolbar UI moves out. |

### Wrapped (existing primitive, internals untouched, render path expanded)

| File | What changes | What does NOT change |
|---|---|---|
| `web/src/lib/site-admin/sections/shared/ZodSchemaForm.tsx` | `text` and `textarea` branches (lines ~196–268): when `field.hint === "rich_text"`, render `<RichEditor variant="single" \| "multi" />` instead of `<input>` / `<textarea>`. Plain fields (no hint) render the existing `<input>` / `<textarea>` unchanged. | All other field kinds (`url`, `email`, `number`, `image`, `select`, `boolean`, `array_of_*`, `object`). The `i18n_text` branch (delegates to `LocalizedTextInput`). |
| `web/src/lib/site-admin/sections/shared/LocalizedTextInput.tsx` | Per-locale `<input>` / `<textarea>` (lines 154–169): if a new optional `rich` prop is true, render `<RichEditor variant="single" \| "multi" />` per locale. | Tab strip, locale picker, default-tab logic, status pip, `setI18n`/`pickI18n` integration. |
| `web/src/lib/site-admin/sections/shared/LinkPicker.tsx` | Nothing — used by `LinkPickerPlugin` as a popover from the toolbar. | Everything. |
| `web/src/lib/site-admin/sections/cta_banner/Editor.tsx` | The two `<input>` and one `<textarea>` for `headline`, `copy`, `reassurance` become `<RichEditor>`. | All other fields (eyebrow, primaryCta/secondaryCta link blocks, MediaPicker, AltTextField, VariantPicker, PresentationPanel). |
| `web/src/lib/site-admin/sections/hero/Editor.tsx` | Rich-eligible inputs (`headline`, `subheadline`, `eyebrow` if rendered through `renderInlineRich`) become `<RichEditor>`. | Everything else. |
| `web/src/lib/site-admin/sections/featured_talent/Editor.tsx` | `headline` input becomes `<RichEditor>`. | Everything else. |
| `web/src/lib/site-admin/sections/category_grid/Editor.tsx` | `headline` input becomes `<RichEditor>`. | Everything else. |
| `web/src/lib/site-admin/sections/destinations_mosaic/Editor.tsx` | `headline` input becomes `<RichEditor>`. | Everything else. |
| `web/src/lib/site-admin/sections/split_screen/Editor.tsx` | `headline` input + paragraphs become `<RichEditor>`. | Everything else. |

### Schema annotations added (one-line additions, 33 schemas)

The set of fields that should be rich-eligible is determined by **render-time grep**: any field passed through `renderInlineRich(...)` in a `Component.tsx` is rich-eligible.

That's:
- `headline` (every section that uses one) — 28 files
- `subheadline` — 1 file (hero_split)
- `title` (blog_detail) — 1 file
- `item.title` (image_copy_alternating) — 1 file
- `p` (paragraphs arrays in: map_overlay, faq_accordion, blog_detail, split_screen, sticky_scroll, timeline, content_tabs) — 7 files

Each section's `schema.ts` gets `hint: "rich_text"` added to those exact fields. **No other schema changes.** No new fields, no removed fields, no validation changes.

The ZodSchemaForm branch reads this hint to decide rich-vs-plain. Hand-written editors that already know their own field semantics (e.g. `cta_banner/Editor.tsx`) hardcode `<RichEditor>` for the rich-eligible fields and don't read the hint — the hint exists for the auto-bound path.

### NOT touched

- `web/src/lib/site-admin/sections/shared/rich-text.tsx` — the public-render `renderInlineRich` stays exactly as it is. Public visitors see no change.
- All 47 `Component.tsx` files — public render path is preserved 1:1.
- All section `meta.ts` files — no category/inDefault changes (those are Phase D).
- `LinkPicker.tsx` internals — reused as-is.
- Any non-edit-chrome route — public site, dashboard, talent pages, admin: nothing.

---

## 3. What gets replaced vs. wrapped

The distinction matters because it answers "what's our blast radius if Phase C goes sideways."

**Replaced (the new code is the only path):**
- `inline-editor.tsx`'s toolbar UI. There is no fallback to the old toolbar after Phase C ships. Per the plan's deletion-timing rule: "the new toolbar is the only toolbar from the moment the phase ships."

**Wrapped (old code path remains, new code path is gated by a condition):**
- `ZodSchemaForm` — plain `<input>` / `<textarea>` is still rendered for fields without `hint: "rich_text"`. The new path is additive.
- `LocalizedTextInput` — plain inputs still render for non-rich i18n fields. Rich is opt-in via a prop.
- Hand-written editors — the file is still hand-written; only specific lines that were `<input>` / `<textarea>` flip to `<RichEditor>`. The rest of the layout / link blocks / picker integrations are untouched.

This distinction is what makes the rollback story simple (see §7).

---

## 4. One-coherent-pass migration strategy

The plan's "wired everywhere in one phase, not piecemeal" rule means **every rich-eligible text field flips on the same commit.** There is never a moment in production where some inspector fields are rich and others are raw.

The implementation order inside the single PR is:

1. **Foundation** — scaffold the `inline-editor/` module, write the two transformers + their snapshot tests on real DB rows pulled from Impronta (`builder-prod-snapshot`-style fixtures), get the RichEditor primitive rendering a single string in isolation in a Storybook-style harness route under `/__phase-c-harness` (gated by edit mode + `?dev=1`).
2. **Round-trip discipline** — verify against ~50 real DB strings (`SELECT props FROM site_sections` snippets) that `markerToLexical(s) → lexicalToMarker(state)` is byte-identical for unedited content. Lock that as a Vitest snapshot. Any future commit that breaks it is an ESLint-equivalent failure (CI blocks).
3. **Auto-bound surface (most fields, single change)** — flip `ZodSchemaForm`'s `text` and `textarea` branches to use `RichEditor` when `hint === "rich_text"`. Add `hint: "rich_text"` to all 33 schemas in the same commit.
4. **i18n surface** — add `rich` prop to `LocalizedTextInput`. Wire `ZodSchemaForm`'s `i18n_text` branch to forward `field.hint === "rich_text"` as the `rich` prop.
5. **Hand-written editors** — flip the 6 files (cta_banner, hero, featured_talent, category_grid, destinations_mosaic, split_screen). Each is a 2–4 line change inside a much bigger file.
6. **Toolbar move** — gut the toolbar UI from `inline-editor.tsx`; canvas dblclick now mounts a `RichEditor` in "ephemeral on top of the original element" mode using the same path-by-value lookup. The image-replace pill stays untouched.
7. **ESLint rule + dependency lock** — add the `no-restricted-imports` rule, add the four allowed packages to `package.json`. Run `pnpm install`, commit lockfile.
8. **Snapshot tests pass + tsc clean + build clean.**

All of the above is **one PR, one commit, one deploy.** There is no preview-flag, no half-rollout, no "Impronta-only" gating for Phase C — the editor primitive is universally safer than the current raw-marker textareas (markers can't be malformed; the public render path is unchanged), so there's no operational reason to gate it.

The implementation order above is for clarity inside the PR — not for incremental ship.

---

## 5. How `LinkPicker` is reused

`LinkPicker` is a 7-mode link target picker (page / URL / email / phone / anchor / file / talent). It already integrates with the tenant's pages, talent roster, and asset store. Phase C reuses it intact.

Integration:

- The Lexical floating toolbar's **Link** button opens a popover anchored to the toolbar (not a modal dialog).
- The popover content is `<LinkPicker mode="modal-content" onPick={url => editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)} />`.
- If the operator clicks Link with selection inside an existing link, the popover opens with the existing URL prefilled — same UX as the current `inline-editor.tsx` "edit existing link" behavior.
- An empty submit unwraps the link (matches current behavior).
- Cmd-K is the keyboard equivalent.

`LinkPicker` itself is not modified. If its internals need any changes, that's a separate concern not in Phase C scope.

`LinkPickerPlugin.tsx` is a small bridge: it owns the popover position state, listens for the toolbar's "open link picker" event, and dispatches the result through `@lexical/link`'s `TOGGLE_LINK_COMMAND`.

---

## 6. Marker round-trip mechanics

Storage stays plain strings with the four markers. The editor is a view layer.

### markerToLexical (string → EditorState)

Single-pass tokenizer (reused from `shared/rich-text.tsx`'s regex), producing a paragraph node with text + format flags + LinkNodes:

```
"Welcome to {accent}Impronta{/accent} — book your {b}team{/b}."
            ↓
ParagraphNode
  ├ TextNode("Welcome to ")
  ├ AccentNode("Impronta")          ← custom node, format flag set
  ├ TextNode(" — book your ")
  ├ TextNode("team", format=BOLD)   ← stock format flag
  └ TextNode(".")
```

For `[text](url)`:
```
"Click [here](https://example.com) for details."
            ↓
ParagraphNode
  ├ TextNode("Click ")
  ├ LinkNode(url="https://example.com")
  │    └ TextNode("here")
  └ TextNode(" for details.")
```

### lexicalToMarker (EditorState → string)

Walk children of the (single) paragraph, emit the inverse:

| Lexical node | Output |
|---|---|
| TextNode (no format) | `text` |
| TextNode (BOLD format) | `{b}text{/b}` |
| TextNode (ITALIC format) | `{i}text{/i}` |
| TextNode (BOLD + ITALIC) | `{b}{i}text{/i}{/b}` (never produced by toolbar; tolerated on parse only) |
| AccentNode | `{accent}text{/accent}` |
| LinkNode (children: TextNode "x", url "u") | `[x](u)` |
| Anything else | error in dev / fallback to plain text in prod |

### Round-trip determinism rules

1. **No-edit round-trip is byte-identical.** A string parsed and re-serialized without edits must equal the original. Locked by snapshot test against ~50 real DB rows.
2. **Whitespace preservation.** Trailing/leading whitespace inside markers is preserved verbatim. The current renderer treats `{b} foo {/b}` and `{b}foo{/b}` as identical visually but stores them differently — we preserve whatever the operator typed.
3. **No nesting normalization.** The current marker grammar is non-nesting. The editor enforces this at insert time (toolbar refuses to apply Bold to a selection already inside Bold). Existing nested rows in the DB (if any) parse to outermost wins, re-serialize to outermost only — locked by snapshot test, flagged in CI as a candidate for human review.
4. **Empty markers collapse.** `{b}{/b}` in input parses to nothing, serializes to nothing. Prevents accumulation of ghost markers across edits.

### What the editor never does

- Rewrite an unedited string. (If `markerToLexical(s) === s`, save is skipped — even if state was reified, no DB write fires.)
- Introduce HTML. The model is markers; the storage is markers; the public render is markers via `renderInlineRich`. There is no HTML on the storage path.
- Migrate data. Existing rows are read as-is. New writes produce the same shape.

---

## 7. Rollback path if the first integration pass feels wrong

Rollback is **a single git revert** because:

- The new module (`inline-editor/`) is self-contained. Revert deletes it.
- ESLint rule is one line. Revert removes it.
- `package.json` has four added entries. Revert removes them.
- `ZodSchemaForm`'s `text`/`textarea` branches lose the conditional and revert to plain `<input>` / `<textarea>` — identical to today's behavior.
- `LocalizedTextInput` loses the `rich` prop. Identical to today.
- The 6 hand-written editors lose the `<RichEditor>` lines and gain back their original `<input>` / `<textarea>` — identical to today.
- The 33 schemas lose `hint: "rich_text"`. The hint is purely decorative on the auto-bound path; without it, fields render as plain textareas. **No data is written that depends on the hint.** Existing markers in DB still render correctly through `renderInlineRich` on the public site.
- `inline-editor.tsx` reverts to its pre-Phase-C 718-line form (raw-marker toolbar + dblclick + image pill).

**Rollback safety properties:**

- Storage is unchanged (markers are markers — Phase C never wrote a non-marker shape).
- Public render path is unchanged (Phase C never touched `Component.tsx` or `renderInlineRich`).
- Inspector renders the original raw-marker textareas (functionally identical to pre-Phase-C).
- Operators who edited content during Phase C wrote markers that are still valid. Rollback does not corrupt anything they did.

**Rollback trigger criteria** (decided up-front so we don't argue under pressure):

1. Caret feel is not §17-grade after one focused fix-up day. (Subjective but binary — if it doesn't feel native, ship a rollback rather than ship a half-feeling editor.)
2. Round-trip determinism breaks on a real DB row in production after deploy. (Snapshot tests pass in CI, but CI fixtures are a sample — production may surface a row we didn't sample.)
3. Performance regression: 200-word paragraph drops below 60fps on a non-toy machine.
4. Accessibility regression vs. plain `<textarea>`: VoiceOver no longer announces field changes, or keyboard trap appears.

If any of those fire, we revert the PR — same day, same commit, no debate. Phase C re-enters with the lessons. This is the same discipline as Phase B: bad outcomes are caught early and rolled back rather than rationalized.

---

## 8. Verification sequence on a real tenant

Same lived-experience discipline as Phase B. All of these run on `https://impronta.tulala.digital/?edit=1` against the freshly-deployed Phase C build (preview → promote, like Phase B).

### Pre-deploy gates (CI must pass)

- `tsc --noEmit` clean.
- ESLint clean (proves the no-restricted-imports rule fires on disallowed `@lexical/*` packages).
- Vitest snapshot test on `markerToLexical → lexicalToMarker` round-trip across the ~50 real-row fixture suite — byte-identical for unedited content.
- Build size check: edit-mode chunk grows by no more than ~60 KB min+gz (10 KB headroom over the predicted 50). Public-mode chunks unchanged.

### Real-tenant gates (must pass on impronta.tulala.digital)

1. **Existing site renders identically before and after deploy.** Diff a `view-source:` of the homepage public render before and after the deploy. Should be byte-identical.
2. **Open `?edit=1`, inspect a section with `{accent}` markers in DB.** The inspector field shows accent-styled text (italic serif blush). **Zero visible markers.**
3. **Round-trip — type, save, reload.** Hit the section with `{accent}` markers, type a new word in front of the accent text, save (autosave), reload the page. Inspect `props` via the inspector → should still contain `{accent}…{/accent}` markers in the right positions.
4. **No-edit save is a no-op.** Open a section, click into a rich field, click out without changing anything, watch the network tab — no `setSectionDraft` request fires. (Lexical re-paints state, but our serialize path detects unchanged content.)
5. **Cmd-B** wraps selection in `{b}` markers (visible on save round-trip), shows live bold in the editor.
6. **Cmd-I** same for italic.
7. **Cmd-K** opens the LinkPicker popover anchored to the toolbar. Pick a page → selection becomes a styled link, saved as `[text](url)`.
8. **Toolbar buttons reflect active selection.** Position caret inside a bold span — Bold button shows filled. Move out — Bold button shows unfilled.
9. **Toolbar motion matches §17.** Compare side-by-side with the prototype mockup — fade + small upward translate, ~120ms ease-out.
10. **Accent uses tenant brand-accent token.** Change the tenant's brand-accent in the theme drawer; re-open the section editor; accent spans now render in the new color (no hardcoded color leaked in).
11. **Performance.** DevTools Performance recording on a 200-word `paragraphs[]` array (e.g. blog_detail page) — typing stays at 60fps. React Profiler confirms no React tree reconcile per keystroke.
12. **Accessibility — VoiceOver EN.** Tab into a rich field, type, apply Bold. SR announces the formatting change.
13. **Accessibility — VoiceOver ES.** Same as above with the editor running on an `es` locale.
14. **Toolbar keyboard navigation.** With focus inside a rich field: Tab moves to the toolbar's first action; Shift-Tab returns. Enter activates.
15. **Mockup compare §17.** Final subjective check: paragraph with bold + accent + link in the live editor, screenshot beside §17 mockup. Selection toolbar position, button rhythm, caret feel must match.
16. **Hand-written editor parity.** Open `cta_banner` in the inspector. The headline + copy + reassurance fields all render the rich primitive. Same applies to hero, featured_talent, category_grid, destinations_mosaic, split_screen.
17. **Save + publish + repaint.** Edit a rich field, save, publish, view public site → public render shows correct styling via `renderInlineRich` (which is unchanged).
18. **i18n.** Open a section with an `i18nString` rich-eligible field (e.g. a localized headline). Switch to ES locale tab — the rich primitive is mounted per locale. Edit, switch tabs, switch back — values preserved. Save, reload — both locale strings persist.

Phase C is not signed off until **all 18 gates pass.** No "it basically works." Same discipline as Phase B.

---

## What this plan does NOT decide

- **It does not start coding.** Awaiting your green light.
- **It does not propose a phase split.** Phase C is one PR, one deploy. No "Phase C.1 / C.2 / C.3" — that would violate the one-coherent-pass rule.
- **It does not assume a specific Lexical version.** That's a small `pnpm add` decision in the implementation commit; we'll pin to the latest stable.

---

## Open questions before implementation

1. **Storybook-style harness route.** The transformer suite is best validated visually as well as via snapshot tests — I want a `/__phase-c-harness?row=…` page that renders the editor against a list of real DB strings side-by-side with the public render. Approve adding this dev-only route (gated by `?edit=1` + `?dev=1`)?
2. **Snapshot fixture source.** The 50-row fixture for round-trip tests — pull from production via the supabase service role at fixture-build time, or hand-craft a representative set checked into the repo? I lean checked-in (no live DB dependency in CI). Confirm?
3. **Plain-string fields and accidental marker injection.** If an operator pastes `{accent}foo{/accent}` into a non-rich field (e.g. a button label), the public site renders the markers verbatim because the field doesn't pipe through `renderInlineRich`. That's existing behavior, not a Phase C regression. Are you OK leaving that as-is, or do you want a Phase-C escape-hatch that strip-tags marker syntax on save for non-rich fields? I lean leave-as-is (out of Phase C scope), revisit if it becomes a real operator complaint.

If aligned on §1–§8 and these three questions, the next step is implementation. I will not start coding until you give the word.
