import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldWiden, MATCH_WIDEN_AFTER_MS } from "./rules";
import { maskJobText, matchOfferSummary, MATCH_SUMMARY_MAX, shapeMyRequests, shapeOffers } from "./views";

const req = (id: string, over: Record<string, unknown> = {}) => ({ id, description: "Clean my flat", zone: "Tulum", status: "open", created_at: "2026-10-20T10:00:00Z", winner_talent_id: null, tenant_id: "t1", ...over });

test("my requests: newest first, status mapped, winner name only once accepted", () => {
  const out = shapeMyRequests({
    requests: [req("a"), req("b", { status: "accepted", winner_talent_id: "p1", created_at: "2026-10-21T10:00:00Z" }), req("c", { status: "weird" })],
    offeredCounts: { a: 5, b: 3 },
    winnerNames: { p1: "Ana " },
  });
  assert.deepEqual(out.map((r) => r.id), ["b", "a", "c"]);
  assert.equal(out[0]!.proName, "Ana");
  assert.equal(out[0]!.status, "accepted");
  assert.equal(out[1]!.offeredCount, 5);
  assert.equal(out[1]!.proName, null);
  assert.equal(out[2]!.status, "open");
});

test("a request that is not accepted never shows a professional's name", () => {
  const out = shapeMyRequests({ requests: [req("a", { winner_talent_id: "p1" })], offeredCounts: {}, winnerNames: { p1: "Ana" } });
  assert.equal(out[0]!.proName, null);
});

test("offers: only still-offered jobs on OPEN requests, phone and email hidden, newest first", () => {
  const out = shapeOffers({
    offers: [
      { request_id: "a", offered_at: "2026-10-20T10:00:00Z", status: "offered" },
      { request_id: "b", offered_at: "2026-10-21T10:00:00Z", status: "offered" },
      { request_id: "c", offered_at: "2026-10-22T10:00:00Z", status: "closed" },
      { request_id: "d", offered_at: "2026-10-23T10:00:00Z", status: "offered" },
    ],
    requests: [
      req("a", { description: "Call me 984 123 4567 or ana@x.com" }),
      req("b"),
      req("c"),
      req("d", { status: "accepted" }),
    ],
    workspaceNames: { t1: "Tulum Cleaners" },
  });
  assert.deepEqual(out.map((o) => o.requestId), ["b", "a"]);
  assert.equal(out[1]!.description, "Call me [phone hidden] or [email hidden]");
  assert.equal(out[0]!.workspaceName, "Tulum Cleaners");
});

const RAW = "Need a DJ Saturday. Call +52 984 123 4567, mail ana.lopez@gmail.com, see https://instagram.com/ana_dj or tiktok.com/@anadj, wa.me/5219841234567, ping @ana_dj";

test("the professional never sees a way to reach the client: phones, emails, links, handles hidden", () => {
  const out = maskJobText(RAW);
  for (const leak of ["984", "ana.lopez", "gmail", "instagram", "tiktok", "ana_dj", "anadj", "5219841234567", "http", "@"]) {
    assert.ok(!out.includes(leak), `${leak} leaked: ${out}`);
  }
  assert.match(out, /^Need a DJ Saturday\. Call \[phone hidden\], mail \[email hidden\], see \[link hidden\]/);
  assert.equal(maskJobText("Clean my 2 bedroom flat for $1,200 on 2026-11-02"), "Clean my 2 bedroom flat for $1,200 on 2026-11-02");
});

test("offers mask the zone too (free text from the client)", () => {
  const [o] = shapeOffers({
    offers: [{ request_id: "a", offered_at: "2026-10-20T10:00:00Z", status: "offered" }],
    requests: [req("a", { zone: "Tulum, call 984 123 4567" })],
    workspaceNames: {},
  });
  assert.equal(o!.zone, "Tulum, call [phone hidden]");
});

test("bell summary: masked first, one line, cut to 140 with an ellipsis", () => {
  const s = matchOfferSummary(RAW);
  assert.ok(!/@|984|gmail|instagram|https?:/.test(s), s);
  assert.ok(s.length <= MATCH_SUMMARY_MAX);
  const long = matchOfferSummary(`${"word ".repeat(40)}ana@x.com`);
  assert.ok(long.endsWith("...") && long.length <= MATCH_SUMMARY_MAX && !long.includes("ana"));
  assert.equal(matchOfferSummary("  Clean\n\n my   flat "), "Clean my flat");
});

test("no candidate at all: the request says no one is available, never waiting, and is never widened", () => {
  const out = shapeMyRequests({
    requests: [req("none"), req("some"), req("done", { status: "accepted", winner_talent_id: "p1" }), req("gone", { status: "cancelled" })],
    offeredCounts: { some: 5, done: 5 },
    winnerNames: { p1: "Ana" },
  });
  const by = Object.fromEntries(out.map((r) => [r.id, r.noneAvailable]));
  assert.deepEqual(by, { none: true, some: false, done: false, gone: false });
  // Unknown counts (a failed read) never claim "no one available".
  assert.equal(shapeMyRequests({ requests: [req("none")], offeredCounts: {}, winnerNames: {}, countsKnown: false })[0]!.noneAvailable, false);
  const old = { status: "open" as const, roundStartedAtMs: 0 };
  assert.equal(shouldWiden({ ...old, offeredCount: 0 }, MATCH_WIDEN_AFTER_MS * 5), false);
  assert.equal(shouldWiden({ ...old, offeredCount: 5 }, MATCH_WIDEN_AFTER_MS * 5), true);
  assert.equal(shouldWiden(old, MATCH_WIDEN_AFTER_MS * 5), true, "unknown count: the server re-checks recipients itself");
});
