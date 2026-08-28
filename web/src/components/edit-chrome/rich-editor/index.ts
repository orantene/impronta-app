/**
 * Phase C — public API of the inline-editor module.
 *
 * Scope contract (locked by ESLint allow-list + this re-export surface):
 *   - Lexical packages used: `lexical`, `@lexical/react`, `@lexical/link`,
 *     `@lexical/selection` only.
 *   - Custom nodes: `AccentNode`, `ColorNode`.
 *   - Toolbar actions: Bold / Italic / Accent / Color / Link.
 *   - Keyboard shortcuts: ⌘B / ⌘I / ⌘K only.
 *
 * `ColorNode` + the Color action are the one ratified charter amendment to
 * the original Phase-C cap — inline free color, added under the "mimic any
 * design" directive. Anything further is a new amendment, not a drive-by.
 *
 * 2026 page-builder batch (Lane E) adds one more: `SlashCommandPlugin`, a
 * "/" insert menu inside `CanvasEditOverlay`'s text editing (see its own
 * header doc). It's a NEW INSERT SURFACE, not a formatting shortcut, so it
 * is deliberately outside the "⌘B / ⌘I / ⌘K only" formatting-shortcut cap
 * above — that cap lives in `KeyboardShortcutsPlugin.tsx` and was left
 * untouched. No new Lexical packages were added; the plugin uses only
 * `lexical` core commands, already inside the allow-list.
 *
 * 2026 Field Report W3 (B4) amends the Phase C cap: heading and
 * paragraph fields accept real ul/ol mixed with inline markers. Lists
 * are custom ElementNodes in this editor (still no `@lexical/list`
 * package). Public paint is `renderInlineRich()` emitting real `<ul>` /
 * `<ol>`.
 *
 * Public render path is unchanged for strings without list markers —
 * `shared/rich-text.tsx`'s `renderInlineRich()` continues to handle
 * public visitors. This module is edit-mode-only.
 */

export { RichEditor } from "./RichEditor";
export type { RichEditorVariant } from "./RichEditor";
export { CanvasEditOverlay } from "./CanvasEditOverlay";
export { tokenize, serialize, isPlainText } from "./transformers/tokens";
export type { MarkerToken } from "./transformers/tokens";
