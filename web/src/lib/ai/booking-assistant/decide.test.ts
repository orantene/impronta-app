import { test } from "node:test";
import assert from "node:assert/strict";
import { decideBookingAssistantTurn } from "./decide";
import { BOOKING_ASSISTANT_TURN_CEILING } from "./turns";

test("off toggle skips", () => {
  const d = decideBookingAssistantTurn({
    enabled: false,
    guestMessage: "How much is a cut?",
    priorMessages: [],
    instantAnswered: false,
  });
  assert.deepEqual(d, { action: "skip", reason: "off" });
});

test("instant-answered skips even when on", () => {
  const d = decideBookingAssistantTurn({
    enabled: true,
    guestMessage: "How much?",
    priorMessages: [],
    instantAnswered: true,
  });
  assert.deepEqual(d, { action: "skip", reason: "instant_answered" });
});

test("human ask hands off", () => {
  const d = decideBookingAssistantTurn({
    enabled: true,
    guestMessage: "Can I talk to a real person?",
    priorMessages: [],
    instantAnswered: false,
  });
  assert.deepEqual(d, { action: "handoff", reason: "human_requested" });
});

test("turn ceiling hands off once (no prior handoff)", () => {
  const prior = Array.from({ length: BOOKING_ASSISTANT_TURN_CEILING }, () => ({
    systemEventType: "booking_assistant_reply",
  }));
  const d = decideBookingAssistantTurn({
    enabled: true,
    guestMessage: "Still here",
    priorMessages: prior,
    instantAnswered: false,
  });
  assert.deepEqual(d, { action: "handoff", reason: "turn_ceiling" });
});

test("prior handoff is terminal skip (no resume, no spam)", () => {
  const d = decideBookingAssistantTurn({
    enabled: true,
    guestMessage: "Can I talk to a real person again?",
    priorMessages: [{ systemEventType: "booking_assistant_handoff" }],
    instantAnswered: false,
  });
  assert.deepEqual(d, { action: "skip", reason: "already_handed_off" });
});

test("booking intent hands off in phase 1 (no book tools)", () => {
  const d = decideBookingAssistantTurn({
    enabled: true,
    guestMessage: "Quiero reservar una cita manana",
    priorMessages: [],
    instantAnswered: false,
  });
  assert.deepEqual(d, { action: "handoff", reason: "unsure" });
});

test("otherwise routes to llm facts", () => {
  const d = decideBookingAssistantTurn({
    enabled: true,
    guestMessage: "Do you offer balayage?",
    priorMessages: [],
    instantAnswered: false,
  });
  assert.deepEqual(d, { action: "llm_facts" });
});
