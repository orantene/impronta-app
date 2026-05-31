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
 * Public render path is unchanged — `shared/rich-text.tsx`'s
 * `renderInlineRich()` continues to handle public visitors. This module
 * is edit-mode-only.
 */

export { RichEditor } from "./RichEditor";
export type { RichEditorVariant } from "./RichEditor";
export { CanvasEditOverlay } from "./CanvasEditOverlay";
export { tokenize, serialize, isPlainText } from "./transformers/tokens";
export type { MarkerToken } from "./transformers/tokens";
