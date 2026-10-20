/**
 * TUL-1377: "Match me with a professional". Pure rules for who receives a job (up to 5, by
 * zone, rating, availability and rotation), who wins, when it widens, and what is masked.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MATCH_MAX_RECIPIENTS,
  MATCH_WIDEN_AFTER_MS,
  maskedContact,
  pickMatches,
  resolveAccept,
  shouldWiden,
  type MatchCandidate,
} from "./rules";

const c = (id: string, over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id, zones: ["tulum"], rating: 4.5, available: true, lastOfferedAt: null, ...over,
});
const job = { zone: "Tulum" };

test("at most 5 professionals receive a job", () => {
  const many = Array.from({ length: 9 }, (_, i) => c(`p${i}`));
  assert.equal(pickMatches(many, job).length, MATCH_MAX_RECIPIENTS);
  assert.equal(MATCH_MAX_RECIPIENTS, 5);
});

test("zone (case-insensitive), availability and a rating floor filter; unrated pros stay in", () => {
  const out = pickMatches(
    [c("ok"), c("far", { zones: ["merida"] }), c("busy", { available: false }), c("low", { rating: 2 }), c("new", { rating: null })],
    job,
  ).map((x) => x.id);
  assert.deepEqual(out.sort(), ["new", "ok"]);
});

test("no zone on the job means any zone", () => {
  assert.equal(pickMatches([c("a", { zones: ["merida"] })], { zone: null }).length, 1);
});

test("rotation: never or least recently offered goes first, rating breaks ties", () => {
  const out = pickMatches(
    [c("recent", { lastOfferedAt: "2026-10-20T10:00:00Z" }), c("old", { lastOfferedAt: "2026-10-01T10:00:00Z" }), c("never", { rating: 4 }), c("never5", { rating: 5 })],
    job,
  ).map((x) => x.id);
  assert.deepEqual(out, ["never5", "never", "old", "recent"]);
});

test("already-offered professionals are excluded when widening", () => {
  const out = pickMatches([c("a"), c("b")], job, { excludeIds: ["a"] }).map((x) => x.id);
  assert.deepEqual(out, ["b"]);
});

test("widens only when open, nobody accepted, and 2 hours passed since the last round", () => {
  const base = { status: "open" as const, roundStartedAtMs: 1_000_000 };
  assert.equal(shouldWiden(base, base.roundStartedAtMs + MATCH_WIDEN_AFTER_MS - 1), false);
  assert.equal(shouldWiden(base, base.roundStartedAtMs + MATCH_WIDEN_AFTER_MS), true);
  assert.equal(shouldWiden({ ...base, status: "accepted" }, 9e12), false);
  assert.equal(shouldWiden({ ...base, status: "cancelled" }, 9e12), false);
});

test("first to accept wins; later ones, non-recipients and closed jobs are refused", () => {
  const offered = ["a", "b"];
  assert.equal(resolveAccept({ status: "open", winnerId: null, offeredIds: offered }, "a"), "won");
  assert.equal(resolveAccept({ status: "accepted", winnerId: "a", offeredIds: offered }, "b"), "already_taken");
  assert.equal(resolveAccept({ status: "open", winnerId: null, offeredIds: offered }, "z"), "not_offered");
  assert.equal(resolveAccept({ status: "cancelled", winnerId: null, offeredIds: offered }, "a"), "closed");
});

test("contact details stay masked until the pro accepts; only the winner sees the client's", () => {
  const client = { name: "Sam", email: "sam@x.com", phone: "+52 984 000 0000" };
  assert.deepEqual(maskedContact(client, { status: "open", winnerId: null }, "a"), { name: "Sam" });
  assert.deepEqual(maskedContact(client, { status: "accepted", winnerId: "a" }, "b"), { name: "Sam" });
  assert.deepEqual(maskedContact(client, { status: "accepted", winnerId: "a" }, "a"), client);
});
