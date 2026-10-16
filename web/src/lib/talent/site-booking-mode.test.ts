import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inheritedModeLabel,
  overrideBadgeLabel,
  overrideWarning,
  siteBookingModeView,
  sitePostureOf,
} from "./site-booking-mode";

test("site posture: unset or junk reads as the platform default instant", () => {
  assert.deepEqual(sitePostureOf(undefined), { posture: "instant", source: "platform" });
  assert.deepEqual(sitePostureOf(null), { posture: "instant", source: "platform" });
  assert.deepEqual(sitePostureOf("nonsense"), { posture: "instant", source: "platform" });
  assert.deepEqual(sitePostureOf("request"), { posture: "request", source: "talent" });
  assert.deepEqual(sitePostureOf("on_demand"), { posture: "instant", source: "talent" });
});

test("inheriting service shows the effective mode, never reads as off", () => {
  const v = siteBookingModeView(null, "instant");
  assert.equal(v.effective, "instant");
  assert.equal(v.inherited, true);
  assert.equal(v.overridesSite, false);
  assert.equal(siteBookingModeView(undefined, "request").effective, "request");
});

test("own mode equal to the site mode is not an override", () => {
  const v = siteBookingModeView("request", "request");
  assert.equal(v.inherited, false);
  assert.equal(v.overridesSite, false);
});

test("own mode that differs from the site mode is an override", () => {
  const v = siteBookingModeView("instant", "request");
  assert.equal(v.effective, "instant");
  assert.equal(v.overridesSite, true);
  assert.equal(siteBookingModeView("inquiry", "instant").overridesSite, true);
});

test("copy is bilingual and has no em dashes", () => {
  assert.equal(overrideBadgeLabel("instant", "en"), "Overrides your site setting: Instant");
  assert.equal(overrideBadgeLabel("instant", "es"), "Cambia el ajuste de tu sitio: Inmediata");
  assert.equal(inheritedModeLabel("instant", "en"), "Instant (site setting)");
  assert.equal(inheritedModeLabel("request", "es"), "Por solicitud (ajuste del sitio)");
  for (const loc of ["en", "es"]) {
    assert.ok(overrideWarning(loc).length > 10);
    assert.doesNotMatch(overrideWarning(loc) + overrideBadgeLabel("request", loc), /—/);
  }
  assert.equal(overrideWarning("en"), "This service books differently from your site setting.");
});
