import { test } from "node:test";
import assert from "node:assert/strict";
import {
  offerTimesFrom,
  parseBookingAssistantJson,
  pickOfferStarts,
  resolveAssistantAction,
} from "./structured";

const catalogIds = new Set(["off-1", "off-2"]);

test("parses a well-formed reply", () => {
  const p = parseBookingAssistantJson(
    '{"reply":"Sure","action":"offer_times","offering_id":"off-1","date":"2026-11-02"}',
  );
  assert.deepEqual(p, { reply: "Sure", action: "offer_times", offeringId: "off-1", date: "2026-11-02" });
});

test("parses a fenced reply and drops a malformed date", () => {
  const p = parseBookingAssistantJson('```json\n{"reply":"Hi","action":"answer","date":"next friday"}\n```');
  assert.deepEqual(p, { reply: "Hi", action: "answer", offeringId: null, date: null });
});

test("parse failures return null so the caller keeps the text path", () => {
  assert.equal(parseBookingAssistantJson("Just a plain sentence."), null);
  assert.equal(parseBookingAssistantJson("{not json"), null);
  assert.equal(parseBookingAssistantJson('{"reply":"x","action":"book_now"}'), null);
  assert.equal(parseBookingAssistantJson('{"action":"answer"}'), null);
  assert.equal(parseBookingAssistantJson("[]"), null);
});

test("offering_id outside the catalog leads to handoff", () => {
  const parsed = parseBookingAssistantJson('{"reply":"ok","action":"offer_times","offering_id":"made-up"}');
  assert.ok(parsed);
  assert.equal(resolveAssistantAction(parsed, { catalogIds, canOfferTimes: true }).kind, "handoff");
});

test("offer_times without an id leads to handoff", () => {
  const parsed = parseBookingAssistantJson('{"reply":"ok","action":"offer_times"}');
  assert.ok(parsed);
  assert.equal(resolveAssistantAction(parsed, { catalogIds, canOfferTimes: true }).kind, "handoff");
});

test("offer_times in inquiry mode leads to handoff even with a valid id", () => {
  const parsed = parseBookingAssistantJson('{"reply":"ok","action":"offer_times","offering_id":"off-1"}');
  assert.ok(parsed);
  assert.equal(resolveAssistantAction(parsed, { catalogIds, canOfferTimes: false }).kind, "handoff");
});

test("a catalog id with booking on resolves to offer_times", () => {
  const parsed = parseBookingAssistantJson('{"reply":"ok","action":"offer_times","offering_id":"off-2","date":"2026-11-02"}');
  assert.ok(parsed);
  assert.deepEqual(resolveAssistantAction(parsed, { catalogIds, canOfferTimes: true }), {
    kind: "offer_times",
    reply: "ok",
    offeringId: "off-2",
    date: "2026-11-02",
  });
});

test("offerTimesFrom ignores past or missing dates", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  assert.equal(offerTimesFrom(null, now), now);
  assert.equal(offerTimesFrom("2026-10-01", now), now);
  assert.equal(offerTimesFrom("2026-11-02", now).toISOString(), "2026-11-02T00:00:00.000Z");
});

test("pickOfferStarts keeps future, unique, sorted, capped starts", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const slots = [
    "2026-10-16T11:00:00Z",
    "2026-10-18T15:00:00Z",
    "2026-10-17T15:00:00Z",
    "2026-10-17T15:00:00Z",
    "2026-10-19T15:00:00Z",
  ];
  assert.deepEqual(pickOfferStarts(slots, now, 2), ["2026-10-17T15:00:00Z", "2026-10-18T15:00:00Z"]);
  assert.equal(pickOfferStarts(slots, now).length, 3);
});
