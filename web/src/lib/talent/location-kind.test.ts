import test from "node:test";
import assert from "node:assert/strict";
import { effectiveStudioKind } from "./location-kind";

const base = { saved: false, savedKind: "studio" as const, travelsToClients: false, tradeText: null };

test("a cleaner with no saved choice reads home visits, not studio", () => {
  assert.equal(effectiveStudioKind({ ...base, tradeText: "house-cleaner House cleaner" }), "home_visits");
  assert.equal(effectiveStudioKind({ ...base, tradeText: "limpieza" }), "home_visits");
});

test("travel-to areas imply home visits when nothing was saved", () => {
  assert.equal(effectiveStudioKind({ ...base, travelsToClients: true }), "home_visits");
});

test("a saved choice always wins", () => {
  assert.equal(effectiveStudioKind({ ...base, saved: true, tradeText: "cleaner", travelsToClients: true }), "studio");
});

test("an in-studio trade with no signals stays studio", () => {
  assert.equal(effectiveStudioKind({ ...base, tradeText: "nail-artist Nail Artist" }), "studio");
  assert.equal(effectiveStudioKind(base), "studio");
});
