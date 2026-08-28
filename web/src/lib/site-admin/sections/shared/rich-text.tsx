import { Fragment, type ReactNode } from "react";

import { splitRichBlocks } from "./rich-text-lists";

/**
 * M8 / Phase 2 — lightweight rich-text annotation renderer.
 *
 * Supported markers (Zod-validated text fields, no HTML parsing):
 *   {accent}…{/accent}      →  italic serif blush accent (the editorial voice)
 *   {color:#hex}…{/color}   →  inline run painted in an author-chosen color
 *   {b}…{/b}                →  semantic <strong>
 *   {i}…{/i}                →  semantic <em> (plain italic, not the accent)
 *   [text](url)             →  Markdown link → <a href="url">text</a>
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
// Exported (source-of-truth grammar) so the canvas's optimistic-repaint HTML
// serializer (`inline-editor-repaint.ts`) tokenizes IDENTICALLY to this React
// renderer and can never drift from the published render.
export const TOKEN_RE = new RegExp(
  [
    /\{color:#[0-9a-fA-F]{3,8}\}[^{]*\{\/color\}/.source,
    /\{accent\}[^{]*\{\/accent\}/.source,
    /\{b\}[^{]*\{\/b\}/.source,
    /\{i\}[^{]*\{\/i\}/.source,
    /\[[^\]]+\]\([^)]+\)/.source,
  ].join("|"),
  "g",
);

export const ACCENT_RE = /^\{accent\}(.*)\{\/accent\}$/;
export const COLOR_RE = /^\{color:(#[0-9a-fA-F]{3,8})\}(.*)\{\/color\}$/;
export const BOLD_RE = /^\{b\}(.*)\{\/b\}$/;
export const ITALIC_RE = /^\{i\}(.*)\{\/i\}$/;
export const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

/**
 * SECURITY — markdown-link href allowlist. Author-supplied text fields render on
 * published pages on the shared apex domain (.tulala.digital cookies are
 * parent-scoped) under a `script-src 'unsafe-inline'` CSP, so a `javascript:`
 * href here is clickable cross-tenant XSS. React does NOT neutralize
 * `javascript:`/`data:` URLs in `href` at runtime — only the allowlist below
 * does. Permits http(s):// + relative / in-page targets only; everything else
 * is rendered as plain label text (no anchor). Slightly more lenient than
 * `isSafeBuilderRichTextHref` in builder-node/render.tsx (which is https-only
 * for greenfield nodes) — http is allowed here to preserve legacy published
 * links; the XSS-bearing schemes (javascript:/data:/vbscript:) are what matter.
 */
export function isSafeRichTextHref(value: string): boolean {
  const href = value.trim();
  if (!href || href.startsWith("//")) return false;
  if (/^https?:\/\//i.test(href)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  return (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("?") ||
    href.startsWith("./") ||
    href.startsWith("../")
  );
}

export function renderInlineRich(
  input: string | null | undefined,
): ReactNode[] {
  if (!input) return [];
  const blocks = splitRichBlocks(input);
  const hasList = blocks.some((block) => block.kind === "ul" || block.kind === "ol");
  if (!hasList) return renderInlineTokens(input);
  const out: ReactNode[] = [];
  blocks.forEach((block, i) => {
    if (block.kind === "text") {
      out.push(
        <Fragment key={`text-${i}`}>{renderInlineTokens(block.text)}</Fragment>,
      );
      return;
    }
    const Tag = block.kind;
    out.push(
      <Tag key={`list-${i}`} className="site-rich-list">
        {block.items.map((item, k) => (
          <li key={k}>{renderInlineTokens(item)}</li>
        ))}
      </Tag>,
    );
  });
  return out;
}

function renderInlineTokens(input: string): ReactNode[] {
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
    m = part.match(COLOR_RE);
    if (m) {
      return (
        <span key={i} className="site-color" style={{ color: m[1] }}>
          {m[2]}
        </span>
      );
    }
    m = part.match(BOLD_RE);
    if (m) return <strong key={i}>{m[1]}</strong>;
    m = part.match(ITALIC_RE);
    if (m) return <em key={i}>{m[1]}</em>;
    m = part.match(LINK_RE);
    if (m) {
      const href = m[2].trim();
      // SECURITY: only render an anchor for allowlisted hrefs. Unsafe schemes
      // (javascript:/data:/vbscript:/…) fall through to a plain-text label so a
      // malicious markdown link can never become a clickable XSS sink.
      if (isSafeRichTextHref(href)) {
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
      return <span key={i}>{m[1]}</span>;
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
  return /\{accent\}[^{]*\{\/accent\}|\{color:#[0-9a-fA-F]{3,8}\}[^{]*\{\/color\}|\{b\}[^{]*\{\/b\}|\{i\}[^{]*\{\/i\}|\[[^\]]+\]\([^)]+\)|\{ul\}|\{ol\}/.test(
    input,
  );
}
