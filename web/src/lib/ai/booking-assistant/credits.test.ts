import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingAssistantMonthlyCapCents,
  bookingAssistantMonthlyCapReached,
  bookingAssistantPlanBand,
  isHubCreditsTenant,
} from "./credits";

test("free / basic / null share the tight per-talent monthly cap", () => {
  assert.equal(bookingAssistantPlanBand(null), "free");
  assert.equal(bookingAssistantPlanBand("talent_basic"), "free");
  assert.equal(bookingAssistantMonthlyCapCents(null), 500);
  assert.equal(bookingAssistantMonthlyCapCents("talent_basic"), 500);
});

test("paid talent plans get a higher monthly cap", () => {
  assert.equal(bookingAssistantPlanBand("talent_pro"), "paid");
  assert.equal(bookingAssistantPlanBand("talent_portfolio"), "paid");
  assert.equal(bookingAssistantMonthlyCapCents("talent_pro"), 2000);
});

test("monthly cap reached is inclusive of the limit", () => {
  assert.equal(bookingAssistantMonthlyCapReached(499, "talent_basic"), false);
  assert.equal(bookingAssistantMonthlyCapReached(500, "talent_basic"), true);
  assert.equal(bookingAssistantMonthlyCapReached(2000, "talent_pro"), true);
});

test("hub tenant id must never be treated as billable talent credits", () => {
  assert.equal(isHubCreditsTenant("hub", "hub"), true);
  assert.equal(isHubCreditsTenant("agency-1", "hub"), false);
  assert.equal(isHubCreditsTenant(null, "hub"), false);
});
