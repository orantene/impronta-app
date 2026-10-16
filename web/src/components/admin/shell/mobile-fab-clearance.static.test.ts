/**
 * TUL-963: on phones the floating action button must never cover the last
 * actionable row. The shell reserves bottom space via --tulala-fab-clear,
 * derived from the FAB's own offset + size.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/components/admin/shell/admin-shell-client.tsx"),
  "utf8",
);

test("surface main reserves FAB clearance on phones", () => {
  assert.match(SRC, /\[data-tulala-surface-main\] \{\s*padding: 14px 14px var\(--tulala-fab-clear\) !important/);
  assert.match(SRC, /> main,[\s\S]*?padding: 14px 14px var\(--tulala-fab-clear\) !important/);
});

test("clearance covers FAB bottom offset + size + air", () => {
  const offset = Number(/data-tulala-bottom-fab[\s\S]*?bottom: "calc\((\d+)px \+ env/.exec(SRC)?.[1]);
  const size = Number(/width: (\d+), height: \1, borderRadius: 16/.exec(SRC)?.[1]);
  const clear = Number(/"--tulala-fab-clear" as never\]:\s*"calc\((\d+)px \+ env\(safe-area-inset-bottom/.exec(SRC)?.[1]);
  assert.ok(offset > 0 && size > 0 && clear > 0);
  assert.ok(clear >= offset + size + 8, `clear ${clear} < ${offset}+${size}+8`);
});
