/**
 * TUL-1271 #1: photos on a workspace catalog item. No schema change: the
 * join table (talent_offering_media) and tenant-owned media_assets already exist.
 *
 * Run: node_modules/.bin/tsx --test src/lib/talent/workspace-item-photos.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MAX_ITEM_PHOTOS, nextPhotoIds } from "./workspace-item-photos";

test("nextPhotoIds: appends new ids, drops removed ones, dedupes, keeps order", () => {
  assert.deepEqual(nextPhotoIds(["a", "b"], { add: ["c", "a"] }), ["a", "b", "c"]);
  assert.deepEqual(nextPhotoIds(["a", "b", "c"], { remove: "b" }), ["a", "c"]);
  assert.deepEqual(nextPhotoIds([], {}), []);
});

test("nextPhotoIds: caps the gallery", () => {
  const many = Array.from({ length: MAX_ITEM_PHOTOS + 5 }, (_, i) => `p${i}`);
  assert.equal(nextPhotoIds([], { add: many }).length, MAX_ITEM_PHOTOS);
});

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the action checks the item and every photo belong to this workspace before linking", () => {
  const actions = src("./menu-offerings-actions.ts");
  const body = actions.slice(actions.indexOf("export async function setWorkspaceItemPhotos"));
  assert.match(body, /authorizeForWorkspace\(tenantId\)/);
  assert.match(body, /\.eq\("owner_kind", "workspace"\)/);
  assert.match(body, /\.eq\("tenant_id", tenantId\)/);
  assert.match(body, /\.is\("deleted_at", null\)/);
  assert.match(body, /talent_offering_media/);
});

test("the Catalog loads the photos and the Details tab uploads through the tenant library route", () => {
  assert.match(src("./menu-offerings-actions.ts"), /loadOfferingImageAssets/);
  const dir = "../../components/admin/shell/internal/page-modules/catalog/";
  const field = readFileSync(new URL(`${dir}item-photos-field.tsx`, import.meta.url), "utf8");
  const details = readFileSync(new URL(`${dir}item-tab-details.tsx`, import.meta.url), "utf8");
  assert.match(field, /\/api\/admin\/media\/upload/);
  assert.match(field, /setWorkspaceItemPhotos/);
  assert.match(details, /<ItemPhotosField/);
  assert.doesNotMatch(details, /<input type="file" disabled/);
});

test("alt text: an action writes it for this workspace's asset and the field edits it", () => {
  const actions = src("./menu-offerings-actions.ts");
  const body = actions.slice(actions.indexOf("export async function setWorkspacePhotoAlt"));
  assert.match(body, /authorizeForWorkspace\(tenantId\)/);
  assert.match(body, /\.eq\("tenant_id", tenantId\)/);
  assert.match(body, /slice\(0, 200\)/);
  const field = readFileSync(
    new URL("../../components/admin/shell/internal/page-modules/catalog/item-photos-field.tsx", import.meta.url),
    "utf8",
  );
  assert.match(field, /setWorkspacePhotoAlt/);
  assert.match(field, /compressImage/);
  assert.match(src("./offering-images.server.ts"), /alt/);
});
