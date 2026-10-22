import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// Every admin media write route must refuse viewers: requireSession alone only proves a login.
const ROOT = path.resolve(__dirname, "../../app/api/admin/media");
const WRITE_ROUTES = [
  "library/route.ts",
  "upload/route.ts",
  "upload/init/route.ts",
  "upload/register/route.ts",
  "upload/svg/route.ts",
] as const;

describe("admin media write routes require the media upload capability", () => {
  for (const rel of WRITE_ROUTES) {
    it(`${rel} checks the capability on the resolved tenant before reading the body or storage`, () => {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      const handler = rel === "library/route.ts" ? src.slice(src.indexOf("export async function PATCH")) : src.slice(src.indexOf("export async function POST"));
      const guard = handler.indexOf("mediaUploadDenied(");
      assert.ok(guard > 0, `${rel} must call mediaUploadDenied`);
      assert.match(handler.slice(guard, guard + 120), /scope\.tenantId/);
      assert.match(handler.slice(guard, guard + 200), /if \(denied\) return denied;/);
      // The library PATCH takes its tenantId from the JSON body, so only its writes must come after the guard.
      const firstUse =
        rel === "library/route.ts"
          ? handler.search(/updateTenantMedia/)
          : handler.search(/req\.(formData|json)\(\)|\.storage\b|createServiceRoleClient/);
      assert.ok(firstUse > guard, `${rel} must check the capability before touching the body or storage`);
    });
  }

  it("the helper maps a missing capability to 403 and uses the editor-level media upload capability", () => {
    const src = readFileSync(path.resolve(__dirname, "upload-capability.ts"), "utf8");
    assert.match(src, /"agency\.site_admin\.media\.upload"/);
    assert.match(src, /status: 403/);
    assert.match(src, /userHasCapability\(MEDIA_UPLOAD_CAPABILITY, tenantId\)/);
  });

  it("the capability is held by editors and above but not viewers", async () => {
    const { roleGrantsCapability } = await import("@/lib/access/roles");
    assert.equal(roleGrantsCapability("viewer", "agency.site_admin.media.upload"), false);
    assert.equal(roleGrantsCapability("editor", "agency.site_admin.media.upload"), true);
  });
});
