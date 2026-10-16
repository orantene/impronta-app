import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/components/builder-lab/talent-factory/publish-design-button.tsx"),
  "utf8",
);

describe("Builder Lab publish button (TUL-998, TUL-1002)", () => {
  it("TUL-1002: confirms in-app, never with the browser's window.confirm", () => {
    assert.doesNotMatch(SRC, /window\.confirm\s*\(/);
    assert.match(SRC, /import \{ ConfirmDialog \} from/);
    assert.match(SRC, /<ConfirmDialog[\s\S]*?onConfirm=\{run\}/);
    assert.match(SRC, /onClick=\{\(\) => setConfirmOpen\(true\)\}/);
  });

  it("TUL-1002: the dialog and the label copy exist in both languages", () => {
    assert.match(SRC, /confirmLabel: "Publish"/);
    assert.match(SRC, /confirmLabel: "Publicar"/);
    assert.match(SRC, /cancel: "Cancelar"/);
  });

  it("TUL-998: a failed publish lists the concrete problems the server returned", () => {
    assert.match(SRC, /setIssues\(res\.issues \?\? \[\]\)/);
    assert.match(SRC, /data-publish-issues/);
    assert.match(SRC, /issues\.map\(\(issue, i\)/);
    assert.match(SRC, /problems: "To fix before publishing:"/);
    assert.match(SRC, /problems: "Por corregir antes de publicar:"/);
  });

  it("TUL-998: the problems list is cleared when a new publish starts", () => {
    assert.match(SRC, /const run = async \(\) => \{\s*setConfirmOpen\(false\);\s*setIssues\(\[\]\);/);
  });
});
