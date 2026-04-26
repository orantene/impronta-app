/**
 * Phase C — pure marker-string ↔ token-AST conversion.
 *
 * The Lexical adapters (`markerToLexical.ts`, `lexicalToMarker.ts`) wrap
 * these so that round-trip determinism can be tested with a plain
 * Node/Vitest test runner — without spinning up a headless Lexical
 * editor (the `@lexical/headless` package is banned by the Phase C
 * scope cap).
 *
 * Token grammar (mirrors `shared/rich-text.tsx`):
 *   - `{accent}…{/accent}`  → `{ kind: "accent", text }`
 *   - `{b}…{/b}`            → `{ kind: "bold", text }`
 *   - `{i}…{/i}`            → `{ kind: "italic", text }`
 *   - `[text](url)`         → `{ kind: "link", text, url }`
 *   - anything else         → `{ kind: "text", text }`
 *
 * Round-trip rule: `serialize(tokenize(s)) === s` for any byte-string
 * `s`. The pure-token snapshot fixtures in `transformers.test.ts` lock
 * this property.
 */

export type MarkerToken =
  | { kind: "text"; text: string }
  | { kind: "accent"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; text: string; url: string };

const TOKEN_RE = new RegExp(
  [
    /\{accent\}[^{]*\{\/accent\}/.source,
    /\{b\}[^{]*\{\/b\}/.source,
    /\{i\}[^{]*\{\/i\}/.source,
    /\[[^\]]+\]\([^)]+\)/.source,
  ].join("|"),
  "g",
);

const ACCENT_RE = /^\{accent\}([^{]*)\{\/accent\}$/;
const BOLD_RE = /^\{b\}([^{]*)\{\/b\}$/;
const ITALIC_RE = /^\{i\}([^{]*)\{\/i\}$/;
const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

export function tokenize(input: string): MarkerToken[] {
  if (!input) return [];

  const captured = new RegExp(`(${TOKEN_RE.source})`, "g");
  const parts = input.split(captured).filter((p) => p !== "");

  const out: MarkerToken[] = [];
  for (const part of parts) {
    let m = part.match(ACCENT_RE);
    if (m) {
      out.push({ kind: "accent", text: m[1]! });
      continue;
    }
    m = part.match(BOLD_RE);
    if (m) {
      out.push({ kind: "bold", text: m[1]! });
      continue;
    }
    m = part.match(ITALIC_RE);
    if (m) {
      out.push({ kind: "italic", text: m[1]! });
      continue;
    }
    m = part.match(LINK_RE);
    if (m) {
      out.push({ kind: "link", text: m[1]!, url: m[2]!.trim() });
      continue;
    }
    out.push({ kind: "text", text: part });
  }
  return out;
}

export function serialize(tokens: MarkerToken[]): string {
  let out = "";
  for (const t of tokens) {
    // Empty-content collapse: drop ghost markers so `{b}{/b}` round-
    // trips to "".
    if (t.kind !== "link" && t.text === "") continue;
    if (t.kind === "link" && t.text === "") continue;

    switch (t.kind) {
      case "text":
        out += t.text;
        break;
      case "accent":
        out += `{accent}${t.text}{/accent}`;
        break;
      case "bold":
        out += `{b}${t.text}{/b}`;
        break;
      case "italic":
        out += `{i}${t.text}{/i}`;
        break;
      case "link":
        out += `[${t.text}](${t.url})`;
        break;
    }
  }
  return out;
}

/** True if the input has zero markers (no editor work to do). */
export function isPlainText(input: string): boolean {
  if (!input) return true;
  TOKEN_RE.lastIndex = 0;
  return !TOKEN_RE.test(input);
}
