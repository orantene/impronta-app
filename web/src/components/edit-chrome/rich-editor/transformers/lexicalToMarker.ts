/**
 * Phase C — Lexical adapter: list of leaf nodes → marker string.
 *
 * Inverse of `markerToLexical.markerStringToNodes`. Walks Lexical leaves,
 * collects them into the pure `MarkerToken[]` AST, and delegates the
 * actual byte-emission to `tokens.serialize` so round-trip determinism
 * is enforced at the pure-token layer (where Vitest snapshots cover it).
 *
 * Stock format flags (`IS_BOLD`, `IS_ITALIC`) on a TextNode become
 * `bold` / `italic` tokens. Combined `BOLD + ITALIC` (toolbar never
 * emits this; tolerated on parse) is split into two tokens with a
 * deterministic order — bold-outside, italic-inside on output is a
 * canonical form, but combined runs are extremely rare and any
 * historical input that round-trips through Phase C will normalize on
 * its first save (acceptable per the migration plan §6 rule 3).
 *
 * Must be called inside `editorState.read(...)` so node accessors work.
 */

import { improntaLog } from "@/lib/server/structured-log";
import {
  $isTextNode,
  IS_BOLD,
  IS_ITALIC,
  type LexicalNode,
} from "lexical";
import { $isLinkNode } from "@lexical/link";

import { $isAccentNode } from "../nodes/AccentNode";
import { $isColorNode } from "../nodes/ColorNode";
import { type MarkerToken, serialize } from "./tokens";

export function lexicalNodesToMarkerString(nodes: LexicalNode[]): string {
  const tokens: MarkerToken[] = [];
  for (const node of nodes) {
    if ($isAccentNode(node)) {
      const text = node.getTextContent();
      if (text === "") continue;
      // Accent supersedes BOLD/ITALIC at the marker layer (we only have
      // the four markers; nesting bold inside accent isn't representable
      // in the canonical grammar). The toolbar prevents the operator
      // from layering bold inside accent.
      tokens.push({ kind: "accent", text });
      continue;
    }
    if ($isColorNode(node)) {
      // ColorNode is a TextNode subclass — must be matched before the
      // generic $isTextNode branch below. Color supersedes BOLD/ITALIC at
      // the marker layer (non-nesting grammar), same as accent.
      const text = node.getTextContent();
      if (text === "") continue;
      tokens.push({ kind: "color", text, color: node.getColor() });
      continue;
    }
    if ($isLinkNode(node)) {
      const text = node.getTextContent();
      const url = node.getURL();
      if (text === "") continue;
      tokens.push({ kind: "link", text, url });
      continue;
    }
    if ($isTextNode(node)) {
      const text = node.getTextContent();
      if (text === "") continue;
      const fmt = node.getFormat();
      const isBold = (fmt & IS_BOLD) !== 0;
      const isItalic = (fmt & IS_ITALIC) !== 0;
      if (isBold && isItalic) {
        // The marker grammar is deliberately NON-NESTING (see
        // sections/shared/rich-text.tsx + tokens.ts) and has no combined
        // bold+italic token, so one run cannot carry both flags. The old code
        // emitted nested `{b}{i}…{/i}{/b}`, but the tokenizer's `[^{]*` content
        // rule CANNOT re-parse a marker that contains another `{` — so on the
        // next load that leaked the literal "{b}{i}" wrappers into the
        // operator's copy. Reproduced live: clicking Bold then Italic on one
        // selection, then saving, corrupted the stored text.
        //
        // Degrade to bold (the stronger visual weight) so the run ALWAYS
        // round-trips cleanly. A future combined `{bi}` token — added to both
        // this editor grammar AND the public renderer — could preserve both.
        tokens.push({ kind: "bold", text });
        continue;
      }
      if (isBold) {
        tokens.push({ kind: "bold", text });
        continue;
      }
      if (isItalic) {
        tokens.push({ kind: "italic", text });
        continue;
      }
      tokens.push({ kind: "text", text });
      continue;
    }
    if (node.getType() === "linebreak") {
      tokens.push({ kind: "text", text: "\n" });
      continue;
    }
    if (process.env.NODE_ENV !== "production") {
      void improntaLog("edit_chrome_lexicaltomarker.warn", {
        message: "[inline-editor] lexicalNodesToMarkerString: unknown node type",
        detail: node.getType(),
      });
    }
    tokens.push({ kind: "text", text: node.getTextContent() });
  }
  return serialize(tokens);
}
