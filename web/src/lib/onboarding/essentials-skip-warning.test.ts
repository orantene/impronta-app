import assert from "node:assert/strict";
import test from "node:test";

import { defaultWeeklyHours } from "./essentials";
import { essentialsSkipWarning, resolveEssentialsForBuild } from "./essentials-resolve";

test("no services at all: the build reports essentials:no_services instead of staying silent", () => {
  const e = resolveEssentialsForBuild({ essentials: null, serviceFacts: [], discipline: null, tradeSlug: null, country: "MX", locale: "es" });
  assert.equal(e, null);
  assert.equal(essentialsSkipWarning(e), "essentials:no_services");
  assert.equal(essentialsSkipWarning(undefined), "essentials:no_services");
});

test("services read from the brief are kept and produce no warning", () => {
  const e = resolveEssentialsForBuild({ essentials: null, serviceFacts: ["Limpieza profunda"], discipline: null, tradeSlug: null, country: "MX", locale: "es" });
  assert.equal(essentialsSkipWarning(e), null);
  assert.deepEqual(e?.hours, defaultWeeklyHours());
});
