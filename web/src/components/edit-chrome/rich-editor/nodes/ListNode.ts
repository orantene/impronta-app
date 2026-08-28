/**
 * Custom list nodes for the existing Lexical rich editor.
 *
 * Phase C banned `@lexical/list`. Field Report W3 B4 needs real ul/ol in
 * the same editor, so these ElementNodes live here instead of a second
 * editor or a new Lexical package.
 */

import {
  $applyNodeReplacement,
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from "lexical";

export type BuilderListType = "bullet" | "number";

export type SerializedBuilderListNode = Spread<
  { listType: BuilderListType; type: "builder-list"; version: 1 },
  SerializedElementNode
>;

export type SerializedBuilderListItemNode = Spread<
  { type: "builder-list-item"; version: 1 },
  SerializedElementNode
>;

export class BuilderListNode extends ElementNode {
  __listType: BuilderListType;

  static override getType(): string {
    return "builder-list";
  }

  static override clone(node: BuilderListNode): BuilderListNode {
    return new BuilderListNode(node.__listType, node.__key);
  }

  constructor(listType: BuilderListType = "bullet", key?: NodeKey) {
    super(key);
    this.__listType = listType;
  }

  getListType(): BuilderListType {
    return this.getLatest().__listType;
  }

  setListType(listType: BuilderListType): this {
    const writable = this.getWritable();
    writable.__listType = listType;
    return writable;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const tag = this.__listType === "number" ? "ol" : "ul";
    const el = document.createElement(tag);
    el.className =
      this.__listType === "number" ? "site-rich-ol" : "site-rich-ul";
    el.style.margin = "0.4em 0";
    el.style.paddingInlineStart = "1.35em";
    el.style.listStyleType = this.__listType === "number" ? "decimal" : "disc";
    return el;
  }

  override updateDOM(prev: BuilderListNode): boolean {
    return prev.__listType !== this.__listType;
  }

  static override importJSON(json: SerializedBuilderListNode): BuilderListNode {
    return $createBuilderListNode(json.listType);
  }

  override exportJSON(): SerializedBuilderListNode {
    return {
      ...super.exportJSON(),
      type: "builder-list",
      listType: this.__listType,
      version: 1,
    };
  }

  override canBeEmpty(): boolean {
    return false;
  }
}

export class BuilderListItemNode extends ElementNode {
  static override getType(): string {
    return "builder-list-item";
  }

  static override clone(node: BuilderListItemNode): BuilderListItemNode {
    return new BuilderListItemNode(node.__key);
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement("li");
    el.className = "site-rich-li";
    return el;
  }

  override updateDOM(): boolean {
    return false;
  }

  static override importJSON(): BuilderListItemNode {
    return $createBuilderListItemNode();
  }

  override exportJSON(): SerializedBuilderListItemNode {
    return {
      ...super.exportJSON(),
      type: "builder-list-item",
      version: 1,
    };
  }

  override canBeEmpty(): boolean {
    return true;
  }
}

export function $createBuilderListNode(
  listType: BuilderListType = "bullet",
): BuilderListNode {
  return $applyNodeReplacement(new BuilderListNode(listType));
}

export function $createBuilderListItemNode(): BuilderListItemNode {
  return $applyNodeReplacement(new BuilderListItemNode());
}

export function $isBuilderListNode(
  node: LexicalNode | null | undefined,
): node is BuilderListNode {
  return node instanceof BuilderListNode;
}

export function $isBuilderListItemNode(
  node: LexicalNode | null | undefined,
): node is BuilderListItemNode {
  return node instanceof BuilderListItemNode;
}
