import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FIRST_DAY_STEPS } from "@/lib/talent-agenda/first-day";
import { TRADE_PROFILES } from "@/lib/talent-agenda/trades";
import {
  BUSINESS_ONBOARDING_NAMESPACE,
  BUSINESS_ONBOARDING_STEPS,
  KNOWN_READINESS_KEYS,
  resolveBusinessOnboarding,
} from "./business-onboarding-template";

const root = path.resolve(__dirname, "../../..");
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(root, "messages", `${l}.json`), "utf8"));

test("every step has en + es title and description under one namespace", () => {
  for (const l of ["en", "es"]) {
    const ns = load(l)[BUSINESS_ONBOARDING_NAMESPACE];
    assert.ok(ns, `${l} namespace`);
    for (const s of BUSINESS_ONBOARDING_STEPS) {
      assert.ok(ns[s.id]?.title?.trim(), `${l} ${s.id} title`);
      assert.ok(ns[s.id]?.description?.trim(), `${l} ${s.id} description`);
      assert.ok(!/[–—]/.test(ns[s.id].title + ns[s.id].description), `${l} ${s.id} no dashes`);
    }
  }
});

test("no step references a missing readiness key", () => {
  const known = new Set<string>(KNOWN_READINESS_KEYS);
  for (const k of FIRST_DAY_STEPS) assert.ok(known.has(k), k);
  for (const s of BUSINESS_ONBOARDING_STEPS) assert.ok(known.has(s.readinessKey), s.id);
});

test("step ids are unique and order is strictly increasing and stable", () => {
  const ids = BUSINESS_ONBOARDING_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const orders = BUSINESS_ONBOARDING_STEPS.map((s) => s.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  assert.equal(new Set(orders).size, orders.length);
  assert.deepEqual(
    resolveBusinessOnboarding("barber", {}).map((s) => s.id),
    resolveBusinessOnboarding("barber", {}).map((s) => s.id),
  );
});

test("trade applicability: team step skips solo-only trades, every trade gets the core steps", () => {
  for (const key of Object.keys(TRADE_PROFILES)) {
    const ids = resolveBusinessOnboarding(key, {}).map((s) => s.id);
    for (const core of ["basics", "services", "hours", "location", "photos", "payments", "preview", "publish"]) {
      assert.ok(ids.includes(core), `${key} ${core}`);
    }
  }
  assert.ok(resolveBusinessOnboarding("barber", {}).some((s) => s.id === "team"));
  assert.ok(!resolveBusinessOnboarding("tutor", {}).some((s) => s.id === "team"));
});

test("unknown trade falls back to the beauty-like default", () => {
  assert.deepEqual(
    resolveBusinessOnboarding("zzz-unknown", {}).map((s) => s.id),
    resolveBusinessOnboarding("beauty", {}).map((s) => s.id),
  );
  assert.deepEqual(
    resolveBusinessOnboarding(null, {}).map((s) => s.id),
    resolveBusinessOnboarding("beauty", {}).map((s) => s.id),
  );
});

test("completion is marked from facts and progress counts only applicable steps", () => {
  const empty = resolveBusinessOnboarding("barber", {});
  assert.ok(empty.every((s) => !s.done));
  const some = resolveBusinessOnboarding("barber", { services: true, availability: true });
  assert.deepEqual(some.filter((s) => s.done).map((s) => s.id), ["services", "hours"]);
  const all = Object.fromEntries(KNOWN_READINESS_KEYS.map((k) => [k, true]));
  assert.ok(resolveBusinessOnboarding("tutor", all).every((s) => s.done));
});
