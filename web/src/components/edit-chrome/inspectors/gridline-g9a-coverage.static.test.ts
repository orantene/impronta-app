/**
 * Gridline G9a: the 4-layer coverage guard for `task_picker` (schema and
 * validation, renderer, inspector, element library) plus its Spanish strings,
 * the island's aria-pressed contract and the data-source need.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(resolve(THIS_DIR, f), "utf8");
const libAt = (f: string) => readFileSync(resolve(THIS_DIR, "../../../lib", f), "utf8");

test("task_picker: schema, renderer, inspector and element library are all wired", () => {
  // 1. types + validation
  assert.ok(libAt("site-admin/builder-node/types.ts").includes('kind: "task_picker"'));
  const registry = libAt("site-admin/builder-node/registry.ts");
  assert.ok(registry.includes("export const taskPickerPropsSchema"));
  assert.ok(registry.includes("propsSchema: taskPickerPropsSchema"));
  assert.ok(registry.includes('  "task_picker",'), "kind list");
  assert.ok(libAt("talent-site/theme-catalog/validate.ts").includes('"task_picker"'), "design validator leaf");
  assert.ok(libAt("site-admin/builder-node/drop-policy.ts").includes('"task_picker"'), "drop policy");
  assert.ok(libAt("site-admin/builder-node/create.ts").includes('case "task_picker"'));
  // 2. renderer
  assert.ok(libAt("site-admin/builder-node/render.tsx").includes('case "task_picker"'));
  // 3. inspector: every prop the renderer reads has a control
  assert.match(read("builder-node-content.tsx"), /node\.kind === "task_picker"\) \{\s*return <TaskPickerContentInspector/);
  const inspector = read("task-picker-inspector.tsx");
  for (const v of ["label:", "labelEs:", "icon:", "offeringId:", "hint:", "hintEs:", "defaultOfferingId", "defaultKickerEs", "defaultHintEs", "eyebrow", "title"]) {
    assert.ok(inspector.includes(v), `inspector ${v}`);
  }
  // 4. element library
  const allow = libAt("site-admin/builder-node/mvp-allow-list.ts");
  assert.ok(allow.includes('task_picker: "actions"'), "element category");
  assert.ok(allow.includes("task_picker: \"task picker"), "search terms");
  assert.ok(/MVP_ELEMENT_LIBRARY_KINDS[^]*?"task_picker"/.test(allow), "element library kinds");
  assert.ok(/SHIPPED_ELEMENT_INSERT_KINDS[^]*?"task_picker"/.test(allow), "insert kinds");
});

test("task_picker: the page loads the offerings it recommends from", () => {
  assert.match(libAt("site-admin/builder-node/native-data-block-needs.ts"), /"services_catalog" \|\| node\.kind === "task_picker"/);
  assert.match(libAt("talent-site/server/render-max-site.tsx"), /builderTreeHasKind\(blocks, "task_picker"\)/);
});

test("the island marks the picked task with aria-pressed and reuses the catalog events", () => {
  const island = libAt("site-admin/builder-node/task-picker-island.tsx");
  assert.ok(island.includes("aria-pressed={picked === x.id}"));
  assert.ok(island.includes('aria-live="polite"'));
  assert.ok(island.includes("deriveOfferingCta"), "mode-correct action from the shared derivation");
  assert.ok(island.includes('"tulala:offering-request"'), "details entry");
});

test("G9a: every new inspector string has a Spanish row", () => {
  const es = read("../editor-i18n-es-inspectors-3.ts");
  for (const s of [
    '"Task picker"',
    '"Task picker · tasks and recommended services"',
    '"Start here"',
    '"Start here service"',
    '"Tasks"',
    '"Task text"',
    '"Task icon"',
    '"Recommended service"',
    '"Add task"',
    '"Remove task"',
    '"Choose a service"',
    '"Label (Spanish)"',
    '"Note (Spanish)"',
  ]) {
    assert.ok(es.includes(s), `ES row for ${s}`);
  }
});
