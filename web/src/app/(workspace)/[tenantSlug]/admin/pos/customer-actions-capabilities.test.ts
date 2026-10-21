/**
 * TUL-1708: a viewer must not write through a capability-less staff guard. pos/customer-actions.ts
 * names the capability it needs on the guard itself; a viewer (and an editor) is refused, a
 * manager and above is allowed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { CapabilityKey } from "@/lib/access";
import { roleGrantsCapability } from "@/lib/access/roles";

const src = readFileSync(
  join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/customer-actions.ts"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const CAPS: Record<string, CapabilityKey> = { posAttachCustomer: "booking.payment.request" };

test("no capability-less staff guard is left in the file", () => {
  assert.doesNotMatch(src, /\brequireWorkspaceStaffAction\(\s*\)/);
  assert.doesNotMatch(src, /\bawait staff\(\s*\)/);
  assert.match(src, /requireWorkspaceStaffAction\(\{ capability: CUSTOMER_ACTIONS_CAPABILITY\[action\] \}\)/);
});

test("each action names its own key in the capability map", () => {
  const body = src.slice(src.indexOf("export async function posAttachCustomer"));
  assert.match(body.slice(0, 900), /await staff\("posAttachCustomer"\)/);
  assert.match(src, /posAttachCustomer: "booking\.payment\.request"/);
});

test("a viewer and an editor are refused every capability the file requires; manager, admin and owner are allowed", () => {
  for (const cap of new Set(Object.values(CAPS))) {
    for (const role of ["viewer", "editor"] as const) {
      assert.equal(roleGrantsCapability(role, cap), false, `${role} must not hold ${cap}`);
    }
    for (const role of ["manager", "admin", "owner"] as const) {
      assert.equal(roleGrantsCapability(role, cap), true, `${role} should hold ${cap}`);
    }
  }
});
