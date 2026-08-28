"use client";

/**
 * W1-L3 — optimistic inline-text repaint for the SERVER-RENDERED builder canvas.
 *
 * The defect: on the default (flag-off) freeform homepage the canvas is
 * server-rendered (`renderFreeformPageRootTree` in `homepage-cms-sections.tsx`,
 * NOT `<ClientBuilderCanvas>`). An inline text commit updates the in-memory
 * builder tree AND persists the draft, but nothing on the visible page reads
 * that live client tree — the server DOM only reconciles on the deferred
 * save-time `router.refresh()`. So the operator types, clicks away, and the
 * canvas keeps showing the OLD text (their edit appears to vanish) until a
 * refresh/reload lands. See edit-context `commitBuilderTreeMutation` /
 * `persistBuilderTree`: the eager per-commit refresh was removed by
 * builder-perf-2026, and `publishBuilderCanvasTree` is intentionally gated off
 * for the homepage-flag-off path.
 *
 * The fix: when NO client canvas is mounted for this surface (the only case
 * where the DOM won't repaint itself via the tree bridge), the inline editor
 * writes the committed value straight into the target element it already holds.
 * The element carries `suppressHydrationWarning` (see builder-node/render.tsx
 * heading/paragraph), so the later `router.refresh()` reconciles the identical
 * text without a hydration warning — this is a true optimistic update, not a
 * forced reload.
 *
 * `renderInlineRichHtml` tokenizes with the EXACT regexes the published React
 * renderer uses (`renderInlineRich`), re-exported from `sections/shared/rich-text`
 * so the two can never diverge. All text is HTML-escaped and only the fixed
 * safe tag set is emitted (accent/color/bold/italic/allowlisted-link), so the
 * innerHTML write carries no XSS surface an author string could exploit.
 */

import {
  ACCENT_RE,
  BOLD_RE,
  COLOR_RE,
  ITALIC_RE,
  LINK_RE,
  TOKEN_RE,
  isSafeRichTextHref,
} from "@/lib/site-admin/sections/shared/rich-text";
import { splitRichBlocks } from "@/lib/site-admin/sections/shared/rich-text-lists";

/** Escape a string for safe interpolation as HTML text / attribute content. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialize an inline rich-text marker string to the SAME HTML the published
 * `renderInlineRich` React path produces (same tags, same classes), fully
 * HTML-escaped. Used only for the optimistic canvas repaint; the authoritative
 * paint still comes from the React renderer on the next refresh.
 */
export function renderInlineRichHtml(input: string | null | undefined): string {
  if (!input) return "";
  const blocks = splitRichBlocks(input);
  const hasList = blocks.some((block) => block.kind === "ul" || block.kind === "ol");
  if (!hasList) return renderInlineTokenHtml(input);
  return blocks
    .map((block) => {
      if (block.kind === "text") return renderInlineTokenHtml(block.text);
      const inner = block.items
        .map((item) => `<li>${renderInlineTokenHtml(item)}</li>`)
        .join("");
      return `<${block.kind} class="site-rich-list">${inner}</${block.kind}>`;
    })
    .join("");
}

function renderInlineTokenHtml(input: string): string {
  if (!input) return "";
  const captured = new RegExp(`(${TOKEN_RE.source})`, "g");
  const parts = input.split(captured).filter((p) => p !== "");
  return parts
    .map((part) => {
      let m = part.match(ACCENT_RE);
      if (m) {
        return `<em class="site-accent" style="font-style:italic;font-weight:300">${escapeHtml(
          m[1],
        )}</em>`;
      }
      m = part.match(COLOR_RE);
      if (m) {
        // m[1] is `#[0-9a-fA-F]{3,8}` from the regex — safe to inline.
        return `<span class="site-color" style="color:${m[1]}">${escapeHtml(
          m[2],
        )}</span>`;
      }
      m = part.match(BOLD_RE);
      if (m) return `<strong>${escapeHtml(m[1])}</strong>`;
      m = part.match(ITALIC_RE);
      if (m) return `<em>${escapeHtml(m[1])}</em>`;
      m = part.match(LINK_RE);
      if (m) {
        const href = m[2].trim();
        if (isSafeRichTextHref(href)) {
          const isExternal = /^https?:\/\//i.test(href);
          const attrs = isExternal
            ? ` target="_blank" rel="noopener noreferrer"`
            : "";
          return `<a href="${escapeHtml(
            href,
          )}" class="site-link"${attrs}>${escapeHtml(m[1])}</a>`;
        }
        return `<span>${escapeHtml(m[1])}</span>`;
      }
      return `<span>${escapeHtml(part)}</span>`;
    })
    .join("");
}

/**
 * Optimistically paint the committed inline value into the target DOM element.
 *
 * `rich` (default) writes the rendered rich HTML (heading/paragraph/text and
 * other marker-aware props). `rich: false` writes plain text — used for
 * `section_embed` curated config values, whose island markup is owned by the
 * curated component and reconciles wholesale on the next refresh.
 *
 * The caller must only invoke this when no client canvas is mounted for the
 * surface (otherwise the tree bridge already repaints the React-owned node and
 * a manual write would fight React).
 */
export function applyOptimisticInlineRepaint(
  el: HTMLElement,
  value: string,
  opts?: { rich?: boolean },
): void {
  const rich = opts?.rich ?? true;
  const trimmed = value.trim();
  if (rich) {
    el.innerHTML = renderInlineRichHtml(trimmed);
  } else {
    el.textContent = trimmed;
  }
}
