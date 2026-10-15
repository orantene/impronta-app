import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = join(process.cwd(), "src/components/admin/shell/internal/messages");

test("TUL-955: the Group tab leads with the guest's original request", () => {
  const src = readFileSync(join(dir, "talent-2.tsx"), "utf8");
  assert.match(src, /data-original-inquiry/);
  assert.match(src, /dashboard\.talentThread\.originalRequest/);
});

test("TUL-956: the open thread is mirrored to ?thread= and read back on load", () => {
  const src = readFileSync(join(dir, "TalentJobShell.tsx"), "utf8");
  assert.match(src, /searchParams\.get\("thread"\)/);
  assert.match(src, /searchParams\.set\("thread", activeId\)/);
  assert.match(src, /replaceState/);
});
