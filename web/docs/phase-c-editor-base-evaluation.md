# Phase C — Editor-base evaluation (one-day, written justification)

**Phase:** Builder Convergence Plan, Phase C — Inline rich-text WYSIWYG.
**Required by:** Phase C Quality Bar rule #2 — *"No new dependencies without a 24-hour evaluation. If we adopt Lexical or a Slate config, that's a deliberate choice with a written justification (size, maintenance, a11y, marker round-trip support). Default position is to evaluate two options for a day before committing."*
**Status:** Evaluation only. No package installed, no code committed yet.

---

## What we are actually shipping (so we don't drift)

§17 of the prototype is a floating selection toolbar with **four** actions — Bold / Italic / Accent / Link — over copy that renders **live styling**, not visible markers. Storage stays as the existing four-marker format (`{accent}…{/accent}`, `{b}…{/b}`, `{i}…{/i}`, `[text](url)`). No nesting. No headings inside body text. No lists. No tables. No mentions. No slash commands. No font/color/alignment in the toolbar. No storage migration.

Concretely the editor primitive must:

1. **Parse** an existing string with markers → editor model with live spans.
2. **Render** that model with caret-clean, native-feeling editing.
3. **Apply** the four toolbar actions plus Cmd-B / Cmd-I / Cmd-K.
4. **Serialize** back to the exact same marker format. Round-trip on a string with no edits must be byte-identical (otherwise we churn DB rows on every save).
5. **Drop into** `ZodSchemaForm` text/textarea renderers + `LocalizedTextInput` (i18n) + a small handful of hand-written editors. One pass; no half-rollout.

That's the whole spec. Anything else is out of scope for Phase C.

---

## Surface area we must cover

- 47 section types under `web/src/lib/site-admin/sections/`.
- ~305 `z.string()` fields total. Most flow through `ZodSchemaForm` (`text`, `textarea`, `i18n_text`).
- `LocalizedTextInput` (i18n_text) — must accept the same primitive per locale.
- A small set of hand-written `Editor.tsx` files that already use `LinkPicker` (cta_banner, split_screen, category_grid, etc.) — primitive must coexist with the existing `LinkPicker` popover.
- `inline-editor.tsx`'s floating toolbar is replaced **in-place**, same actions, same wrapping behavior — but the surface it acts on is now styled live, not raw text.

Not every text field is rich-text-eligible: short fields like URLs, button labels, sort keys, etc. The `rich_text` hint on textarea fields is the only positive marker today. Phase C resolution: **only fields that historically supported markers (`hint === "rich_text"` plus the headline/intro fields wired in `inline-editor.tsx`) get the rich primitive; everything else stays a plain `<input>`.** The toolbar simply does not appear on plain fields.

---

## The two candidates

The plan named two: **Lexical** and **a thin Slate config**. I added a third for completeness — **a hand-rolled minimal contentEditable layer over our existing marker tokenizer** — because if the answer turns out to be "you don't actually need a framework," skipping the dependency entirely is the cheapest long-term outcome.

### Option A — Lexical (Meta)

`lexical` (~22 KB min+gz core) + `@lexical/react` (~10 KB) + a few plugin packages (history, list-deactivated-but-bundled, link, selection). Realistic full-bundle add for our four-action subset: **40–55 KB min+gz**.

- **Maintenance.** Active: weekly releases, Meta-funded, used in production (Facebook comments, Workplace). API has stabilized after the early churn. Migration story is "nodes are versioned, plugins are stable."
- **a11y.** Built-in. Selection model handles bidi, IME, screen readers correctly. `aria-live` for formatting changes is opt-in via plugin but well-supported.
- **Marker round-trip.** Lexical has no built-in concept of our markers, but it has a clean `$convertFromMarkdownString` / `$convertToMarkdownString` pattern using `Transformer` objects. We'd write **four** transformers (one per marker), about 30 lines each. Custom node types: AccentNode (extends TextNode), bold/italic via stock format flags, LinkNode is built in.
- **Round-trip determinism.** Strong. Lexical's serialization is structural, not whitespace-sensitive — strings without rich content pass through as a single TextNode and re-serialize identically. The risk surface is whitespace at marker boundaries; mitigable with one normalization rule in our toExport function.
- **Performance.** Pre-engineered for "no React reconcile per keypress" — uses its own EditorState diffing, only commits to React on selection/state-flush. The 60fps bar in the plan is its native operating point.
- **Caret feel / native edit.** This is its design center.
- **Risks.**
  - Bundle weight: ~50 KB min+gz on top of an already-not-tiny edit-mode bundle. Real cost, but bounded — the edit chrome only loads in `?edit=1`.
  - Plugin sprawl temptation: it ships a markdown plugin, a code-block plugin, a list plugin, etc. Discipline rule: **only `@lexical/react`, `@lexical/link`, `@lexical/selection` get installed.** No history plugin (we have draft autosave + revisions), no list/code/markdown plugins.
  - Custom AccentNode — small but real cognitive cost; first time anyone in the codebase will see Lexical's node API.

### Option B — Slate (thin config)

`slate` (~30 KB min+gz) + `slate-react` (~25 KB) + `slate-history` (optional, ~6 KB). Full-bundle add for our subset: **~55 KB min+gz**.

- **Maintenance.** Active but slower release cadence. Sponsored by a couple of editor-product companies (e.g. Plate.js). Major-version churn historically more painful than Lexical's; v0.x semver still.
- **a11y.** Reasonable but more DIY than Lexical. IME support exists but has had recurring regressions across versions; this is a known footgun.
- **Marker round-trip.** Excellent in principle: Slate's data model is your data model. We'd map directly: `{ type: 'paragraph', children: [{ text: 'hello ', }, { text: 'accent', accent: true }, …] }` ↔ marker string. Custom serializer is ~80 lines; round-trip determinism is purely a function of how we write it.
- **Performance.** Adequate. Slate triggers more React reconciliation per keystroke than Lexical (it's React-driven by design). 60fps on 200-word paragraphs is achievable but requires care (memoizing `renderLeaf`, `renderElement`).
- **Caret feel / native edit.** Good when you stay on the happy path; can get janky on complex selections (cross-node selection, IME with Korean/Japanese).
- **Risks.**
  - More React reconcile churn — directly conflicts with the 60fps bar in the plan, requires explicit memoization discipline.
  - IME regression history — for a multi-tenant product that ships in EN+ES today and will ship in JA/KO/ZH eventually, this is a long-tail liability.
  - Pre-1.0 semver — minor-version upgrades have historically broken plugin contracts.

### Option C — Hand-rolled over existing tokenizer

Build the editor on top of `contentEditable` directly, using the existing 80-line marker tokenizer as the model. ~250 lines of new code, no dependency.

- **Maintenance.** All ours. We own every bug.
- **a11y.** All ours. IME, screen readers, bidi, multi-line selection — every edge case is on us.
- **Marker round-trip.** Trivially perfect — we never leave the marker representation; we just paint over it.
- **Performance.** Fastest possible — no framework overhead.
- **Caret feel.** This is where it dies. ContentEditable's native caret behavior across browsers is the exact reason Lexical, Slate, ProseMirror, and TipTap all exist. Building this from scratch — even for "just four marks, no nesting" — is a 2-week side quest, not a 1.5-week phase. The plan's risk callout literally names this: *"ContentEditable is finicky. Mitigation: choose a small, well-tested base rather than rolling our own selection model."*

Verdict: **rejected.** Option C is what the plan explicitly steers away from.

---

## Decision matrix

| Criterion (per Phase C plan) | Lexical | Slate (thin) | Hand-rolled |
|---|---|---|---|
| Bundle size add (edit chunk only) | ~50 KB | ~55 KB | 0 KB |
| Maintenance posture (next 2 years) | Strong (Meta) | Mixed (pre-1.0 semver) | All ours |
| a11y / IME out-of-the-box | Best | OK with footguns | None |
| Marker round-trip difficulty | Low (4 transformers) | Lowest (data model = data model) | Trivial |
| 60fps on 200-word paragraphs | Native operating point | Achievable with care | Native, but caret is the problem |
| Caret feels native (§17 bar) | Yes | Mostly | No |
| Risk of scope creep ("just one more plugin…") | Real (must enforce by hand) | Lower (no plugin marketplace) | None |
| Long-tail i18n risk | Low | Medium (IME history) | High |

---

## Recommendation: **Lexical, with a hard plugin allow-list.**

Reasons, in priority order:

1. **§17's caret-feel bar is binary.** "Premium feel is binary, not 'good enough'" is in the plan's appendix verbatim. Lexical's native operating point is the bar; Slate requires getting React reconciliation right by hand to reach it; hand-rolled means owning IME forever. Lexical is the only option where the bar is the default state.

2. **Marker round-trip is a small, well-bounded surface either way.** Both Lexical and Slate make this a ~four-transformer / ~80-line problem. This is not a differentiator. Both are fine here.

3. **Scope-cap discipline maps cleanly onto Lexical's plugin model.** The risk with Lexical is plugin sprawl ("oh, list support is just one import"). This is exactly the kind of risk the Phase C scope cap is designed to neutralize. We codify the allow-list once, in the editor module's package.json comment, and any future addition is a deliberate plan amendment — not a drive-by.

4. **i18n longevity.** We will ship JA/KO/ZH in the next 12 months for the talent-subscriptions roadmap. Slate's IME history is a meaningful future pain point. Lexical handles this natively.

5. **Performance budget is tight but real.** Edit mode already pulls a non-trivial chunk; +50 KB is a real cost. Mitigation: Lexical only loads inside `?edit=1` (already true for the entire edit chrome). Public-render path is unaffected — markers still render through the existing 80-line `renderInlineRich`, no change.

---

## Hard scope cap (codified for the implementation phase)

These rules become the editor module's contract. Any change is a charter amendment, not a drive-by.

1. **Allowed Lexical packages, full list:**
   - `lexical`
   - `@lexical/react`
   - `@lexical/link` (LinkNode + LinkPlugin only)
   - `@lexical/selection` (helpers we already need for toolbar state)
   That's it. **Disallowed:** `@lexical/history`, `@lexical/list`, `@lexical/markdown`, `@lexical/code`, `@lexical/rich-text`, `@lexical/plain-text`, `@lexical/overflow`, `@lexical/headless`, third-party Lexical plugin packages. (We re-implement plain-text and rich-text behaviors at the size we actually need; we already have draft autosave and revisions, so history is owned.)
2. **Custom nodes, full list:** `AccentNode` (extends TextNode, adds `format = "accent"`). Bold and Italic use stock TextNode format flags. Links use `@lexical/link` LinkNode. **No other custom node types.**
3. **Toolbar actions, full list:** Bold, Italic, Accent, Link. **No font/color/alignment buttons in the floating toolbar.** Style tab (Inspector) is where global type/color goes — that's a Phase E concern, not Phase C.
4. **Keyboard shortcuts, full list:** Cmd-B, Cmd-I, Cmd-K (link). **No others.**
5. **Storage:** the existing four-marker format. Two transformers — `markerStringToLexicalState` and `lexicalStateToMarkerString` — round-trip in both directions. Round-trip on unedited content is byte-identical (verified by snapshot test on real DB content).
6. **No storage migration.** New writes serialize back to markers. Existing rows untouched at deploy.
7. **Public render path unchanged.** `shared/rich-text.tsx` (`renderInlineRich`) keeps rendering markers. The editor primitive is edit-mode-only.
8. **One pass, all surfaces.** `ZodSchemaForm` text/textarea + `LocalizedTextInput` (i18n) + the small set of hand-written `Editor.tsx` files migrate together in a single Phase C commit. No "half the inspector with WYSIWYG and half with raw markers."
9. **`LinkPicker` is reused, not redesigned.** It opens as a popover anchored to the floating toolbar's Link button. Phase C does not touch `LinkPicker`'s internals.

---

## Verification plan (the "lived-experience bar" §17 standard)

These are the gates Phase C must pass on `impronta.tulala.digital/?edit=1` before Phase C is signed off — same discipline as Phase B:

1. Existing site renders identically before and after deploy (no storage changes, public render path untouched).
2. A page with `{accent}` markers in the DB shows accent-styled text in the editor + zero visible markers.
3. Round-trip — type, save, reload — the storage row is byte-identical to the original on unedited spans, and contains correct markers on edited spans.
4. Cmd-B / Cmd-I / Cmd-K all work.
5. Floating toolbar appears with the §17 motion (~120ms ease-out fade + small upward translate).
6. Bold / Italic / Accent buttons reflect active selection state (filled when the selection has that mark).
7. Link mode opens `LinkPicker` as a popover, not a modal.
8. Accent uses the tenant brand-accent token, not a hardcoded color.
9. **a11y:** screen reader (VoiceOver, EN+ES) announces formatting changes; toolbar is keyboard-navigable with Tab/Shift-Tab.
10. **Performance:** typing a 200-word paragraph stays at 60fps in DevTools Performance recording; no React reconcile per keystroke (Profiler shows Lexical's editor-state diffing, not React tree diff).
11. **Mockup compare:** screenshot beside §17 — toolbar position, button rhythm, caret feel must match. Subjective bar; if it doesn't match, the implementation isn't done.

Same gating discipline as Phase B: no "it basically works" sign-off. Lived-experience verification on the real Impronta tenant before the phase is marked complete.

---

## What this evaluation does NOT decide

- **It does not start implementation.** Next step is to ratify this memo and move to the migration-pass plan.
- **It does not commit `package.json`.** The dependency add lands in the implementation commit, not before.
- **It does not amend the convergence plan.** Phase C scope and bar are unchanged. This memo is the appendix the plan called for.

---

## Open questions for the user before implementation

1. **Bundle budget.** Are you OK with ~50 KB min+gz on the edit-mode chunk? (It's edit-mode-only; public visitors never download it.)
2. **AccentNode storage detail.** Lexical lets us store `format: "accent"` either as a TextNode flag bit (cleaner, requires monkey-patching the format bitfield) or as a custom AccentNode (slightly more code, no patching). I recommend the custom node — explicit > clever. Confirm?
3. **Plugin allow-list hardness.** Want this enforced via an ESLint rule (`no-restricted-imports` on disallowed `@lexical/*` packages) so future commits can't bypass it without an explicit override? I recommend yes.

If you're aligned on the recommendation, the next deliverable is the implementation plan: which file gets created (`web/src/components/edit-chrome/inline-editor/`), which existing files get touched in the same commit, and the order of work so the round-trip + toolbar + integration arrives intact in one go.
