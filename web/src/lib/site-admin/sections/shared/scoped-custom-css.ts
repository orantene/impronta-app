/**
 * ── Hardened CSS scoper (security fix) ──────────────────────────────────────
 *
 * Author-supplied custom CSS (per-section `presentation.customCss`, per-node
 * `style.customCss`) is wrapped in a scope selector so it can only affect its
 * own section/node:
 *
 *   <scope> { <author CSS> }
 *
 * The OLD implementation interpolated the author CSS directly inside that one
 * brace pair and only string-stripped `</style>`/`<script>`. That left a
 * trivial SCOPE-ESCAPE: an author could write a stray `}` to close the scope
 * block early and then emit page-global rules, e.g.
 *
 *   } body { display: none } .x {
 *
 * which the browser parsed as `<scope> {}` + `body { display:none }` +
 * `<scope> .x {…}` — defeating the scope entirely.
 *
 * `scopeCustomCss` closes that hole with a real, brace-depth-aware parser: it
 * never relies on a single literal `{ … }` wrapper. Instead it walks the CSS,
 * tracking brace depth + string/comment context, splits it into top-level
 * statements (rule blocks and at-rules), and PREFIXES each top-level style
 * rule's selector list with the scope selector. A bare top-level `}` (the
 * escape primitive) has no matching `{` at depth 0, so it is simply dropped —
 * it can never terminate the scope, because the scope is reconstructed
 * statement-by-statement rather than wrapped around the raw text. Nested at-rules
 * (`@media`, `@supports`, `@container`) have their INNER rules scoped; rule-less
 * at-rules (`@keyframes`, `@font-face`, …) pass through unscoped (they have no
 * selector to attack the page with).
 *
 * The result GUARANTEES the author CSS cannot emit a declaration or rule outside
 * `<scope>`. The `</style>`/`<script>` strip is kept as belt-and-suspenders.
 */

/** Strip tag-break attempts (kept from the original, applied before parsing). */
function stripTagBreaks(css: string): string {
  return css
    .replace(/<\/style>/gi, "")
    .replace(/<script/gi, "")
    .replace(/<\/script>/gi, "");
}

/**
 * One top-level CSS statement. A statement is either a block
 * (`selector { … }`, balanced braces) or a bare declaration list / stray token
 * ending at a top-level `;`.
 */
interface CssStatement {
  /** Text before the first top-level `{` (a selector list, or an at-rule prelude). */
  prelude: string;
  /** Body between the matching braces, or null when the statement had no block. */
  block: string | null;
}

/**
 * Split a CSS string into top-level statements. Brace depth, single/double
 * quotes, and `/* … *\/` comments are tracked so a `}`/`{`/`;` inside any of
 * those does NOT split. A stray top-level `}` with no open block is discarded
 * (the scope-escape primitive).
 */
function splitTopLevelStatements(css: string): CssStatement[] {
  const statements: CssStatement[] = [];
  let prelude = "";
  let i = 0;
  const n = css.length;
  while (i < n) {
    const ch = css[i];
    // Skip comments wholesale (so a `}` or `{` inside one can't confuse us).
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === "{") {
      // Found a block opener at top level — consume its balanced body.
      let depth = 1;
      let j = i + 1;
      let body = "";
      while (j < n && depth > 0) {
        const c = css[j];
        if (c === "/" && css[j + 1] === "*") {
          const end = css.indexOf("*/", j + 2);
          const stop = end === -1 ? n : end + 2;
          body += css.slice(j, stop);
          j = stop;
          continue;
        }
        if (c === '"' || c === "'") {
          // Consume the string literal verbatim (handles escaped quotes).
          let k = j + 1;
          while (k < n) {
            if (css[k] === "\\") {
              k += 2;
              continue;
            }
            if (css[k] === c) break;
            k += 1;
          }
          body += css.slice(j, k + 1);
          j = k + 1;
          continue;
        }
        if (c === "{") depth += 1;
        else if (c === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        body += c;
        j += 1;
      }
      statements.push({ prelude: prelude.trim(), block: body });
      prelude = "";
      i = j + 1; // skip past the closing `}`
      continue;
    }
    if (ch === "}") {
      // A stray top-level `}` — the scope-escape primitive. Discard it AND any
      // declaration text accumulated before it (a declaration list with no
      // selector can't be safely re-scoped, and keeping it would re-open the
      // exact leak). prelude resets to nothing.
      prelude = "";
      i += 1;
      continue;
    }
    if (ch === ";") {
      // A top-level `;` ends a block-less statement (e.g. a bare `@import`).
      const stmt = prelude.trim();
      if (stmt) statements.push({ prelude: stmt, block: null });
      prelude = "";
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // Consume a string literal in the prelude verbatim.
      let k = i + 1;
      while (k < n) {
        if (css[k] === "\\") {
          k += 2;
          continue;
        }
        if (css[k] === ch) break;
        k += 1;
      }
      prelude += css.slice(i, k + 1);
      i = k + 1;
      continue;
    }
    prelude += ch;
    i += 1;
  }
  // Trailing block-less text (no terminating `;`/`{`) — e.g. a half-typed rule.
  // It has no selector→block pairing, so it can't form a declaration that
  // escapes the scope; drop it rather than guess.
  return statements;
}

/** At-rules that wrap nested rules whose inner rules must themselves be scoped. */
const NESTING_AT_RULES = /^@(media|supports|container|layer|scope)\b/i;
/** At-rules whose block is NOT a rule list (no selector to weaponize). */
const RULELESS_AT_RULES =
  /^@(keyframes|-webkit-keyframes|font-face|page|property|counter-style|font-feature-values)\b/i;

/**
 * Rebuild one top-level statement with the scope prefix applied. Style rules get
 * every selector in their (comma-separated) list prefixed with `<scope> `.
 * Nesting at-rules recurse so their inner rules are scoped. Rule-less at-rules
 * pass through unchanged. A block-less statement that is a bare at-rule
 * (`@import`, `@charset`, …) is dropped — those reach outside the scope by
 * design and have no place in section/node custom CSS.
 */
function scopeStatement(scope: string, stmt: CssStatement): string {
  const prelude = stmt.prelude;
  if (stmt.block === null) {
    // Block-less: only safe, scope-irrelevant — drop bare at-rules entirely.
    return "";
  }
  const block = stmt.block.trim();
  if (prelude.startsWith("@")) {
    if (NESTING_AT_RULES.test(prelude)) {
      const inner = scopeCssBody(scope, block);
      return `${prelude} { ${inner} }`;
    }
    if (RULELESS_AT_RULES.test(prelude)) {
      return `${prelude} { ${block} }`;
    }
    // Unknown at-rule with a block — scope its inner rules defensively.
    const inner = scopeCssBody(scope, block);
    return `${prelude} { ${inner} }`;
  }
  if (!prelude) {
    // A `{ … }` with no selector — scope it so its declarations apply to the
    // scope root rather than leaking (a `{ color:red }` would otherwise be a
    // parse error the browser might recover from unpredictably).
    return `${scope} { ${block} }`;
  }
  // Prefix every selector in the comma list with the scope.
  const scopedSelectors = prelude
    .split(",")
    .map((sel) => sel.trim())
    .filter(Boolean)
    .map((sel) => `${scope} ${sel}`)
    .join(", ");
  return `${scopedSelectors} { ${block} }`;
}

/** Scope a CSS body (the inside of a scope, or of a nesting at-rule). */
function scopeCssBody(scope: string, css: string): string {
  return splitTopLevelStatements(css)
    .map((stmt) => scopeStatement(scope, stmt))
    .filter(Boolean)
    .join(" ");
}

/**
 * Public scoper: take a CSS scope selector and author CSS, and return CSS in
 * which EVERY rule is provably confined to `scope`. Returns null when the CSS
 * is empty or scopes to nothing. Strips `</style>`/`<script>` first.
 */
export function scopeCustomCss(scope: string, rawCss: string): string | null {
  const css = stripTagBreaks(rawCss).trim();
  if (!css) return null;
  const scoped = scopeCssBody(scope, css).trim();
  return scoped || null;
}

/**
 * Render a builder NODE's `customCss` escape hatch as scope-confined CSS keyed
 * to the node's `[data-builder-node-id="<id>"]` attribute. Same hardened scoper
 * as sections. Returns null when empty.
 */
export function nodeScopedCss(
  nodeId: string,
  customCss?: string,
): string | null {
  const css = customCss?.trim();
  if (!css) return null;
  return scopeCustomCss(`[data-builder-node-id="${nodeId}"]`, css);
}
