import test from "node:test";
import assert from "node:assert/strict";

import { ONBOARDING_FIXTURES, briefFromOnboardingFixture, fixtureById } from "./fixtures";
import { buildUnderstanding, decidePath } from "./understanding";
import { hoursFromPreset, normalizeWhatsapp, unknownQuestionTargets } from "./module-questions";

for (const fx of ONBOARDING_FIXTURES) {
  test(`understood card · ${fx.id}`, () => {
    const u = buildUnderstanding({ brief: briefFromOnboardingFixture(fx), intent: fx.intent });
    assert.equal(u.path, fx.expect.path);
    assert.equal(u.pathConfidence, fx.expect.pathConfidence);
    assert.deepEqual(u.followUps, [...fx.expect.followUps], `follow-ups for ${fx.id}`);
    const by = (s: string) => u.lines.filter((l) => l.status === s).map((l) => l.id).sort();
    assert.deepEqual(by("known"), [...fx.expect.known].sort());
    assert.deepEqual(by("assumed"), [...fx.expect.assumed].sort());
    assert.deepEqual(by("missing"), [...fx.expect.missing].sort());
    assert.equal(u.linkName?.slug ?? null, fx.expect.linkSlug);
    assert.equal(u.tooLittle, false);
  });
}

test("a confirmed fact is known; an edited fact is user_stated and known", () => {
  const fx = fixtureById("rosa");
  const brief = briefFromOnboardingFixture(fx);
  brief.facts.push({ factKey: "person.professional_name", value: "Rosa", source: "user_stated", status: "confirmed", confidence: 1, sourceExcerpt: null, sourceUrl: null, questionId: null, questionVersion: null, updatedAt: "" });
  const u = buildUnderstanding({ brief, intent: "talent" });
  assert.equal(u.lines.find((l) => l.id === "name")?.status, "known");
  assert.equal(u.lines.find((l) => l.id === "name")?.value, "Rosa");
  assert.deepEqual(u.followUps, []);
  assert.equal(u.linkName?.slug, "rosa");
});

test("no signal at all: unknown intent asks the fork; a CTA intent decides", () => {
  const empty = briefFromOnboardingFixture({ ...fixtureById("rosa"), facts: [] });
  assert.deepEqual(decidePath(empty, "unknown", null), { path: "talent", pathConfidence: "ambiguous", pathSource: "intent" });
  assert.equal(decidePath(empty, "business", null).path, "business");
  assert.equal(decidePath(empty, "unknown", "both").pathSource, "user");
  const u = buildUnderstanding({ brief: empty, intent: "unknown" });
  assert.equal(u.followUps[0], "fork");
  assert.equal(u.tooLittle, true);
});

test("logo is never asked: it is a 'later' line on the business card", () => {
  const u = buildUnderstanding({ brief: briefFromOnboardingFixture(fixtureById("el-paisa")), intent: "business" });
  assert.equal(u.lines.find((l) => l.id === "logo")?.status, "later");
  assert.ok(!u.followUps.includes("two_quick_things"));
});

test("question targets are real fact keys; hours presets and WhatsApp normalise", () => {
  assert.deepEqual(unknownQuestionTargets(), []);
  assert.deepEqual(hoursFromPreset("by_appointment", "es"), ["Con cita"]);
  assert.equal(normalizeWhatsapp("+52 998 123 4567"), "+529981234567");
  assert.equal(normalizeWhatsapp("(998) 123-4567"), null, "no country code, no guess");
  assert.equal(normalizeWhatsapp("00 52 998 123 4567"), "+529981234567");
  assert.equal(normalizeWhatsapp("hola"), null);
  assert.equal(normalizeWhatsapp("+1"), null);
});
