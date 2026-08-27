import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { translatableTextOf } from "./translatable-text";
import type { BuilderNode } from "./types";

/**
 * THE BACKSTOP for the one thing in the i18n stack that can silently rot.
 *
 * `translatableTextOf` decides what is translatable, and the renderer, the
 * fold, the Translations panel and the inspector all follow it. Its nested part
 * is an ALLOWLIST of text keys — so a component shipping copy under a key
 * nobody added is invisible to every one of those at once, with nothing failing.
 *
 * That is not hypothetical: scanning real pages found 15 such strings live —
 * "Contact Us", "Send inquiry", "Thanks! We've received your inquiry…", the
 * consent line, the roster empty-state. They were unauditable and
 * untranslatable, and no test noticed.
 *
 * So this test does not check the list against itself. It scans REAL nodes for
 * anything that LOOKS like visitor copy and fails when the definition cannot
 * reach it. Independent of the thing it verifies — which is the property the
 * original migration's "0 unmatched" audit lacked.
 *
 * Fixtures: one representative node per (kind + prop-key signature) across the
 * whole site. Refresh them when new component shapes ship.
 */
const NODES = JSON.parse(
  readFileSync(new URL("./__fixtures__/site-nodes.json", import.meta.url), "utf8"),
) as BuilderNode[];

/** Keys that hold identifiers, not copy — the same resource in every language. */
const NOT_COPY_KEY =
  /^(href|src|id|sectionId|className|class|url|slug|code|key|name|type|kind|icon|value|action|target|rel|format|token|color|font|align|variant|preset|layerLabel)$/i;

const NOT_COPY_VALUE = /^(https?:|\/|#|[\d\s.,:%+-]*$)/;

/** Two or more real words — excludes numerals, symbols and single tokens. */
function looksLikeVisitorCopy(value: string): boolean {
  const text = value.trim();
  if (text.length < 4 || text.length > 400) return false;
  if (NOT_COPY_VALUE.test(text)) return false;
  return /\p{L}{2,}(\s+\p{L}{2,})+/u.test(text);
}

function copyPathsIn(node: BuilderNode): Array<{ path: string; value: string }> {
  const found: Array<{ path: string; value: string }> = [];
  const visit = (value: unknown, trail: string, depth: number): void => {
    if (depth > 6 || value == null) return;
    if (typeof value === "string") {
      const key = trail.split(".").pop() ?? "";
      if (!NOT_COPY_KEY.test(key) && looksLikeVisitorCopy(value)) {
        found.push({ path: trail, value });
      }
      return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${trail}.${i}`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "i18n" || key === "style") continue; // overlay + design tokens
      visit(child, trail ? `${trail}.${key}` : key, depth + 1);
    }
  };
  visit((node as { props?: unknown }).props ?? {}, "", 0);
  return found;
}

test("every copy-looking string on a real page is translatable", () => {
  const missed: string[] = [];
  let covered = 0;
  for (const node of NODES) {
    const known = new Set(translatableTextOf(node).map((entry) => entry.prop));
    for (const { path, value } of copyPathsIn(node)) {
      if (known.has(path)) {
        covered++;
        continue;
      }
      missed.push(
        `${(node as { kind?: string }).kind}  ${path}  ${JSON.stringify(value).slice(0, 60)}`,
      );
    }
  }
  assert.ok(covered > 0, "fixtures must actually contain copy");
  assert.deepEqual(
    missed,
    [],
    `Visitor copy that NO tool can see — not the editor, not the Translations ` +
      `panel, not the fold.\nAdd the leaf key to NESTED_TEXT_KEYS in ` +
      `translatable-text.ts (nested), or to TEXT_PROP_NAMES *and* ` +
      `builder-i18n-props (top-level — the renderer needs the registry entry or ` +
      `the translation stores and never renders).\n\n` +
      missed.join("\n"),
  );
});
