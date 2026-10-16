/**
 * editor-blocks.ts — the writer's in-progress block model.
 *
 * A saved `PostBlock` has every required prop. While a writer is mid-edit some
 * blocks are legitimately incomplete (a Servicio not picked yet, a photo not
 * chosen, a video link half pasted), so the editor holds each block with its
 * props optional and only SAVES the ones that already satisfy the schema. The
 * server rejects a write that carries an invalid block, so an incomplete block
 * must never ride along in an autosave.
 */
import { parsePostBlocks, type PostBlock, type PostBlockType } from "@/lib/cms/post-blocks";

type Loosen<B extends PostBlock> = Pick<B, "id" | "type"> & Partial<Omit<B, "id" | "type">>;
type LoosenAll<B> = B extends PostBlock ? Loosen<B> : never;

/** A block as the editor holds it: props optional until the schema is satisfied. */
export type EditorBlock = LoosenAll<PostBlock>;

export type EditorBlockOf<T extends PostBlockType> = Extract<EditorBlock, { type: T }>;

/** Order of the add-block toolbar: the four primary buttons first, then "more". */
export const PRIMARY_BLOCK_TYPES: readonly PostBlockType[] = ["image", "paragraph", "service", "faq"];
export const MORE_BLOCK_TYPES: readonly PostBlockType[] = [
  "heading",
  "list",
  "gallery",
  "quote",
  "video",
  "divider",
  "book_button",
];

let counter = 0;

export function makeBlockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A fresh block with the props the schema requires already defaulted. */
export function newBlock(type: PostBlockType, id: string = makeBlockId()): EditorBlock {
  switch (type) {
    case "paragraph":
      return { id, type, text: "" };
    case "heading":
      return { id, type, text: "", level: 2 };
    case "list":
      return { id, type, ordered: false, items: [""] };
    case "image":
      return { id, type, alt: "" };
    case "gallery":
      return { id, type, images: [] };
    case "quote":
      return { id, type, text: "" };
    case "video":
      return { id, type };
    case "divider":
      return { id, type };
    case "service":
      return { id, type };
    case "book_button":
      return { id, type };
    case "faq":
      return { id, type, question: "", answer: "" };
  }
}

/** Only the blocks that already satisfy the schema, in order. */
export function savableBlocks(blocks: readonly EditorBlock[]): PostBlock[] {
  return parsePostBlocks(blocks);
}

/** True when a block has nothing the schema would accept yet. */
export function isIncomplete(block: EditorBlock): boolean {
  return parsePostBlocks([block]).length === 0;
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
