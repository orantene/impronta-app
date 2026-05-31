/**
 * `ColorNode` is the Lexical model for our `{color:#hex}…{/color}` marker —
 * an inline run painted in an arbitrary author-chosen color.
 *
 * It mirrors `AccentNode` exactly (extends `TextNode`, blocks merging via
 * `isSimpleText() === false`) but carries one extra field — `__color` — so
 * each colored run round-trips its own hex through clone / importJSON /
 * exportJSON.
 *
 * Why a second custom node (the AccentNode header reserved "only one custom
 * node" for Phase C):
 *   The product owner asked for true inline color ("how do I change
 *   color?") under the standing directive — "the most flexible page builder
 *   I can mimic any design into." Free text color is table-stakes for that
 *   goal and cannot be expressed with the stock 16-bit format bitfield (it
 *   needs a value, not a flag). A custom node carrying the value is the
 *   same reasoning AccentNode used; this is the sanctioned charter
 *   amendment, not a drive-by.
 *
 * Grammar interplay:
 *   The marker grammar is non-nesting (`[^{]*` content), so a color run is
 *   mutually exclusive with bold / italic / accent at the marker layer —
 *   identical to the accent tradeoff. `setColor` therefore drops sibling
 *   format on apply so the editor stays WYSIWYG-honest with what persists.
 */

import {
  $applyNodeReplacement,
  type EditorConfig,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";

export type SerializedColorNode = Spread<
  { color: string },
  SerializedTextNode
>;

const DEFAULT_COLOR = "#3d4f7c";

export class ColorNode extends TextNode {
  __color: string;

  static override getType(): string {
    return "color";
  }

  static override clone(node: ColorNode): ColorNode {
    return new ColorNode(node.__text, node.__color, node.__key);
  }

  constructor(text: string, color: string = DEFAULT_COLOR, key?: NodeKey) {
    super(text, key);
    this.__color = color;
  }

  getColor(): string {
    return this.getLatest().__color;
  }

  setColor(color: string): this {
    const self = this.getWritable();
    self.__color = color;
    return self;
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add("site-color");
    dom.style.color = this.__color;
    return dom;
  }

  override updateDOM(
    prevNode: this,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    // If the parent recreates the DOM (text/format change), let it — the new
    // node's createDOM re-applies the color. Otherwise patch the color in
    // place when only the hex changed.
    const recreated = super.updateDOM(prevNode, dom, config);
    if (recreated) return true;
    if (prevNode.__color !== this.__color) {
      dom.style.color = this.__color;
    }
    return false;
  }

  static override importJSON(serializedNode: SerializedColorNode): ColorNode {
    const node = $createColorNode(serializedNode.text, serializedNode.color);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  override exportJSON(): SerializedColorNode {
    return {
      ...super.exportJSON(),
      type: "color",
      color: this.__color,
      version: 1,
    };
  }

  override isSimpleText(): boolean {
    // Block merging with plain-text and differently-colored neighbours so
    // each color run stays a distinct node (same guard AccentNode uses).
    return false;
  }
}

export function $createColorNode(
  text = "",
  color: string = DEFAULT_COLOR,
): ColorNode {
  return $applyNodeReplacement(new ColorNode(text, color));
}

export function $isColorNode(node: unknown): node is ColorNode {
  return node instanceof ColorNode;
}
