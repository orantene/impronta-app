import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { accountPreviewMode } from "@/lib/client-account/account-preview";
import { siteHeaderSchemaV1 } from "@/lib/site-admin/sections/site_header/schema";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("builder canvas (no siteChrome) previews the account item; live never does", () => {
  assert.equal(accountPreviewMode(undefined, undefined), "signed-out");
  assert.equal(accountPreviewMode(undefined, "signed-in"), "signed-in");
  assert.equal(accountPreviewMode(undefined, "signed-out"), "signed-out");
  assert.equal(accountPreviewMode({ account: true }, "signed-in"), "live");
  assert.equal(accountPreviewMode({}, "signed-in"), "off");
  assert.equal(accountPreviewMode({ account: false }, undefined), "off");
});

test("schema accepts previewAs on the account item only with known values", () => {
  const mk = (previewAs: string) => siteHeaderSchemaV1.safeParse({ brand: {}, regions: { left: [], center: [], right: [{ type: "account", previewAs }] } });
  assert.ok(mk("signed-in").success);
  assert.equal(mk("nope").success, false);
});

test("Component renders the preview and the inspector offers the toggle", () => {
  assert.match(read("src/lib/site-admin/sections/site_header/Component.tsx"), /accountPreviewMode/);
  const row = read("src/components/edit-chrome/inspectors/site-header/tabs/regions-item-row.tsx");
  assert.match(row, /previewAs/);
  assert.match(row, /Preview as/);
});
