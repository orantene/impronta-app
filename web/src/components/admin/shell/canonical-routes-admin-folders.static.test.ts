import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";

import { ADMIN_ROUTE_FOLDERS, pathIsCanonical } from "@/components/admin/shell/canonical-routes";

const ADMIN = "src/app/(workspace)/[tenantSlug]/admin";

test("TUL-635: ADMIN_ROUTE_FOLDERS equals the admin folders on disk (no section treated as unknown)", () => {
  const onDisk = readdirSync(ADMIN, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("["))
    .map((e) => e.name)
    .sort();
  assert.deepEqual([...ADMIN_ROUTE_FOLDERS].sort(), onDisk);
});

test("TUL-635: an unknown admin segment is canonical, so the shell hosts the not-found card", () => {
  assert.equal(pathIsCanonical("/qa-journeys-b/admin/no-existe-635"), true);
});

test("TUL-635: Overview and SPA sections stay non-canonical", () => {
  assert.equal(pathIsCanonical("/qa-journeys-b/admin"), false);
  assert.equal(pathIsCanonical("/qa-journeys-b/admin/clients"), false);
  assert.equal(pathIsCanonical("/qa-journeys-b/admin/messages"), false);
});
