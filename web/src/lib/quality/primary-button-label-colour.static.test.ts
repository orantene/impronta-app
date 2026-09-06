/**
 * A PRIMARY BUTTON'S LABEL COLOUR BELONGS TO THE ROLE, NOT TO THE TREE.
 *
 * Creative Direction ruling, 2026-09-05: the label colour of a primary button
 * is derived from the tenant's primary, never typed into the page design. A
 * literal colour on the label is a guess about a tenant the designer has never
 * seen: it is right for the brand it was authored against and wrong for every
 * other, and it cannot move when the operator changes their primary.
 *
 * WHY THIS IS A RATCHET AND NOT A BAN, YET
 * ────────────────────────────────────────
 * Sixteen literals exist today, and they cannot simply be deleted: the
 * renderer's own fallback for a primary button is
 * `color: var(--token-color-surface-raised, #fff)`, which is also a guess (a
 * pale primary with a light raised surface gives white-on-amber at 1.39:1, the
 * exact shape #1771 fixed for the shadcn button by projecting
 * `--token-color-primary-on` from `foregroundForPrimary()`). So the order is:
 * the renderer derives (Page Builder's engine), then these sixteen go, then
 * this file becomes a flat ban. Until then the number may only fall.
 *
 * `services.ts` is the model: both of its primary buttons carry no style at
 * all, so they take the role's colour already.
 *
 * HOW TO REACT WHEN THIS FAILS
 * ────────────────────────────
 *   • "+N" → you typed a colour onto a primary button's label. Remove it and
 *     let the role paint it, or, if the design truly needs a different pair,
 *     ask the Creative Director for a token rather than a hex.
 *   • "-N" → you removed one. Lower the count here in the same commit so the
 *     win is locked in.
 *   • A design at zero must not reappear in the table.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const DESIGNS_DIR = join(WEB_ROOT, "src/lib/site-admin/builder-node/page-designs");

/**
 * design id → primary buttons carrying a literal label colour, on
 * `origin/main` at 7a23f2da7. A design absent from this table must carry none.
 */
const BUDGET: Readonly<Record<string, number>> = {
  agency: 1,
  coach: 2,
  conference: 1,
  festival: 1,
  impronta: 1,
  noir: 2,
  restaurant: 1,
  "restaurant-orderable": 1,
  saas: 2,
  store: 2,
  studio: 2,
};

/**
 * Count the primary buttons in one design file whose own node carries a
 * `textColor`. The scan is bounded by the next `kind: "` marker, which is the
 * start of the next node: a node's own props end there, so a colour found
 * inside the window belongs to this button and not to a sibling.
 */
export function countLiteralPrimaryLabels(source: string): number {
  const marks = [...source.matchAll(/kind: "/g)].map((m) => m.index ?? 0);
  let hits = 0;
  for (const m of source.matchAll(/kind: "button",/g)) {
    const start = m.index ?? 0;
    const end = marks.find((p) => p > start) ?? source.length;
    const node = source.slice(start, end);
    if (node.includes('tone: "primary"') && node.includes("textColor:")) hits += 1;
  }
  return hits;
}

function actualCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of readdirSync(DESIGNS_DIR)) {
    if (!entry.endsWith(".ts") || entry.includes(".test.")) continue;
    const id = entry.slice(0, -3);
    const n = countLiteralPrimaryLabels(readFileSync(join(DESIGNS_DIR, entry), "utf8"));
    if (n > 0) out[id] = n;
  }
  return out;
}

test("no page design has gained a literal label colour on a primary button", () => {
  const actual = actualCounts();
  const drift: string[] = [];
  for (const [id, n] of Object.entries(actual)) {
    const budget = BUDGET[id] ?? 0;
    if (n > budget) {
      drift.push(
        `  ${id}: ${n} primary button(s) with a literal label colour, recorded ${budget} (+${n - budget}).\n` +
          `    A primary button's label colour comes from the role. Remove the colour and\n` +
          `    let the renderer paint it; if the design needs a different pair, ask the\n` +
          `    Creative Director for a token, never a hex. services.ts is the model.`,
      );
    }
  }
  assert.deepEqual(drift, [], drift.length === 0 ? "" : `\n\nLiteral primary-button label colours drifted:\n\n${drift.join("\n\n")}\n`);
});

test("every recorded literal is still there, so a removal is locked in", () => {
  const actual = actualCounts();
  const stale = Object.entries(BUDGET)
    .filter(([id, n]) => (actual[id] ?? 0) < n)
    .map(([id, n]) => `  ${id}: ${actual[id] ?? 0} now, recorded ${n}. Lower it here in this commit.`);
  assert.deepEqual(stale, [], stale.length === 0 ? "" : `\n\nLiterals were removed without re-recording:\n\n${stale.join("\n")}\n`);
});

test("the table measures real designs, and services stays the model", () => {
  const actual = actualCounts();
  assert.ok(Object.keys(BUDGET).length > 0, "the budget table is empty: the ratchet guards nothing");
  for (const id of Object.keys(BUDGET)) {
    assert.ok(
      readdirSync(DESIGNS_DIR).includes(`${id}.ts`),
      `${id} is in the table but no such design exists; the entry is stale`,
    );
  }
  assert.equal(actual.services ?? 0, 0, "services.ts grew a literal label colour; it is the model this rule points at");
});

// ── detector self-tests ────────────────────────────────────────────────────

test("BITES: a primary button carrying textColor is counted", () => {
  const src = `{ id: "a", kind: "button", props: { label: "Go", tone: "primary", style: { textColor: "#fff" } } }`;
  assert.equal(countLiteralPrimaryLabels(src), 1);
});

test("NOT COUNTED: a primary button with no style, the model", () => {
  const src = `{ id: "a", kind: "button", props: { label: "Book a time", href: "/book", tone: "primary" } }`;
  assert.equal(countLiteralPrimaryLabels(src), 0);
});

test("NOT COUNTED: a SECONDARY button may carry its own label colour", () => {
  // A secondary button paints its label from the primary, on a transparent
  // ground; an outline on a dark section legitimately names its own colour.
  const src = `{ id: "a", kind: "button", props: { tone: "secondary", style: { textColor: "#f4ece1" } } }`;
  assert.equal(countLiteralPrimaryLabels(src), 0);
});

test("NOT COUNTED: a colour on the NEXT node is not this button's", () => {
  const src =
    `{ id: "a", kind: "button", props: { label: "Go", tone: "primary" } },` +
    `{ id: "b", kind: "paragraph", props: { text: "hi", style: { textColor: "#111" } } }`;
  assert.equal(countLiteralPrimaryLabels(src), 0);
});

test("BITES: two primary buttons in one file count twice", () => {
  const one = `{ id: "a", kind: "button", props: { tone: "primary", style: { textColor: "#fff" } } },`;
  assert.equal(countLiteralPrimaryLabels(one + one), 2);
});
