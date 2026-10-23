import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * TUL-1380 follow-up: resolveRecordTarget reads agency_bookings with the SERVICE client, so the
 * only thing keeping one talent from another's booking is the booking_talent leg check. Pin it:
 * the leg read is scoped by her own talent_profile_id, and both agency paths (by booking id, by
 * order id) return only behind that gate.
 */
const FILE = join(process.cwd(), "src/lib/talent-agenda/resolve-record-target.ts");

/** Reasons the source loses the ownership gate; empty when intact. */
export function ownershipGateViolations(src: string): string[] {
  const out: string[] = [];
  if (!/const hasLeg = async \(bookingId: string\) =>[\s\S]*?\.from\("booking_talent"\)[\s\S]*?\.eq\("booking_id", bookingId\)[\s\S]*?\.eq\("talent_profile_id", talentProfileId\)/.test(src)) {
    out.push("hasLeg must read booking_talent by booking_id AND talent_profile_id");
  }
  if (!/\.from\("talent_bookings"\)[^\n]*\.eq\("talent_profile_id", talentProfileId\)/.test(src)) {
    out.push("the talent_bookings read must be scoped by talent_profile_id");
  }
  if (!/if \(byId && str\(byId\.starts_at\) && \(await hasLeg\(id\)\)\) return/.test(src)) {
    out.push("path 2 (agency booking by id) must return only behind hasLeg(id)");
  }
  if (!/if \(byOrder && orderBookingId && str\(byOrder\.starts_at\) && \(await hasLeg\(orderBookingId\)\)\) \{/.test(src)) {
    out.push("path 3 (order id) must return only behind hasLeg(orderBookingId)");
  }
  return out;
}

describe("resolveRecordTarget ownership gate", () => {
  const src = readFileSync(FILE, "utf8");

  it("the real file keeps the booking_talent leg gate on both agency paths", () => {
    assert.deepEqual(ownershipGateViolations(src), []);
  });

  it("the pin fails on mutated copies (gate removed or unscoped)", () => {
    const noPath2Gate = src.replace("&& (await hasLeg(id))", "");
    assert.ok(ownershipGateViolations(noPath2Gate).some((v) => v.startsWith("path 2")));
    const noPath3Gate = src.replace("&& (await hasLeg(orderBookingId))", "");
    assert.ok(ownershipGateViolations(noPath3Gate).some((v) => v.startsWith("path 3")));
    const unscopedLeg = src.replace('.eq("booking_id", bookingId).eq("talent_profile_id", talentProfileId)', '.eq("booking_id", bookingId)');
    assert.ok(ownershipGateViolations(unscopedLeg).some((v) => v.startsWith("hasLeg")));
    const unscopedOwn = src.replace('.eq("id", id).eq("talent_profile_id", talentProfileId)', '.eq("id", id)');
    assert.ok(ownershipGateViolations(unscopedOwn).some((v) => v.startsWith("the talent_bookings")));
  });
});
