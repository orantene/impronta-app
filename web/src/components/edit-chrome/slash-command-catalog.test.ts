import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSlashCommandEntries,
  filterSlashCommandEntries,
  fuzzyScore,
} from "./slash-command-catalog";
import type { BuilderComponentRow } from "@/lib/site-admin/edit-mode/builder-components-action";

test("buildSlashCommandEntries includes only allowed element kinds", () => {
  const entries = buildSlashCommandEntries({
    allowedKinds: ["heading", "paragraph", "image"],
  });
  const kinds = entries
    .filter((e) => e.pickKind === "element")
    .map((e) => (e.pickKind === "element" ? e.elementKind : null));
  assert.deepEqual(new Set(kinds), new Set(["heading", "paragraph", "image"]));
});

test("buildSlashCommandEntries drops section_embed from the generic element list", () => {
  const entries = buildSlashCommandEntries({
    allowedKinds: ["heading", "section_embed"],
  });
  assert.equal(
    entries.some((e) => e.pickKind === "element" && e.elementKind === "section_embed"),
    false,
  );
});

test("buildSlashCommandEntries surfaces section embeds only when requested", () => {
  const without = buildSlashCommandEntries({ allowedKinds: ["heading"] });
  assert.equal(without.some((e) => e.pickKind === "sectionEmbed"), false);

  const withEmbeds = buildSlashCommandEntries({
    allowedKinds: ["heading"],
    includeSectionEmbeds: true,
  });
  assert.ok(withEmbeds.some((e) => e.pickKind === "sectionEmbed"));
});

test("buildSlashCommandEntries includes saved blocks by name", () => {
  const block: BuilderComponentRow = {
    id: "b1",
    name: "Pricing card",
    description: null,
    rootKind: "card",
    subtree: { id: "n1", kind: "card", props: {} } as unknown as BuilderComponentRow["subtree"],
    nodeCount: 1,
    visibility: "private",
    createdAt: new Date().toISOString(),
    ownTenant: true,
  };
  const entries = buildSlashCommandEntries({
    allowedKinds: [],
    savedBlocks: [block],
  });
  const saved = entries.find((e) => e.pickKind === "savedBlock");
  assert.ok(saved);
  assert.equal(saved!.label, "Pricing card");
});

test("fuzzyScore matches in-order non-contiguous characters", () => {
  assert.ok(fuzzyScore("gal", "Gallery") !== null);
  assert.ok(fuzzyScore("gly", "Gallery") !== null);
});

test("fuzzyScore rejects out-of-order or missing characters", () => {
  assert.equal(fuzzyScore("xyz", "Gallery"), null);
  assert.equal(fuzzyScore("ylag", "Gallery"), null);
});

test("fuzzyScore ranks prefix matches above scattered matches", () => {
  const prefix = fuzzyScore("gal", "Gallery");
  const scattered = fuzzyScore("gal", "Gigantic Alligator List");
  assert.ok(prefix !== null && scattered !== null);
  assert.ok(prefix! > scattered!);
});

test("filterSlashCommandEntries filters by query against label or keywords", () => {
  const entries = buildSlashCommandEntries({
    allowedKinds: ["heading", "paragraph", "image", "video"],
  });
  const results = filterSlashCommandEntries(entries, "vid");
  assert.ok(results.some((e) => e.pickKind === "element" && e.elementKind === "video"));
  assert.equal(
    results.some((e) => e.pickKind === "element" && e.elementKind === "heading"),
    false,
  );
});

test("filterSlashCommandEntries returns the full (capped) catalog for an empty query", () => {
  const entries = buildSlashCommandEntries({
    allowedKinds: ["heading", "paragraph", "image"],
  });
  const results = filterSlashCommandEntries(entries, "");
  assert.ok(results.length > 0);
  assert.ok(results.length <= entries.length);
});

test("filterSlashCommandEntries caps at the given limit", () => {
  const entries = buildSlashCommandEntries({
    allowedKinds: [
      "heading",
      "paragraph",
      "image",
      "video",
      "button",
      "divider",
      "spacer",
      "icon",
      "embed",
    ],
  });
  const results = filterSlashCommandEntries(entries, "", 3);
  assert.equal(results.length, 3);
});
