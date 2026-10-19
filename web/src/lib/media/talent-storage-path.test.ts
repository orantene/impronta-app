import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isTalentOwnedStoragePath } from "./talent-storage-path";

const T = "0f5c1e0a-1b2c-4d3e-8f90-a1b2c3d4e5f6";
const OTHER = "9a8b7c6d-1111-4222-8333-444455556666";

test("TUL-1269: only keys under this talent's own prefixes are accepted", () => {
  assert.equal(isTalentOwnedStoragePath(T, `${T}/gallery/abc.jpg`), true);
  assert.equal(isTalentOwnedStoragePath(T, `talent-portfolio/${T}/abc.png`), true);
  assert.equal(isTalentOwnedStoragePath(T, `${OTHER}/gallery/abc.jpg`), false, "another talent");
  assert.equal(isTalentOwnedStoragePath(T, `talent-portfolio/${OTHER}/abc.png`), false);
  assert.equal(isTalentOwnedStoragePath(T, `${T}/../${OTHER}/x.jpg`), false, "traversal");
  assert.equal(isTalentOwnedStoragePath(T, `${T}/%2e%2e/x.jpg`), false, "encoded traversal");
  assert.equal(isTalentOwnedStoragePath(T, `/${T}/x.jpg`), false, "leading slash");
  assert.equal(isTalentOwnedStoragePath(T, `${T}\\x.jpg`), false, "backslash");
  assert.equal(isTalentOwnedStoragePath(T, `tenant-assets/${T}/x.jpg`), false, "other tree");
  assert.equal(isTalentOwnedStoragePath(T, `${T}/`), false, "no object name");
  assert.equal(isTalentOwnedStoragePath("not-a-uuid", "not-a-uuid/x.jpg"), false);
  assert.equal(isTalentOwnedStoragePath(T, undefined), false);
});

test("INVARIANT register and remove portfolio actions use the ownership rule", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions.ts"),
    "utf8",
  );
  const reg = src.slice(src.indexOf("export async function registerPortfolioPhoto"), src.indexOf("export async function removePortfolioPhoto"));
  assert.match(reg, /isTalentOwnedStoragePath\(talentId, input\.storagePath\)/);
  assert.ok(reg.indexOf("isTalentOwnedStoragePath") < reg.indexOf('.insert({'), "checked before the insert");
  const rem = src.slice(src.indexOf("export async function removePortfolioPhoto"), src.indexOf("// ─── Delete talent"));
  assert.match(rem, /rosterMatch\(r\.admin, r\.scope\.tenantId, talentId\)/);
  assert.match(rem, /isTalentOwnedStoragePath\(talentId, m\.storage_path\)[\s\S]*storage\.from/);
  assert.match(rem, /\.eq\("owner_talent_profile_id", talentId\);/, "soft delete scoped to the talent");
});
