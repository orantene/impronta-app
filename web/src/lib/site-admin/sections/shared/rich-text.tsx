import type { ReactNode } from "react";

/**
 * M8 / Phase 2 — lightweight rich-text annotation renderer.
 *
 * Supported markers (Zod-validated text fields, no HTML parsing):
 *   {accent}…{/accent}   →  italic serif blush accent (the editorial voice)
 *   {b}…{/b}             →  semantic <strong>
 *   {i}…{/i}             →  semantic <em> (plain italic, not the accent)
 *   [text](url)          →  Markdown link → <a href="url">text</a>
 *
 * The tokenizer is regex-based and the markers are non-nesting (a {b} can
 * sit inside an [link]() but not inside another {b}). This is intentional
 * — we get 99% of the editorial value for ~30 lines of code instead of
 * shipping Lexical.
 *
 * Upgradable: when we eventually ship a full editor, the parser accepts
 * the same strings without migration.
 */

// Match any marker. Order matters: longer/specific markers first.
const TOKEN_RE = new RegExp(
  [
    /\{accent\}[^{]*\{\/accent\}/.source,
    /\{b\}[^{]*\{\/b\}/.source,
    /\{i\}[^{]*\{\/i\}/.source,
    /\[[^\]]+\]\([^)]+\)/.source,
  ].join("|"),
  "g",
);

const ACCENT_RE = /^\{accent\}(.*)\{\/accent\}$/;
const BOLD_RE = /^\{b\}(.*)\{\/b\}$/;
const ITALIC_RE = /^\{i\}(.*)\{\/i\}$/;
const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

export function renderInlineRich(
  input: string | null | undefined,
): ReactNode[] {
  if (!input) return [];
  // Capture by wrapping the alternation in a single group so split keeps
  // the matched markers in the parts array.
  const captured = new RegExp(`(${TOKEN_RE.source})`, "g");
  const parts = input.split(captured).filter((p) => p !== "");
  return parts.map((part, i) => {
    let m = part.match(ACCENT_RE);
    if (m) {
      return (
        <em
          key={i}
          className="site-accent"
          style={{ fontStyle: "italic", fontWeight: 300 }}
        >
          {m[1]}
        </em>
      );
    }
    m = part.match(BOLD_RE);
    if (m) return <strong key={i}>{m[1]}</strong>;
    m = part.match(ITALIC_RE);
    if (m) return <em key={i}>{m[1]}</em>;
    m = part.match(LINK_RE);
    if (m) {
      const href = m[2].trim();
      const isExternal = /^https?:\/\//i.test(href);
      return (
        <a
          key={i}
          href={href}
          className="site-link"
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
        >
          {m[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Returns true when the input contains at least one annotation token.
 * Useful for editor previews.
 */
export function hasRichAnnotations(input: string | null | undefined): boolean {
  if (!input) return false;
  return /\{accent\}[^{]*\{\/accent\}|\{b\}[^{]*\{\/b\}|\{i\}[^{]*\{\/i\}|\[[^\]]+\]\([^)]+\)/.test(
    input,
  );
}
