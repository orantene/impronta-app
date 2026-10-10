/**
 * live2b-03 — workspace admin shell must pin initialSurface=workspace so a
 * hybrid preferredSurface=talent cannot keep Talento chrome on /admin.
 *
 *   cd web && npx tsx --test src/components/admin/shell/admin-shell-client.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/components/admin/shell/admin-shell-client.tsx"),
  "utf8",
);

test("AdminShellClient pins initialSurface=workspace (live2b-03)", () => {
  // TalentShellClient keeps talent; workspace client must not omit surface.
  assert.match(
    SRC,
    /export function AdminShellClient[\s\S]*?initialSurface="workspace"/,
  );
  assert.match(
    SRC,
    /export function TalentShellClient[\s\S]*?initialSurface="talent"/,
  );
});
