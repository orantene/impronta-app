import { test } from "node:test";
import assert from "node:assert/strict";

import { splitSharedRows } from "./compare-table-split";
import type { CompareTableRow } from "./pricing-types";

const TIERS = ["free", "studio", "agency", "hub"];

function row(
  label: string,
  cells: Array<{ included: boolean; value?: string | null } | "missing">,
): CompareTableRow {
  return {
    label,
    category: "test",
    cells: cells.map((c, i) =>
      c === "missing"
        ? { tierSlug: TIERS[i], missing: true as const }
        : { tierSlug: TIERS[i], included: c.included, value: c.value ?? null },
    ),
  };
}

const on = { included: true };
const off = { included: false };

test("included everywhere with no value is shared", () => {
  const { comparison, shared } = splitSharedRows(
    [row("Structured inquiry inbox", [on, on, on, on])],
    TIERS,
  );
  assert.equal(shared.length, 1);
  assert.equal(shared[0].label, "Structured inquiry inbox");
  assert.deepEqual(comparison, []);
});

test("included everywhere but with DIFFERENT values stays in the comparison", () => {
  // People profiles is on every plan and is still the ladder: 5 / 15 /
  // unlimited is exactly what a customer is trying to read.
  const { comparison, shared } = splitSharedRows(
    [
      row("People profiles", [
        { included: true, value: "Up to 5" },
        { included: true, value: "Up to 15" },
        { included: true, value: "Unlimited" },
        { included: true, value: "Unlimited" },
      ]),
    ],
    TIERS,
  );
  assert.deepEqual(shared, []);
  assert.equal(comparison.length, 1);
});

test("included everywhere with the SAME value is shared", () => {
  const { shared } = splitSharedRows(
    [row("Data export", [
      { included: true, value: "CSV" },
      { included: true, value: "CSV" },
      { included: true, value: "CSV" },
      { included: true, value: "CSV" },
    ])],
    TIERS,
  );
  assert.equal(shared.length, 1);
});

test("withheld on any tier stays in the comparison", () => {
  const { comparison, shared } = splitSharedRows(
    [row("Custom domain", [off, off, on, on])],
    TIERS,
  );
  assert.deepEqual(shared, []);
  assert.equal(comparison.length, 1);
});

test("a MISSING cell is never treated as shared", () => {
  // Absence is not agreement. A row with no stored cell for a tier says
  // nothing about that tier, and promoting it to "every plan has this" is how
  // a table starts claiming more than the product does.
  const { comparison, shared } = splitSharedRows(
    [row("Half-entered feature", [on, on, "missing", on])],
    TIERS,
  );
  assert.deepEqual(shared, []);
  assert.equal(comparison.length, 1);
});

test("a row that does not cover every column is never shared", () => {
  const { shared } = splitSharedRows([row("Short row", [on, on])], TIERS);
  assert.deepEqual(shared, []);
});

test("the real shape: five differ, the rest are shared", () => {
  const rows = [
    row("Custom domain", [off, off, on, on]),
    row("Priority onboarding", [off, off, off, on]),
    row("People profiles", [
      { included: true, value: "Up to 5" },
      { included: true, value: "Up to 15" },
      { included: true, value: "Unlimited" },
      { included: true, value: "Unlimited" },
    ]),
    row("Email notifications", [on, on, on, on]),
    row("Versioned offers", [on, on, on, on]),
  ];
  const { comparison, shared } = splitSharedRows(rows, TIERS);
  assert.deepEqual(
    comparison.map((r) => r.label),
    ["Custom domain", "Priority onboarding", "People profiles"],
  );
  assert.deepEqual(
    shared.map((s) => s.label),
    ["Email notifications", "Versioned offers"],
  );
});
