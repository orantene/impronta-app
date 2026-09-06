import assert from "node:assert/strict";
import { test } from "node:test";

import { PAGE_DESIGNS } from "./page-designs";
import { isStyleTokenRef } from "./style-token-bindings";
import type { BuilderNode } from "./types";

/**
 * A CONTRAST BOMB: a token-backed background paired with a literal text colour.
 *
 * THE DEFECT THIS PREVENTS, WHICH SHIPPED
 * ───────────────────────────────────────
 * Two published Lab templates carried buttons with
 * `backgroundColor: "token:color.primary"` and a LITERAL
 * `textColor: "#1a1407"` — ink authored for Impronta's gold primary. Under the
 * registry-default primary `#111111` that measures 1.03:1. `render.tsx` lets an
 * explicit literal win over the paired-foreground role, correctly, so no
 * amount of fixing the pairing token reaches it.
 *
 * The pairing is the whole point of a token ground: the background follows the
 * tenant, and a literal ink does not follow it anywhere. The two cannot both be
 * right, and the literal is the one that is wrong — it was authored against one
 * tenant's palette and inherited by every other.
 *
 * WHAT IT ASSERTS AND WHY THAT SHAPE
 * ──────────────────────────────────
 * Only the PAIRING is a failure: a literal background with a literal ink is a
 * deliberate fixed-colour block and stays legal, and a token ground with a
 * token ink is the correct form. Asserting the pair rather than banning
 * literals keeps the guard on the defect instead of on a style choice.
 *
 * Covers the code-authored designs. The DB-side templates are the same class
 * and are checked by the Lab's save path.
 */

const COLOUR_LITERAL = /^(#|rgb|hsl|color\()/i;

/**
 * A style value that paints a fixed colour regardless of the tenant.
 *
 * `isStyleTokenRef` is declared `value is string`, so NEGATING it inside a
 * narrowed chain collapses `string` to `never` and the next `.trim()` does not
 * typecheck. The predicate means "is a token reference"; its type signature says
 * "is a string". Reading its result into a plain boolean discards the narrowing
 * and keeps the intent — that is the fix, not a cast.
 */
function isColourLiteral(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const isTokenRef: boolean = isStyleTokenRef(trimmed);
  if (isTokenRef) return false;
  return COLOUR_LITERAL.test(trimmed);
}

function walk(nodes: readonly BuilderNode[], visit: (n: BuilderNode) => void): void {
  for (const node of nodes) {
    visit(node);
    const kids = (node as { children?: readonly BuilderNode[] }).children;
    if (Array.isArray(kids)) walk(kids, visit);
  }
}

test("no design pairs a TOKEN background with a LITERAL text colour", () => {
  const bombs: string[] = [];

  for (const design of PAGE_DESIGNS) {
    walk(design.tree as readonly BuilderNode[], (node) => {
      const style = (node.props as { style?: Record<string, unknown> } | undefined)
        ?.style;
      if (!style) return;
      const bg = style.backgroundColor;
      const ink = style.textColor;
      if (isStyleTokenRef(bg as string) && isColourLiteral(ink)) {
        bombs.push(
          `${design.id} / ${node.id}: backgroundColor ${String(bg)} + textColor ${String(ink)}`,
        );
      }
    });
  }

  assert.deepEqual(
    bombs,
    [],
    "A token-backed background is paired with a literal text colour. The " +
      "background follows the tenant's palette and the ink does not, so the " +
      "pair is only readable for whichever tenant it was authored against — " +
      "this shipped as 1.03:1 on a live button. Bind the ink to the pairing " +
      "token (`token:color.primary-on`) or make the background a literal too.\n  " +
      bombs.join("\n  "),
  );
});

test("the guard distinguishes the three cases, so it cannot fire on correct code", () => {
  // Anti-vacuity AND anti-overreach: a guard that flagged every literal would
  // be deleted the first time someone shipped a deliberate fixed-colour block.
  assert.equal(isColourLiteral("#1a1407"), true, "a hex ink is a literal");
  assert.equal(isColourLiteral("rgb(1,2,3)"), true, "rgb is a literal");
  assert.equal(isColourLiteral("token:color.primary-on"), false, "a token ref is not");
  assert.equal(isColourLiteral(""), false, "empty is not a colour");
  assert.equal(isColourLiteral(undefined), false, "absent is not a colour");
  assert.equal(isStyleTokenRef("token:color.primary"), true);
  assert.equal(isStyleTokenRef("#111111"), false);
});
