/**
 * TUL-969: the client hub prints every price through the one dashboard money
 * formatter (explicit currency code), never a local Intl currency style.
 * Run: node_modules/.bin/tsx --test src/lib/client-hub/hub-money-format.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";

describe("client hub money", () => {
  const page = readFileSync("src/app/client/hub/page.tsx", "utf8");
  const load = readFileSync("src/lib/client-hub/load-hub.ts", "utf8");
  it("uses the shared formatter, no local Intl currency", () => {
    assert.match(page, /formatDashboardMoneyCents/);
    assert.doesNotMatch(page, /style:\s*"currency"/);
    assert.doesNotMatch(load, /style:\s*"currency"/);
  });
  it("MXN and USD both carry their code, same shape", () => {
    assert.equal(formatDashboardMoneyCents(90000, "MXN", "en"), "$900 MXN");
    assert.equal(formatDashboardMoneyCents(5000, "USD", "en"), "$50 USD");
  });
});
