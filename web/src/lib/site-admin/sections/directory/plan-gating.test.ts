import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveDirectoryInstanceCap,
  evaluateDirectoryInstanceAdd,
} from "./meta";
import { directorySchemaV1 } from "./schema";

test("instance cap: Free=0, Studio=1, Agency/Network/unknown=unlimited", () => {
  assert.equal(resolveDirectoryInstanceCap("free"), 0);
  assert.equal(resolveDirectoryInstanceCap("studio"), 1);
  assert.equal(resolveDirectoryInstanceCap("agency"), null);
  assert.equal(resolveDirectoryInstanceCap("network"), null);
  assert.equal(resolveDirectoryInstanceCap("legacy"), null);
  // tolerant of casing / null / unknown → treated as paid-unlimited
  assert.equal(resolveDirectoryInstanceCap("STUDIO"), 1);
  assert.equal(resolveDirectoryInstanceCap(null), null);
  assert.equal(resolveDirectoryInstanceCap(undefined), null);
  assert.equal(resolveDirectoryInstanceCap("enterprise"), null);
});

test("Free plan can never add a dedicated directory instance", () => {
  const r = evaluateDirectoryInstanceAdd({ planTier: "free", current: 0 });
  assert.equal(r.cap, 0);
  assert.equal(r.canAdd, false);
  assert.match(r.reason ?? "", /Upgrade to Studio/);
  // no em dashes in operator copy
  assert.ok(!(r.reason ?? "").includes("—"));
});

test("Studio allows exactly one directory instance", () => {
  const first = evaluateDirectoryInstanceAdd({ planTier: "studio", current: 0 });
  assert.equal(first.canAdd, true);
  assert.equal(first.reason, null);

  const second = evaluateDirectoryInstanceAdd({ planTier: "studio", current: 1 });
  assert.equal(second.canAdd, false);
  assert.match(second.reason ?? "", /Upgrade to Agency/);
});

test("Agency (unlimited) always allows another instance", () => {
  const r = evaluateDirectoryInstanceAdd({ planTier: "agency", current: 99 });
  assert.equal(r.cap, null);
  assert.equal(r.canAdd, true);
  assert.equal(r.reason, null);
});

test("count is clamped to a non-negative integer", () => {
  const r = evaluateDirectoryInstanceAdd({ planTier: "studio", current: -3 });
  assert.equal(r.current, 0);
  assert.equal(r.canAdd, true);
});

test("schema accepts an optional cardKitOverride slug as plain data", () => {
  const ok = directorySchemaV1.safeParse({ cardKitOverride: "editorial-noir" });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.cardKitOverride, "editorial-noir");

  // unset → undefined (inherit), never a bogus default
  const unset = directorySchemaV1.safeParse({});
  assert.equal(unset.success, true);
  if (unset.success) assert.equal(unset.data.cardKitOverride, undefined);
});
