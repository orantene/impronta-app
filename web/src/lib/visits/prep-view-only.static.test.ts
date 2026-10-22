import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dir = "src/app/(workspace)/[tenantSlug]/admin/preparation/";

describe("kitchen board: view only without operate_venue", () => {
  it("the page asks operate_venue and hands the answer to the client", () => {
    const page = readFileSync(`${dir}page.tsx`, "utf8");
    assert.match(page, /userHasCapability\("operate_venue", scope\.tenantId\)/);
    assert.match(page, /canOperate=\{canOperate\}/);
  });
  it("every action button is disabled for a viewer and says why", () => {
    const client = readFileSync(`${dir}prep-client.tsx`, "utf8");
    assert.equal((client.match(/disabled=\{busy \|\| !canOperate\}/g) ?? []).length, 3);
    assert.match(client, /data-prep-view-only/);
  });
  it("the hint exists in en and es", () => {
    for (const l of ["en", "es"]) {
      const j = JSON.parse(readFileSync(`messages/${l}.json`, "utf8"));
      assert.ok(String(j.dashboard.preparation.viewOnly).length > 10, l);
    }
  });
});
