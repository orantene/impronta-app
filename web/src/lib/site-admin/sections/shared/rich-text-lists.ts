/**
 * Block-list markers for heading / paragraph / rich-text fields.
 *
 * Inline grammar stays in `rich-text.tsx` (non-nesting `{b}` / `{i}` / …).
 * Lists are a block layer around that grammar:
 *
 *   Hello
 *   {ul}{li}one{/li}{li}two with {b}bold{/b}{/li}{/ul}
 *   World
 *
 * Nested lists are out of scope. Unclosed tags fall through as plain text
 * so a truncated paste cannot drop the rest of the field.
 */

export type RichListKind = "ul" | "ol";

export type RichBlock =
  | { kind: "text"; text: string }
  | { kind: RichListKind; items: string[] };

const UL_OPEN = "{ul}";
const OL_OPEN = "{ol}";
const UL_CLOSE = "{/ul}";
const OL_CLOSE = "{/ol}";
const LI_OPEN = "{li}";
const LI_CLOSE = "{/li}";

export function hasListMarkers(input: string | null | undefined): boolean {
  if (!input) return false;
  return input.includes(UL_OPEN) || input.includes(OL_OPEN);
}

export function serializeListBlock(kind: RichListKind, items: string[]): string {
  return (
    (kind === "ul" ? UL_OPEN : OL_OPEN) +
    items.map((item) => `${LI_OPEN}${item}${LI_CLOSE}`).join("") +
    (kind === "ul" ? UL_CLOSE : OL_CLOSE)
  );
}

function parseListItems(inner: string): string[] {
  const items: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const start = inner.indexOf(LI_OPEN, i);
    if (start === -1) break;
    const end = inner.indexOf(LI_CLOSE, start + LI_OPEN.length);
    if (end === -1) break;
    items.push(inner.slice(start + LI_OPEN.length, end));
    i = end + LI_CLOSE.length;
  }
  return items;
}

/**
 * Split a stored marker string into text runs and list blocks.
 *
 * A newline hugging a list tag is treated as a block separator, not as
 * authored copy, so `Hello\\n{ul}…{/ul}\\nWorld` round-trips as three blocks.
 */
export function splitRichBlocks(input: string): RichBlock[] {
  if (!input) return [];
  const out: RichBlock[] = [];
  let i = 0;
  while (i < input.length) {
    const ulAt = input.indexOf(UL_OPEN, i);
    const olAt = input.indexOf(OL_OPEN, i);
    let next = -1;
    let kind: RichListKind | null = null;
    if (ulAt !== -1 && (olAt === -1 || ulAt < olAt)) {
      next = ulAt;
      kind = "ul";
    } else if (olAt !== -1) {
      next = olAt;
      kind = "ol";
    }
    if (kind === null || next === -1) {
      const rest = input.slice(i);
      if (rest) out.push({ kind: "text", text: rest });
      break;
    }
    if (next > i) {
      let text = input.slice(i, next);
      if (text.endsWith("\n")) text = text.slice(0, -1);
      if (text) out.push({ kind: "text", text });
    }
    const close = kind === "ul" ? UL_CLOSE : OL_CLOSE;
    const openLen = kind === "ul" ? UL_OPEN.length : OL_OPEN.length;
    const closeAt = input.indexOf(close, next + openLen);
    if (closeAt === -1) {
      out.push({ kind: "text", text: input.slice(next) });
      break;
    }
    const items = parseListItems(input.slice(next + openLen, closeAt));
    out.push({ kind, items: items.length > 0 ? items : [""] });
    i = closeAt + close.length;
    if (input[i] === "\n") i += 1;
  }
  return out;
}
