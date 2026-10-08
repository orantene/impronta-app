import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatDashboardMoney, formatDashboardMoneyCents } from "./dashboard-money-format";
import { listPrice } from "../talent/services-list-price";

const nb = (s: string) => s.replace(/ /g, " ");

describe("DS-17 finish: one format for MXN and USD talents, es and en", () => {
  it("cents helper matches the major-unit helper", () => {
    assert.equal(nb(formatDashboardMoneyCents(70000, "MXN", "es")), "$700 MXN");
    assert.equal(nb(formatDashboardMoneyCents(70000, "USD", "en")), "$700 USD");
    assert.equal(nb(formatDashboardMoneyCents(30050, "MXN", "en")), "$300.50 MXN");
  });
  it("zero amounts are consistent (no MX$0, US$0 or bare $0)", () => {
    for (const locale of ["es", "en"]) {
      assert.equal(nb(formatDashboardMoneyCents(0, "MXN", locale)), "$0 MXN");
      assert.equal(nb(formatDashboardMoneyCents(0, "USD", locale)), "$0 USD");
      assert.equal(nb(formatDashboardMoney(0, "MXN", locale, { wholeUnits: true })), "$0 MXN");
    }
  });
  it("Services list price uses the shared format in both locales", () => {
    const item = { amountCents: 30000, priceDisplay: "exact" as const, currency: "MXN" };
    assert.equal(nb(listPrice(item, "Quoted", "No price", "es")), "$300 MXN");
    assert.equal(nb(listPrice(item, "Quoted", "No price", "en")), "$300 MXN");
    assert.equal(nb(listPrice({ ...item, currency: "USD" }, "Quoted")), "$300 USD");
  });
});

const ROUTED = [
  "src/components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx",
  "src/components/admin/shell/internal/talent/agenda/view-model.ts",
  "src/components/admin/shell/internal/talent/pages/ClientsPage.tsx",
  "src/components/admin/shell/internal/talent/pages/TodayPage.tsx",
  "src/components/admin/shell/internal/talent/shared/today-2.tsx",
  "src/components/admin/shell/internal/talent/shared/earnings-tile-1.tsx",
  "src/components/talent/money/AgendaMoneyLine.tsx",
  "src/components/talent/money/MoneyHomePage.tsx",
  "src/components/talent/money/MoneyRecordPaymentPanel.tsx",
  "src/lib/talent/services-list-price.ts",
];

describe("DS-17 finish: routed files carry no raw money patterns", () => {
  for (const rel of ROUTED) {
    it(rel, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      assert.ok(!/MX\$/.test(src), "no MX$");
      assert.ok(!/US\$\d/.test(src), "no US$ amount");
      assert.ok(!/`\$\$\{/.test(src), "no template starting with a bare $");
    });
  }
});
