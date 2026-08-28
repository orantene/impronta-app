/**
 * Phase C — Lexical theme tokens for the inline rich-text editor.
 *
 * Maps node types + format flags to the same CSS classes the public
 * `renderInlineRich()` produces, so the live editor and the public site
 * are visually identical pixel-for-pixel.
 */

import type { EditorThemeClasses } from "lexical";

export const richEditorTheme: EditorThemeClasses = {
  paragraph: "site-rich-paragraph",
  list: {
    ul: "site-rich-ul",
    ol: "site-rich-ol",
    listitem: "site-rich-li",
  },
  text: {
    bold: "site-rich-bold",
    italic: "site-rich-italic",
  },
  link: "site-link",
};
