import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * D-139: `role_limits` were written and the inbox decided requests, but the
 * limit had no caller and no screen filed a request. The two write paths the
 * limits govern (a discount on the counter, a refund at the desk) must go
 * through `enforceRoleLimit`, which judges the amount and files the request.
 */
const DOORS: Array<{ file: string; action: "discount" | "refund" }> = [
  { file: "src/app/(workspace)/[tenantSlug]/admin/pos/actions.ts", action: "discount" },
  { file: "src/app/(workspace)/[tenantSlug]/admin/orders/refund-actions.ts", action: "refund" },
];

for (const door of DOORS) {
  test(`${door.action}: ${door.file} enforces the role limit`, () => {
    const src = readFileSync(join(process.cwd(), door.file), "utf8");
    assert.match(src, /import \{ enforceRoleLimit \} from "@\/lib\/approvals\/enforce"/);
    assert.match(src, new RegExp(`action: "${door.action}"`));
    assert.match(src, /enforceRoleLimit\(/);
  });
}

test("enforceRoleLimit files the request through request_approval on a refusal", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/approvals/enforce.ts"), "utf8");
  assert.match(src, /assertRoleLimit\(/);
  assert.match(src, /requestApproval\(/);
});
