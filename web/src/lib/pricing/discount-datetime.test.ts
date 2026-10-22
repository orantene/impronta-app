import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildDiscountPromotionCodeParams } from "./discount-stripe-params";
import { isoToWallTime, wallTimeToIso } from "./discount-datetime";
import { discountStatus } from "./discount-status";

const CUN = "America/Cancun";

test("TUL-1860: 01:08 typed in Cancun is stored as 06:08Z, not shifted a second time", () => {
  assert.equal(wallTimeToIso("2026-10-22T01:08", CUN), "2026-10-22T06:08:00.000Z");
  assert.equal(wallTimeToIso("2026-10-22T01:08", "UTC"), "2026-10-22T01:08:00.000Z");
  assert.equal(wallTimeToIso("", CUN), null);
  assert.equal(wallTimeToIso("2026-10-22", CUN), null);
});

test("create: the stored instant is the one Stripe gets as expires_at / redeem_by", () => {
  const endsAt = wallTimeToIso("2026-10-22T01:08", CUN)!;
  const r = buildDiscountPromotionCodeParams({ code: "qab5-exp", couponId: "cpn_1", endsAt });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.params.expires_at, Date.parse("2026-10-22T06:08:00Z") / 1000);
});

test("edit: the drawer shows the stored instant back in the same zone and re-sends the same instant", () => {
  const stored = "2026-10-22T06:08:00+00:00";
  const shown = isoToWallTime(stored, CUN);
  assert.equal(shown, "2026-10-22T01:08");
  assert.equal(wallTimeToIso(shown, CUN), "2026-10-22T06:08:00.000Z");
});

test("at 01:15 Cancun a code that ended 01:08 Cancun is expired", () => {
  const endsAt = wallTimeToIso("2026-10-22T01:08", CUN)!;
  const now = Date.parse(wallTimeToIso("2026-10-22T01:15", CUN)!);
  assert.equal(discountStatus({ isActive: true, startsAt: null, endsAt }, now), "expired");
});

test("the viewer's own zone path (no zone argument) round-trips", () => {
  const iso = wallTimeToIso("2026-03-08T02:30")!;
  assert.equal(isoToWallTime(iso), "2026-03-08T02:30");
});

test("the server takes ISO with an offset as-is and the forms use the shared helper", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const act = read("src/lib/server-actions/admin-product-discounts.ts");
  assert.equal((act.match(/datetime\(\{ offset: true \}\)/g) ?? []).length, 3);
  const d = "src/app/(workspace)/platform/admin/commerce/discounts/";
  assert.match(read(d + "DiscountCreateDrawer.tsx"), /wallTimeToIso\(raw\)/);
  assert.match(read(d + "DiscountEditDrawer.tsx"), /wallTimeToIso\(startsAt\)/);
  assert.match(read("messages/en.json"), /"endsAt": "Ends at \(your time zone, optional\)"/);
  assert.match(read("messages/es.json"), /"endsAt": "Termina el \(tu zona horaria, opcional\)"/);
});
