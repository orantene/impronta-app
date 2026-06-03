import React from "react";

/**
 * renderMessageMarkdown — a tiny, SAFE markdown subset rendered as React nodes.
 *
 * Hard constraints (shared CONTRACT — consumed by the message shells):
 *   • NO dangerouslySetInnerHTML. Everything is built as React elements, so
 *     the React runtime escapes all text for us automatically.
 *   • Supported inline marks: **bold**, *italic*, `inline code`.
 *   • Block constructs: fenced ```code blocks```, "- " / "* " bullet lists.
 *   • Bare URLs auto-linked; [label](url) links — http/https ONLY, always
 *     rel="noreferrer noopener" target="_blank".
 *   • newline -> <br/> (within a paragraph).
 *   • Anything that is not one of the above renders as its literal text.
 *
 * The implementation never interprets HTML: because we only ever create text
 * nodes + a fixed set of elements, unknown/unsafe markup (e.g. "<script>")
 * shows up verbatim as text.
 */

export function renderMessageMarkdown(text: string): React.ReactNode {
  if (typeof text !== "string" || text.length === 0) return null;

  const blocks = splitFencedBlocks(text);
  const out: React.ReactNode[] = [];

  blocks.forEach((block, i) => {
    if (block.type === "code") {
      out.push(
        <pre
          key={`code-${i}`}
          className="my-1 overflow-x-auto whitespace-pre-wrap rounded-md bg-black/5 px-2 py-1 font-mono text-[0.85em]"
        >
          <code>{block.content}</code>
        </pre>,
      );
      return;
    }
    // A text block can itself contain bullet lists interleaved with prose.
    out.push(...renderTextBlock(block.content, `t-${i}`));
  });

  return <>{out}</>;
}

// ---------------------------------------------------------------------------
// Block-level: fenced code splitting
// ---------------------------------------------------------------------------

type Block = { type: "text" | "code"; content: string };

function splitFencedBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const fence = "```";
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf(fence, cursor);
    if (open === -1) {
      blocks.push({ type: "text", content: text.slice(cursor) });
      break;
    }
    // text before the fence
    if (open > cursor) {
      blocks.push({ type: "text", content: text.slice(cursor, open) });
    }
    const afterOpen = open + fence.length;
    const close = text.indexOf(fence, afterOpen);
    if (close === -1) {
      // Unterminated fence — treat the rest as literal text (incl. the fence).
      blocks.push({ type: "text", content: text.slice(open) });
      break;
    }
    let code = text.slice(afterOpen, close);
    // Drop an optional language hint on the opening line, and the leading/
    // trailing newline that wraps a typical fenced block.
    code = code.replace(/^[^\n]*\n/, (m) => (/^\w*\s*$/.test(m.slice(0, -1)) ? "" : m));
    code = code.replace(/\n$/, "");
    blocks.push({ type: "code", content: code });
    cursor = close + fence.length;
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Text blocks: bullet lists + paragraphs with <br/>
// ---------------------------------------------------------------------------

function renderTextBlock(text: string, keyBase: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  let listItems: string[] | null = null;
  let paraLines: string[] | null = null;

  const flushList = (idx: number) => {
    if (listItems && listItems.length > 0) {
      const items = listItems;
      nodes.push(
        <ul key={`${keyBase}-ul-${idx}`} className="my-1 list-disc pl-5">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
    }
    listItems = null;
  };

  const flushPara = (idx: number) => {
    if (paraLines && paraLines.length > 0) {
      const pl = paraLines;
      nodes.push(
        <React.Fragment key={`${keyBase}-p-${idx}`}>
          {pl.map((line, j) => (
            <React.Fragment key={j}>
              {renderInline(line)}
              {j < pl.length - 1 ? <br /> : null}
            </React.Fragment>
          ))}
        </React.Fragment>,
      );
    }
    paraLines = null;
  };

  lines.forEach((line, idx) => {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara(idx);
      if (!listItems) listItems = [];
      listItems.push(bullet[1]);
    } else {
      flushList(idx);
      if (!paraLines) paraLines = [];
      paraLines.push(line);
    }
  });

  flushList(lines.length);
  flushPara(lines.length);

  return nodes;
}

// ---------------------------------------------------------------------------
// Inline: links, bold, italic, inline code, bare URLs
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]/g;

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Tokenize a single line of inline content. We process in a fixed priority:
 *   1. inline code (`…`) — its contents are NOT further parsed
 *   2. [label](url) links
 *   3. **bold**
 *   4. *italic*
 *   5. bare URLs
 * Everything else is literal text (React escapes it).
 */
function renderInline(text: string): React.ReactNode {
  return parseSegments(text, 0);
}

function parseSegments(text: string, depth: number): React.ReactNode[] {
  if (!text) return [];
  // Guard against pathological nesting.
  if (depth > 8) return [text];

  const nodes: React.ReactNode[] = [];
  let rest = text;
  let key = 0;

  while (rest.length > 0) {
    const next = findNextToken(rest);
    if (!next) {
      nodes.push(rest);
      break;
    }
    if (next.start > 0) {
      nodes.push(rest.slice(0, next.start));
    }
    nodes.push(<React.Fragment key={`f-${depth}-${key++}`}>{next.node}</React.Fragment>);
    rest = rest.slice(next.end);
  }

  return nodes;
}

type Token = { start: number; end: number; node: React.ReactNode };

function findNextToken(text: string): Token | null {
  let best: { start: number; build: () => Token } | null = null;

  const consider = (start: number, build: () => Token) => {
    if (start < 0) return;
    if (!best || start < best.start) best = { start, build };
  };

  // 1. inline code
  {
    const m = /`([^`]+)`/.exec(text);
    if (m) {
      const idx = m.index;
      consider(idx, () => ({
        start: idx,
        end: idx + m[0].length,
        node: (
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">
            {m[1]}
          </code>
        ),
      }));
    }
  }

  // 2. [label](url) link
  {
    const m = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text);
    if (m && isSafeHttpUrl(m[2])) {
      const idx = m.index;
      consider(idx, () => ({
        start: idx,
        end: idx + m[0].length,
        node: (
          <a
            href={m[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2"
          >
            {parseSegments(m[1], 1)}
          </a>
        ),
      }));
    }
  }

  // 3. **bold**
  {
    const m = /\*\*([^*]+)\*\*/.exec(text);
    if (m) {
      const idx = m.index;
      consider(idx, () => ({
        start: idx,
        end: idx + m[0].length,
        node: <strong>{parseSegments(m[1], 1)}</strong>,
      }));
    }
  }

  // 4. *italic* — avoid matching the inner of ** by requiring non-* boundary
  {
    const m = /\*([^*\s][^*]*?)\*/.exec(text);
    if (m) {
      const idx = m.index;
      consider(idx, () => ({
        start: idx,
        end: idx + m[0].length,
        node: <em>{parseSegments(m[1], 1)}</em>,
      }));
    }
  }

  // 5. bare URL
  {
    URL_RE.lastIndex = 0;
    const m = URL_RE.exec(text);
    if (m && isSafeHttpUrl(m[0])) {
      const idx = m.index;
      const url = m[0];
      consider(idx, () => ({
        start: idx,
        end: idx + url.length,
        node: (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 break-all"
          >
            {url}
          </a>
        ),
      }));
    }
  }

  if (!best) return null;
  return (best as { build: () => Token }).build();
}
