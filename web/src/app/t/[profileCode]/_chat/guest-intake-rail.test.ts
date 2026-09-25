import assert from "node:assert/strict";
import { test } from "node:test";

import { intakeTradeForPreset, nextIntakeFact } from "./guest-intake-rail";

const empty = {};

test("beauty asks for the day, then the hour", () => {
  assert.equal(nextIntakeFact("beauty", empty), "day");
  assert.equal(nextIntakeFact("beauty", { day: "2026-09-25" }), "hour");
  assert.equal(nextIntakeFact("beauty", { day: "2026-09-25", hour: "18:00" }), "ready");
});

test("a booked date is never the missing fact", () => {
  assert.equal(nextIntakeFact("beauty", { booked: true }), "hour");
  assert.equal(nextIntakeFact("chef", { booked: true }), "guests");
  assert.equal(nextIntakeFact("massage", { booked: true }), "hour");
  assert.equal(nextIntakeFact("agency", { booked: true }), "place");
});

test("each trade has its own facts", () => {
  assert.equal(nextIntakeFact("chef", empty), "date");
  assert.equal(
    nextIntakeFact("chef", { day: "sat", guests: 8, allergies: "none" }),
    "kitchen",
  );
  assert.equal(nextIntakeFact("massage", { day: "fri", hour: "18:00" }), "duration");
  assert.equal(
    nextIntakeFact("massage", { day: "fri", hour: "18:00", duration: "60", place: "studio" }),
    "ready",
  );
  assert.equal(nextIntakeFact("agency", { day: "21 Nov" }), "place");
});

test("only the four named presets get a rail", () => {
  assert.equal(intakeTradeForPreset("salon_barber"), "beauty");
  assert.equal(intakeTradeForPreset("spa_wellness"), "massage");
  assert.equal(intakeTradeForPreset("private_chef"), "chef");
  assert.equal(intakeTradeForPreset("agency"), "agency");
  assert.equal(intakeTradeForPreset("practice"), null);
});
