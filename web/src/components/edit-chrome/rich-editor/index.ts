/**
 * Phase C — public API of the inline-editor module.
 *
 * Hard scope cap (locked by ESLint allow-list + this re-export surface):
 *   - Lexical packages used: `lexical`, `@lexical/react`, `@lexical/link`,
 *     `@lexical/selection` only.
 *   - Custom nodes: `AccentNode` only.
 *   - Toolbar actions: Bold / Italic / Accent / Link only.
 *   - Keyboard shortcuts: ⌘B / ⌘I / ⌘K only.
 *
 * Anything outside that contract is a charter amendment, not a drive-by.
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
