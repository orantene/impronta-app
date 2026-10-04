/**
 * TalentMaxBuilderMount / shell mount must forward onExit into BuilderEditorMount
 * so the talent topbar Exit returns to My presence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src/components/talent/site");

test("TalentMaxBuilderMount forwards onExit to BuilderEditorMount", () => {
  const src = readFileSync(join(root, "TalentMaxBuilderMount.tsx"), "utf8");
  assert.match(src, /onExit,/);
  assert.match(src, /headerVariant=\{onExit \? "lab" : "live"\}/);
  assert.match(src, /onExit=\{onExit\}/);
});

test("TalentSiteShellBuilderMount forwards onExit to BuilderEditorMount", () => {
  const src = readFileSync(join(root, "TalentSiteShellBuilderMount.tsx"), "utf8");
  assert.match(src, /onExit,/);
  assert.match(src, /headerVariant=\{onExit \? "lab" : "live"\}/);
  assert.match(src, /onExit=\{onExit\}/);
});

test("page-builder is a talent canonical route (soft-nav bare editor)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/canonical-routes.ts"),
    "utf8",
  );
  assert.match(src, /s\[1\] === "page-builder"/);
});

test("LabExitButton flushes builder draft before onExit", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/topbar.tsx"),
    "utf8",
  );
  const labIdx = src.indexOf("function LabExitButton");
  assert.ok(labIdx >= 0);
  const slice = src.slice(labIdx, labIdx + 1200);
  assert.match(slice, /flushBuilderTreeSave/);
  assert.match(slice, /t\("Exit"\)/);
});
