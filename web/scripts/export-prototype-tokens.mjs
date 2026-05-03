#!/usr/bin/env node
/**
 * WS-0.10 — Export prototype design tokens to JSON.
 *
 * Reads COLORS / RADIUS / SPACE / FONTS from `_state.tsx` and emits a
 * Style-Dictionary-compatible JSON file. The Figma plugin (or any
 * downstream tool) consumes this to keep Figma in sync with code.
 *
 * Run:    npm run export:tokens
 * Output: web/docs/admin-prototype/tokens.json
 *
 * Implementation: regex-extracts each `export const NAME = { ... }`
 * block. We don't import the TypeScript module directly because that
 * would require a TS toolchain in Node — keeps the script
 * dependency-free.
 *
 * If the regex parse misses a token (e.g. ad-hoc shape change in
 * `_state.tsx`), the script logs a warning and exits non-zero so CI
 * can flag drift.
 *
 * 2026-05-02 — output moved from `prototypes/admin-shell/tokens.json`
 * to `docs/admin-prototype/tokens.json` as part of the docs
 * consolidation. The token export is part of the design-system
 * handoff package, not a runtime artifact.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(
  __dirname,
  "..",
  "src",
  "app",
  "prototypes",
  "admin-shell",
  "_state.tsx",
);
const OUT_FILE = join(
  __dirname,
  "..",
  "docs",
  "admin-prototype",
  "tokens.json",
);

const source = readFileSync(STATE_FILE, "utf8");

/**
 * Extracts the body of `export const NAME = { ... }` (object literal).
 * Returns the raw inner-text or null if not found.
 */
function extractObjectLiteral(name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*\\{`, "m");
  const m = re.exec(source);
  if (!m) return null;
  // Walk braces to find the matching close.
  let depth = 1;
  let i = m.index + m[0].length;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (depth === 0) return source.slice(m.index + m[0].length, i);
    i++;
  }
  return null;
}

/**
 * Naive parser for { key: value, key: value } where values are
 * strings, numbers, or simple template literals. Drops comments.
 * Good enough for our token shapes; not a full JS parser.
 */
function parseFlatObject(body) {
  if (!body) return {};
  // Strip line + block comments.
  const stripped = body
    .replace(/\/\/[^\n]*\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const out = {};
  // Match `key: "value"` / `key: 'value'` / `key: 12` / `key: "..."` (with commas/newlines)
  const entryRe =
    /([A-Za-z_$][\w$]*)\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|([0-9.]+))\s*,?/g;
  let match;
  while ((match = entryRe.exec(stripped)) !== null) {
    const key = match[1];
    const strVal = match[2] ?? match[3] ?? match[4];
    const numVal = match[5];
    if (strVal !== undefined) out[key] = strVal;
    else if (numVal !== undefined) out[key] = Number(numVal);
  }
  return out;
}

const tokens = {
  $schema: "https://schemas.tulala.io/design-tokens-v1.json",
  exportedAt: new Date().toISOString(),
  source: "web/src/app/prototypes/admin-shell/_state.tsx",
  colors: parseFlatObject(extractObjectLiteral("COLORS")),
  radius: parseFlatObject(extractObjectLiteral("RADIUS")),
  space: parseFlatObject(extractObjectLiteral("SPACE")),
  z: parseFlatObject(extractObjectLiteral("Z")),
  fonts: parseFlatObject(extractObjectLiteral("FONTS")),
};

const missing = [];
for (const k of ["colors", "radius", "fonts"]) {
  if (!tokens[k] || Object.keys(tokens[k]).length === 0) missing.push(k);
}
if (missing.length > 0) {
  console.error(
    `[export-prototype-tokens] WARNING — failed to extract: ${missing.join(", ")}.\n` +
      "Check that _state.tsx still exports these as object literals.",
  );
  process.exitCode = 1;
}

writeFileSync(OUT_FILE, JSON.stringify(tokens, null, 2) + "\n");
console.log(
  `[export-prototype-tokens] Wrote ${OUT_FILE} ` +
    `(${Object.keys(tokens.colors).length} colors, ` +
    `${Object.keys(tokens.radius).length} radii, ` +
    `${Object.keys(tokens.fonts).length} fonts).`,
);
