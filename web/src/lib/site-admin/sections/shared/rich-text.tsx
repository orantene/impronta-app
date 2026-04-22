import type { ReactNode } from "react";

/**
 * M8 — lightweight rich-text annotation renderer.
 *
 * Pattern: `Curated wedding talent for {accent}timeless celebrations{/accent}.`
 *
 * Supports exactly one annotation today: `{accent}...{/accent}` wraps the
 * contained text in an italic serif blush accent (the Muse Bridal editorial
 * voice). Because the tokenizer is regex-based the input string is safe for
 * any Zod-validated text field — no HTML parsing, no injection risk.
 *
 * Why this over a full Lexical editor:
 *   - One annotation covers 80% of editorial brands' stylistic needs.
 *   - Zero dependency, zero editor chrome work.
 *   - Upgradable: when we ship Lexical later, the parser accepts the same
 *     strings without migration.
 */

const TOKEN_RE = /(\{accent\}[^{]*\{\/accent\})/g;

export function renderInlineRich(
  input: string | null | undefined,
): ReactNode[] {
  if (!input) return [];
  const parts = input.split(TOKEN_RE).filter((p) => p !== "");
  return parts.map((part, i) => {
    const match = part.match(/^\{accent\}(.*)\{\/accent\}$/);
    if (match) {
      return (
        <em
          key={i}
          className="site-accent"
          style={{ fontStyle: "italic", fontWeight: 300 }}
        >
          {match[1]}
        </em>
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
  return /\{accent\}[^{]*\{\/accent\}/.test(input);
}
