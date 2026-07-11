/**
 * guest-detail-progress.test.ts — DOCK v2. Locks the "Add details N/6" math and
 * the per-field filled checks the details sheet keys its row ticks on.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { GuestChipKind, GuestChipValue } from "@/lib/inquiry/guest-chat-contract";

import {
  countCoreDetails,
  isDetailFilled,
  isContactFilled,
  isTalentFilled,
} from "./guest-detail-progress";

const EMPTY: InquiryIntent = {} as InquiryIntent;

test("an empty intent has zero of six filled", () => {
  const p = countCoreDetails(EMPTY, {});
  assert.equal(p.filled, 0);
  assert.equal(p.total, 6);
});

test("captured chip values count toward the total", () => {
  const captured: Partial<Record<GuestChipKind, GuestChipValue>> = {
    date: { eventDate: "2026-08-01" } as GuestChipValue,
    location: { locationStatus: "online" } as GuestChipValue,
  };
  const p = countCoreDetails(EMPTY, captured);
  assert.equal(p.filled, 2);
  assert.ok(isDetailFilled("date", EMPTY, captured));
  assert.ok(isDetailFilled("location", EMPTY, captured));
  assert.ok(!isDetailFilled("budget", EMPTY, captured));
});

test("the live intent fills fields even without a captured value", () => {
  const intent = {
    date: { event_date: "2026-08-01" },
    brief: { summary: "a summer rooftop party" },
    budget: { amount: 5000 },
  } as unknown as InquiryIntent;
  const p = countCoreDetails(intent, {});
  // date + brief + budget
  assert.equal(p.filled, 3);
  assert.ok(isDetailFilled("brief", intent, {}));
});

test("headcount only counts when positive", () => {
  const zero = { talent: { count_needed: 0 } } as unknown as InquiryIntent;
  assert.ok(!isDetailFilled("headcount", zero, {}));
  const some = { talent: { count_needed: 3 } } as unknown as InquiryIntent;
  assert.ok(isDetailFilled("headcount", some, {}));
});

test("contact + talent are tracked separately, not in the core six", () => {
  const intent = {
    requester: { name: "Ada" },
    talent: { selected_ids: ["t1", "t2"] },
  } as unknown as InquiryIntent;
  assert.ok(isContactFilled(intent));
  assert.ok(isTalentFilled(intent));
  // Neither contact nor talent moves the 6-core tally.
  assert.equal(countCoreDetails(intent, {}).filled, 0);
});
