/**
 * post-text-lists.ts (TUL-1399): turn a Texto (paragraph) block's plain text
 * into paragraphs and bullet / numbered lists.
 *
 * The Posts writer's Texto block is plain text. Writers type "- item" or
 * "1. item" lines expecting a list; before this, those lines collapsed into one
 * paragraph on the public page. Pure and client/server safe, so the public
 * renderer and the writer preview agree.
 *
 * Rules: chunks are split on blank lines. Inside a chunk, a run of lines that
 * start with "- ", "* " or a bullet char is an unordered list; a run starting
 * "1. " / "1) " is an ordered list. Other lines stay a paragraph, joined with
 * a newline (the renderer shows it as a line break). A text with no list lines
 * renders exactly as before.
 */

export type TextSegment =
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*(?:[-*•])\s+(.*\S)\s*$/u;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*\S)\s*$/u;

function lineKind(line: string): { kind: "ul" | "ol"; text: string } | null {
  const b = BULLET.exec(line);
  if (b) return { kind: "ul", text: b[1] };
  const n = NUMBERED.exec(line);
  if (n) return { kind: "ol", text: n[1] };
  return null;
}

export function parseParagraphText(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  for (const chunk of text.split("\n\n")) {
    const lines = chunk.split("\n");
    let para: string[] = [];
    let list: { kind: "ul" | "ol"; items: string[] } | null = null;
    const flushPara = () => {
      if (para.length > 0) out.push({ kind: "p", text: para.join("\n") });
      para = [];
    };
    const flushList = () => {
      if (list) out.push(list);
      list = null;
    };
    for (const line of lines) {
      const hit = lineKind(line);
      if (!hit) {
        flushList();
        para.push(line);
        continue;
      }
      flushPara();
      if (list && list.kind !== hit.kind) flushList();
      if (!list) list = { kind: hit.kind, items: [] };
      list.items.push(hit.text);
    }
    flushList();
    flushPara();
  }
  return out;
}
