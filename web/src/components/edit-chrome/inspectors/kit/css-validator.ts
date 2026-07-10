/**
 * css-validator — lightweight CSS parse/error-hint utility.
 *
 * Advisory-only: surfaces syntax problems (unbalanced braces, known bad
 * at-rules, empty input) inline inside the Custom CSS editor. Does NOT
 * execute author CSS against the live editor DOM (XSS / style-bleed risk).
 * Instead, it uses a detached, never-adopted CSSStyleSheet for rule
 * insertion validation in environments that support it, falling back to
 * a pure-string heuristic where that API is unavailable (SSR, old Safari).
 *
 * Error hints are advisory — the editor never blocks saving on CSS errors.
 * Operators can ignore them; broken CSS simply has no effect.
 *
 * Exported from the kit barrel as `validateCss` + `CssError`.
 */

export interface CssError {
  /** Short human-readable error message, e.g. "Unbalanced braces". */
  message: string;
  /**
   * Advisory severity — "error" for definite syntax problems,
   * "warning" for style-quality or a11y notes.
   */
  severity: "error" | "warning";
}

/**
 * Validate a raw CSS string and return an array of advisory errors.
 * Empty array = no detected problems.
 *
 * This deliberately uses heuristics + a sandboxed CSSStyleSheet rather
 * than a full parser, to keep the bundle zero-weight. The cost is false
 * negatives (some bad CSS passes through undetected) — that is fine because
 * the validator is advisory only; the renderer's scoper is the real guard.
 */
export function validateCss(css: string): CssError[] {
  const trimmed = css.trim();
  if (!trimmed) {
    return [{ message: "No CSS, editor is empty.", severity: "warning" }];
  }

  const errors: CssError[] = [];

  // ── Brace balance ────────────────────────────────────────────────────────
  // Strip string literals and comments to avoid false positives from
  // braces inside quotes / comment blocks.
  const stripped = stripStringsAndComments(trimmed);
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) break;
    }
  }
  if (depth !== 0) {
    errors.push({
      message:
        depth > 0
          ? `Unbalanced braces: ${depth} opening brace${depth === 1 ? "" : "s"} without a closing "}"`.trim()
          : `Unbalanced braces: extra "}" found.`,
      severity: "error",
    });
  }

  // ── Unknown / dangerous at-rules ────────────────────────────────────────
  // Block @import (scope-breaking, silently no-ops in scoped context) and
  // @charset (invalid in embedded <style>). Other at-rules (media, layer,
  // supports, keyframes, font-face, container) are fine.
  const atMatches = stripped.match(/@[-\w]+/g) ?? [];
  const BLOCKED_AT: Record<string, string> = {
    "@import": "@import is not supported in scoped CSS, it will be ignored.",
    "@charset": "@charset is not valid inside an embedded style block.",
    "@namespace": "@namespace is not useful in scoped CSS.",
  };
  for (const at of atMatches) {
    const lower = at.toLowerCase();
    if (BLOCKED_AT[lower]) {
      errors.push({ message: BLOCKED_AT[lower], severity: "error" });
    }
  }

  // ── Sandboxed CSSStyleSheet insertion check ──────────────────────────────
  // Only attempt when the CSS contains at least one rule block (has a "{"
  // pair) so we don't send bare comments or empty strings to insertRule.
  // This catches property typos and value errors browsers report as
  // SyntaxErrors (e.g. "color:;;"). We wrap each top-level block.
  if (depth === 0 && trimmed.includes("{") && typeof document !== "undefined") {
    const sandboxErrors = trySandboxValidation(trimmed);
    for (const e of sandboxErrors) errors.push(e);
  }

  return errors;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip CSS comments (`/* ... *\/`) and string literals (`"…"` / `'…'`)
 * to avoid false-positive brace counts inside them.
 */
function stripStringsAndComments(css: string): string {
  let result = "";
  let i = 0;
  while (i < css.length) {
    // Block comment
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    // String literals (double or single quote — skip until unescaped close)
    if (css[i] === '"' || css[i] === "'") {
      const q = css[i];
      i++;
      while (i < css.length) {
        if (css[i] === "\\" && i + 1 < css.length) { i += 2; continue; }
        if (css[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    result += css[i];
    i++;
  }
  return result;
}

/** Detached CSSStyleSheet used as a one-shot validation sandbox. */
let sandboxSheet: CSSStyleSheet | null = null;

function getSandboxSheet(): CSSStyleSheet | null {
  if (sandboxSheet) return sandboxSheet;
  try {
    const sheet = new CSSStyleSheet();
    // Detached — never adopted by any document, so nothing can apply to DOM.
    sandboxSheet = sheet;
    return sheet;
  } catch {
    return null;
  }
}

/**
 * Attempt to insert the CSS into a sandboxed, never-adopted CSSStyleSheet.
 * Returns an advisory error if the browser rejects it outright.
 *
 * We wrap the whole block in a `:scope {}` envelope so bare property
 * declarations still parse as a rule block.
 */
function trySandboxValidation(css: string): CssError[] {
  const sheet = getSandboxSheet();
  if (!sheet) return [];

  // Count existing rules so we can remove what we insert.
  const startLen = sheet.cssRules.length;

  // Wrap in a scope so browsers accept bare declaration blocks.
  // We namespace with a data attr that will never match anything real.
  const wrapped = `[data-css-validator-sandbox] { ${css} }`;

  try {
    // insertRule throws a DOMException on invalid syntax — that's our signal.
    sheet.insertRule(wrapped, startLen);
    // Clean up.
    try { sheet.deleteRule(startLen); } catch { /* ignore */ }
    return [];
  } catch (err) {
    // Clean up just in case the rule partially inserted.
    try { if (sheet.cssRules.length > startLen) sheet.deleteRule(startLen); } catch { /* ignore */ }
    const msg =
      err instanceof Error ? err.message : "CSS syntax error detected.";
    // Truncate long browser messages.
    const short = msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
    return [{ message: `CSS error: ${short}`, severity: "error" }];
  }
}
