import { test } from "node:test";
import assert from "node:assert/strict";

import { scoreGeneratedTree, evaluateExpectations } from "./eval-scorecard";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

// Minimal hand-authored trees (no model). ids are unique + stable.
function section(id: string, children: BuilderNode[]): BuilderNode {
  return { id, kind: "section", props: { sectionTypeKey: "custom", label: id }, children } as unknown as BuilderNode;
}
function heading(id: string, text: string, level: number): BuilderNode {
  return { id, kind: "heading", props: { text, level } } as unknown as BuilderNode;
}
function paragraph(id: string, text: string, style?: Record<string, unknown>): BuilderNode {
  return { id, kind: "paragraph", props: { text, ...(style ? { style } : {}) } } as unknown as BuilderNode;
}
function button(id: string, label: string): BuilderNode {
  return { id, kind: "button", props: { label, href: "/inquire", tone: "primary" } } as unknown as BuilderNode;
}

const CLEAN: BuilderNodeTree = [
  section("hero", [heading("h1", "Faces that move culture", 1), paragraph("p1", "A boutique roster booked by brands.")]),
  section("svc", [heading("h2", "What we do", 2), button("b1", "Book a model")]),
];

test("a clean tree scores 100 with no findings", () => {
  const card = scoreGeneratedTree(CLEAN);
  assert.equal(card.findings.length, 0, JSON.stringify(card.findings));
  assert.equal(card.score, 100);
});

test("an em dash in copy is an error finding + fails noEmDash", () => {
  const tree: BuilderNodeTree = [section("hero", [heading("h1", "Faces — that move", 1)])];
  const card = scoreGeneratedTree(tree);
  assert.ok(card.findings.some((f) => f.code === "em_dash"));
  assert.ok(card.score < 100);
  const graded = evaluateExpectations(tree, { minSections: 1, kindsPresent: [], maxNodes: 50, singleH1: false, noEmDash: true });
  assert.equal(graded.pass, false);
  assert.ok(graded.failures.includes("noEmDash violated"));
});

test("two level:1 headings → multiple_h1 warn", () => {
  const tree: BuilderNodeTree = [
    section("a", [heading("h1a", "One", 1)]),
    section("b", [heading("h1b", "Two", 1)]),
  ];
  const card = scoreGeneratedTree(tree);
  assert.ok(card.findings.some((f) => f.code === "multiple_h1"));
});

test("a 'Learn more' button → generic_cta warn", () => {
  const tree: BuilderNodeTree = [section("hero", [heading("h1", "Hi", 1), button("b", "Learn more")])];
  const card = scoreGeneratedTree(tree);
  assert.ok(card.findings.some((f) => f.code === "generic_cta"));
});

test("banned commerce vocab → banned_vocab error", () => {
  const tree: BuilderNodeTree = [section("hero", [heading("h1", "Hi", 1), paragraph("p", "Add to cart to buy talent.")])];
  const card = scoreGeneratedTree(tree);
  assert.ok(card.findings.some((f) => f.code === "banned_vocab"));
});

test("a lone text color → lone_color warn", () => {
  const tree: BuilderNodeTree = [section("hero", [heading("h1", "Hi", 1), paragraph("p", "Body", { textColor: "#ffffff" })])];
  const card = scoreGeneratedTree(tree);
  assert.ok(card.findings.some((f) => f.code === "lone_color"));
});

test("a low-contrast literal band → band_low_contrast warn", () => {
  const tree: BuilderNodeTree = [section("hero", [heading("h1", "Hi", 1), paragraph("p", "Body", { backgroundColor: "#eeeeee", textColor: "#f0f0f0" })])];
  const card = scoreGeneratedTree(tree);
  assert.ok(card.findings.some((f) => f.code === "band_low_contrast"));
});

test("a theme-token band (var()) is NOT graded for contrast", () => {
  const tree: BuilderNodeTree = [section("hero", [heading("h1", "Hi", 1), paragraph("p", "Body", { backgroundColor: "var(--token-color-primary)", textColor: "var(--token-color-surface-raised)" })])];
  const card = scoreGeneratedTree(tree);
  assert.ok(!card.findings.some((f) => f.code === "band_low_contrast"), "var() colors are skipped");
});

test("evaluateExpectations flags too-few sections + missing kind", () => {
  const graded = evaluateExpectations(CLEAN, { minSections: 4, kindsPresent: ["pricing_table"], maxNodes: 50, singleH1: true, noEmDash: true });
  assert.equal(graded.pass, false);
  assert.ok(graded.failures.some((f) => f.startsWith("sections 2 < 4")));
  assert.ok(graded.failures.includes("missing kind pricing_table"));
});
