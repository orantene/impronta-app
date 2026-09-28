/**
 * WSF-B — resolveEffectiveBookingMode precedence (product rules §1):
 * master > service mode when set > talent default > platform default,
 * then readiness (instant falls back to request).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertInstantPosture,
  parseOfferingBookingMode,
  resolveEffectiveBookingMode,
} from "./instant-book-gates";

const r = (bookingMode: string | null | undefined, defaults: unknown, extra: object = {}) =>
  resolveEffectiveBookingMode({ offering: { bookingMode }, defaults, ...extra });

test("service mode, when set, wins over every default", () => {
  for (const posture of ["instant", "request", "inquiry", "on_demand", undefined]) {
    assert.deepEqual(r("instant", { bookingPosture: posture }), { mode: "instant", source: "offering" });
    assert.deepEqual(r("request", { bookingPosture: posture }), { mode: "request", source: "offering" });
    assert.deepEqual(r("inquiry", { bookingPosture: posture }), { mode: "inquiry", source: "offering" });
  }
});

test("null / undefined / junk service mode inherits the talent default", () => {
  assert.deepEqual(r(null, { bookingPosture: "instant" }), { mode: "instant", source: "default" });
  assert.deepEqual(r(null, { bookingPosture: "request" }), { mode: "request", source: "default" });
  assert.deepEqual(r(undefined, { bookingPosture: "inquiry" }), { mode: "inquiry", source: "default" });
  assert.deepEqual(r("bogus", { bookingPosture: "inquiry" }), { mode: "inquiry", source: "default" });
});

test("legacy on_demand default reads as instant (auditor ruling 0)", () => {
  assert.deepEqual(r(null, { bookingPosture: "on_demand" }), { mode: "instant", source: "default" });
  // Existing rows are explicit, so on_demand never changed them and still does not.
  assert.equal(r("instant", { bookingPosture: "on_demand" }).mode, "instant");
  assert.equal(r("request", { bookingPosture: "on_demand" }).mode, "request");
});

test("no default set falls to the platform default (instant, the old on_demand fallback)", () => {
  assert.deepEqual(r(null, {}), { mode: "instant", source: "platform" });
  assert.deepEqual(r(null, null), { mode: "instant", source: "platform" });
  assert.deepEqual(r(null, { bookingPosture: 3 }), { mode: "instant", source: "platform" });
});

test("Jor's case: on_demand default, service reset to null -> effective instant (readiness may still fall back)", () => {
  const jor = { bookingPosture: "on_demand", whoPrimaryCta: "confirm_now" };
  assert.deepEqual(r(null, jor), { mode: "instant", source: "default" });
  assert.equal(assertInstantPosture({ sellingDefaults: jor, bookingMode: null, staffDesk: false }).ok, true);
  assert.deepEqual(r(null, jor, { readiness: { instantReady: false } }), { mode: "request", source: "readiness" });
});

test("master restriction closes everything, before the service mode", () => {
  assert.deepEqual(r("instant", { bookingPosture: "instant" }, { accepting: false }), { mode: "closed", source: "master" });
  assert.deepEqual(r(null, { bookingPosture: "inquiry" }, { accepting: false }), { mode: "closed", source: "master" });
  assert.equal(r("instant", {}, { accepting: true }).mode, "instant");
  assert.equal(r("instant", {}, { accepting: null }).mode, "instant");
});

test("readiness: instant falls back to request; other modes untouched", () => {
  assert.deepEqual(r("instant", {}, { readiness: { instantReady: false } }), { mode: "request", source: "readiness" });
  assert.deepEqual(r(null, { bookingPosture: "instant" }, { readiness: { instantReady: false } }), {
    mode: "request",
    source: "readiness",
  });
  assert.deepEqual(r("instant", {}, { readiness: { instantReady: true } }), { mode: "instant", source: "offering" });
  assert.deepEqual(r("inquiry", {}, { readiness: { instantReady: false } }), { mode: "inquiry", source: "offering" });
});

test("server posture gate follows the same resolver (inherit + inquiry)", () => {
  assert.equal(assertInstantPosture({ sellingDefaults: { bookingPosture: "instant" }, bookingMode: null, staffDesk: false }).ok, true);
  const inq = assertInstantPosture({ sellingDefaults: {}, bookingMode: "inquiry", staffDesk: false });
  assert.equal(!inq.ok && inq.reason, "inquiry_only");
  const req = assertInstantPosture({ sellingDefaults: { bookingPosture: "request" }, bookingMode: null, staffDesk: false });
  assert.equal(!req.ok && req.reason, "request_only");
});

test("parseOfferingBookingMode accepts the three modes, null otherwise", () => {
  assert.equal(parseOfferingBookingMode("inquiry"), "inquiry");
  assert.equal(parseOfferingBookingMode("instant"), "instant");
  assert.equal(parseOfferingBookingMode("request"), "request");
  assert.equal(parseOfferingBookingMode(null), null);
  assert.equal(parseOfferingBookingMode("on_demand"), null);
});
