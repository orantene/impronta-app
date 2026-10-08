import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// TUL-131: both identity/language saves must drop the 60 s workspace seed cache.
for (const file of ["src/lib/site-admin/server/identity.ts", "src/lib/server-actions/admin-workspace-settings.ts"]) {
  test(`${file} invalidates the workspace seed cache`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /invalidateWorkspaceSeedPrimary\(tenantId\)/);
    assert.match(src, /import \{ invalidateWorkspaceSeedPrimary \}/);
  });
}
