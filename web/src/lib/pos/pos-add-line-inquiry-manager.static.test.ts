/**
 * Static contract: Messages items-picker path of `posAddLine` must authorize
 * inquiry managers when `inquiryId` is passed (talent `/talent/inbox`).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const actions = readFileSync(
  join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/actions.ts"),
  "utf8",
);
const actor = readFileSync(join(process.cwd(), "src/lib/pos/staff-actor.ts"), "utf8");

test("posAddLine accepts inquiryId and gates via posStaffOrInquiryManager", () => {
  const fn = actions.slice(actions.indexOf("export async function posAddLine"));
  const end = fn.indexOf("export async function posUpdateLine");
  const body = end >= 0 ? fn.slice(0, end) : fn;
  assert.match(body, /inquiryId\?:/);
  assert.match(body, /inquiryId: uuid\.nullable\(\)\.optional\(\)/);
  assert.match(body, /posStaffOrInquiryManager\(parsed\.data\.inquiryId\)/);
  assert.match(actor, /requireInquiryManagerAction\(inquiryId\)/);
  assert.match(actor, /return posStaff\(/);
});
