import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canLeaveEditor, leaveEditorMessage } from "./offering-editor-leave";

const src = readFileSync(join(process.cwd(), "src/components/talent/services/EditorScreen.tsx"), "utf8");

test("clean editor leaves without asking", () => {
  assert.equal(canLeaveEditor(false, false, () => assert.fail("no prompt")), true);
});
test("dirty editor asks, ES and EN, and honors cancel", () => {
  let msg = "";
  assert.equal(canLeaveEditor(true, true, (m) => ((msg = m), false)), false);
  assert.match(msg, /cambios sin guardar/);
  assert.equal(canLeaveEditor(true, false, () => true), true);
  assert.match(leaveEditorMessage(false), /unsaved changes/);
});
test("EditorScreen back button goes through the guard, not raw onBack", () => {
  assert.match(src, /canLeaveEditor\(/);
  assert.doesNotMatch(src, /onClick=\{onBack\}/);
});
