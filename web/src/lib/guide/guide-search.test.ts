import assert from "node:assert/strict";
import { test } from "node:test";

import { expandGuideTerm, guideTokens, searchGuideTopics, type GuideSearchTopic } from "./guide-search";

const topics: GuideSearchTopic[] = [
  { nodeId: "today-pulse", title: "Today pulse", oneSentence: "A quick read of what needs you today.", category: "Today" },
  { nodeId: "start-ticket", title: "Start ticket", oneSentence: "Ask the team for help.", category: "Support" },
  { nodeId: "talent-availability", title: "Availability", oneSentence: "Your master availability calendar.", category: "Calendar" },
  { nodeId: "quiet-hours", title: "Quiet hours", oneSentence: "Set quiet hours so you stop getting pinged at 2am.", category: "Notifications" },
  { nodeId: "payouts", title: "Payouts", oneSentence: "Get paid for your bookings.", category: "Money" },
];

test("horario finds the schedule topics and not the unrelated ones", () => {
  const ids = searchGuideTopics(topics, "horario").map((t) => t.nodeId);
  assert.ok(ids.includes("talent-availability"));
  assert.ok(ids.includes("quiet-hours"));
  assert.ok(!ids.includes("today-pulse"));
  assert.ok(!ids.includes("start-ticket"));
});

test("the literal English word ranks the title match first", () => {
  assert.equal(searchGuideTopics(topics, "availability")[0]?.nodeId, "talent-availability");
});

test("every Spanish and English schedule word reaches availability", () => {
  for (const q of ["horarios", "disponibilidad", "agenda", "schedule", "hours", "availability", "Horário"]) {
    const ids = searchGuideTopics(topics, q).map((t) => t.nodeId);
    assert.ok(ids.includes("talent-availability"), q);
  }
});

test("accents fold and plurals fold", () => {
  assert.deepEqual(guideTokens("Sesión Cálida"), ["sesion", "calida"]);
  assert.ok(expandGuideTerm("horarios").includes("hour") || expandGuideTerm("horarios").includes("horario"));
});

test("every query word must match", () => {
  assert.deepEqual(searchGuideTopics(topics, "horario payouts").map((t) => t.nodeId), []);
});

test("empty and unknown queries return nothing", () => {
  assert.deepEqual(searchGuideTopics(topics, "  "), []);
  assert.deepEqual(searchGuideTopics(topics, "zzzqq"), []);
});

test("limit is honoured and ties keep input order", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ nodeId: `n${i}`, title: "Schedule", oneSentence: "", category: "" }));
  const out = searchGuideTopics(many, "horario", 3);
  assert.deepEqual(out.map((t) => t.nodeId), ["n0", "n1", "n2"]);
});
