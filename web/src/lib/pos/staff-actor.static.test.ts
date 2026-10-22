/**
 * staff-actor.static.test.ts — TUL-1742.
 *
 * `posStaffOrInquiryManager`'s coordinator/manager branch called
 * `requireInquiryManagerAction(inquiryId)` bare (no capability) — the same
 * bug class as TUL-1708's `requireInquiryManagerAction` P1 fix on the
 * messaging/pipeline guards: the staff fast-path inside that guard defaults
 * to the viewer-held `agency.workspace.view`, so ANY staff member (not just
 * one who holds the POS capability `posAddLine` actually needs) could pass
 * through as "staff" and add a line to a counter order. The appointed-
 * coordinator branch (the row-based path below the staff fast-path) is
 * never capability-gated by design and stays untouched.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const actor = readFileSync(join(dir, "staff-actor.ts"), "utf8");

test("posStaffOrInquiryManager forwards its capability param to requireInquiryManagerAction (no bare call)", () => {
  const fn = actor.slice(actor.indexOf("export async function posStaffOrInquiryManager"));
  assert.doesNotMatch(
    fn,
    /\bawait requireInquiryManagerAction\(inquiryId\)/,
    "a bare requireInquiryManagerAction(inquiryId) call lets any staff member with just agency.workspace.view through as staff",
  );
  assert.match(fn, /requireInquiryManagerAction\(inquiryId, \{ capability \}\)/);
  // The appointed-coordinator path inside requireInquiryManagerAction stays
  // untouched by this fix — that's admin-scope.ts's contract, not this file's.
  assert.match(fn, /return posStaff\(capability\)/);
});

test("posStaff defaults to operate_venue (PM 2026-10-21: a cashier seat takes sales); the inquiry manager path keeps booking.payment.request", () => {
  assert.match(actor, /export async function posStaff\(capability: PosStaffCapability = "operate_venue"\)/);
  assert.match(
    actor,
    /export async function posStaffOrInquiryManager\(\s*inquiryId: string \| null \| undefined,\s*capability: PosStaffCapability = "booking\.payment\.request",\s*\)/,
  );
});
