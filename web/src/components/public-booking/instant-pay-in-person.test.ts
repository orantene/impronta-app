import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pickBookableOffering } from "./pick-bookable-offering";
import type { TalentOffering } from "@/lib/talent/offerings-types";

/**
 * instant-pay-in-person.test.ts — the slot picker must charge what the
 * offering sells.
 *
 * THE BUG: `BookableComposer` sent `payInPerson: true` to
 * `createInstantBookingAction` for EVERY instant booking, unconditionally. A
 * deposit or full-prepay service booked through the slot picker therefore
 * became a free reservation and no card was ever charged, while the storefront
 * path for the same offering charged correctly. The composer could not have
 * known better: `BookableOffering` dropped `reserveMode` and
 * `allowPayInPerson` on the way through the mapper, so the data to decide with
 * never reached it.
 *
 * Two halves, both pinned: the mapper must carry the money fields, and the
 * composer must branch on them rather than on a literal.
 */

const BASE = {
  id: "off-1",
  durationMinutes: 30,
  kind: "service",
  bookingMode: "instant",
  talentProfileId: "talent-1",
  requireAccountToBook: false,
} as unknown as TalentOffering;

function offering(over: Partial<TalentOffering>): TalentOffering {
  return { ...BASE, ...over } as TalentOffering;
}

test("the mapper carries the money fields the instant path needs", () => {
  const picked = pickBookableOffering([
    offering({ reserveMode: "deposit", allowPayInPerson: false } as Partial<TalentOffering>),
  ]);
  assert.ok(picked, "expected a bookable offering");
  assert.equal(picked.reserveMode, "deposit");
  assert.equal(picked.allowPayInPerson, false);
});

test("a free, pay-in-person offering still maps as such", () => {
  const picked = pickBookableOffering([
    offering({ reserveMode: "free", allowPayInPerson: true } as Partial<TalentOffering>),
  ]);
  assert.equal(picked?.reserveMode, "free");
  assert.equal(picked?.allowPayInPerson, true);
});

test("the composer decides payInPerson from the offering, never a literal", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/components/public-booking/BookableComposer.tsx"),
    "utf8",
  );

  assert.doesNotMatch(
    src,
    /payInPerson:\s*true\b/,
    "payInPerson must not be hardcoded true — that turns a deposit service into a free reservation",
  );
  assert.match(
    src,
    /payInPerson:\s*[\s\S]{0,120}active\.reserveMode\s*===\s*"free"/,
    "payInPerson must be derived from the offering's reserveMode",
  );
});
