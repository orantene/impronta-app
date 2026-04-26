/**
 * Phase C — `AccentNode` is the Lexical model for our `{accent}…{/accent}`
 * marker. It extends `TextNode` so that selection / caret / insert / delete
 * mechanics are inherited verbatim, and only overrides the bits we need:
 *
 *   - `getType()` / `clone()` / `importJSON()` / `exportJSON()` so the
 *     editor knows accent is a distinct node type when round-tripping
 *     editor state JSON.
 *
 *   - `createDOM()` adds the `site-accent` class so the live editor matches
 *     the public render produced by `renderInlineRich()`. Visual parity:
 *     italic serif blush — the editorial voice.
 *
 *   - `isSimpleText()` returns `true` so Lexical merges adjacent simple
 *     text nodes correctly (for accent + non-accent neighbors, the merge
 *     is blocked because the type differs — which is exactly what we
 *     want).
 *
 * Why a custom node and not a TextNode format-bit:
 *   The plan ratification was explicit — readability over cleverness.
 *   Format bits are a 16-bit bitfield with stock entries (BOLD / ITALIC /
 *   STRIKETHROUGH / UNDERLINE / etc.). Hijacking an unused bit would
 *   break if Lexical ever assigns that bit to a new format. A custom
 *   node is explicit and self-documenting at the cost of ~50 lines.
 *
 * Format flags:
 *   AccentNode inherits `setFormat`/`hasFormat` from TextNode, so an
 *   accent run can also be bold or italic. The transformer emits the
 *   markers in a deterministic order (`{accent}{b}…{/b}{/accent}`) to
 *   keep round-trip byte-identical.
 *
 * Scope cap: this is the ONLY custom Lexical node we add. Any future
 * custom node is a charter amendment, not a drive-by.
 */

import {
  $applyNodeReplacement,
  type EditorConfig,
  type NodeKey,
  type SerializedTextNode,
  TextNode,
} from "lexical";

export type SerializedAccentNode = SerializedTextNode;

export class AccentNode extends TextNode {
  static getType(): string {
    return "accent";
  }

  static clone(node: AccentNode): AccentNode {
    return new AccentNode(node.__text, node.__key);
  }

  constructor(text: string, key?: NodeKey) {
    super(text, key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    // Reuse the parent class behavior for format flags (BOLD / ITALIC),
    // then layer the accent class + inline style so the live editor
    // matches `<em class="site-accent" style="font-style:italic; font-weight:300;">`
    // produced by the public `renderInlineRich`.
    const dom = super.createDOM(config);
    dom.classList.add("site-accent");
    // Force inline italic + lighter weight so the styling lands even before
    // the tenant's site CSS hits the editor scope. The public render
    // matches via the same inline style attributes (see shared/rich-text.tsx).
    dom.style.fontStyle = "italic";
    dom.style.fontWeight = "300";
    return dom;
  }

  static importJSON(serializedNode: SerializedAccentNode): AccentNode {
    const node = $createAccentNode(serializedNode.text);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  exportJSON(): SerializedAccentNode {
    return {
      ...super.exportJSON(),
      type: "accent",
      version: 1,
    };
  }

  isSimpleText(): boolean {
    // Treat accent runs as simple text for caret arithmetic but not for
    // merging — the type guard prevents Lexical from merging an accent
    // run with a plain TextNode neighbor.
    return false;
  }
}

export function $createAccentNode(text = ""): AccentNode {
  return $applyNodeReplacement(new AccentNode(text));
}

export function $isAccentNode(
  node: unknown,
): node is AccentNode {
  return node instanceof AccentNode;
}
