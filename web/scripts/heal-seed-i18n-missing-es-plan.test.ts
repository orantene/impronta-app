import test from "node:test";
import assert from "node:assert/strict";

import {
  collectMissingLeaves,
  formatHealSummary,
  needsSeedEsOverlay,
  summarize,
} from "./heal-seed-i18n-missing-es-plan";

test("needsSeedEsOverlay: English seed yes, mode label no, Spanish no", () => {
  assert.equal(needsSeedEsOverlay("Recent work"), true);
  assert.equal(needsSeedEsOverlay("Book"), false);
  assert.equal(needsSeedEsOverlay("Trabajo reciente"), false);
  assert.equal(needsSeedEsOverlay("{{displayName}}"), false);
});

test("collectMissingLeaves finds English base without i18n.es", () => {
  const missing: ReturnType<typeof summarize>["missing"] = [];
  collectMissingLeaves(
    [
      {
        kind: "portfolio",
        props: { title: "Recent work", emptyMessage: "No photos in your portfolio yet." },
      },
      {
        kind: "heading",
        props: {
          text: "About",
          i18n: { es: { text: "Sobre mí" }, en: { text: "About" } },
        },
      },
    ],
    { treeId: "t1", profileId: "p1", treeName: "home" },
    missing,
  );
  const inv = summarize(missing);
  assert.equal(inv.trees, 1);
  assert.equal(inv.profiles, 1);
  assert.equal(inv.leaves, 2);
  assert.ok(missing.some((m) => m.key === "title" && m.base === "Recent work"));
  assert.ok(missing.some((m) => m.key === "emptyMessage"));
  assert.ok(!missing.some((m) => m.base === "About"));
});

test("formatHealSummary points at copy release", () => {
  const text = formatHealSummary({ trees: 127, profiles: 43, leaves: 760, missing: [] }, "2026-10-08");
  assert.ok(text.includes("127"));
  assert.ok(text.includes("qa:release-theme-i18n"));
  assert.ok(text.includes("Do not silent-migrate"));
});
