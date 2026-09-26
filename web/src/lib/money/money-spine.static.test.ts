/**
 * M2 static: Money page wires the visual spine, not legacy earnings KPI chrome.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const moneyDir = join(here, "../../components/talent/money");

describe("Money page M2 spine", () => {
  it("MoneyPage mounts MoneySpine and M1 subtitle clock", () => {
    const src = readFileSync(join(moneyDir, "MoneyPage.tsx"), "utf8");
    assert.match(src, /MoneySpine/);
    assert.match(src, /LEDGER_CONTRACT_CLOCK/);
    assert.equal(src.includes("CollectMethodsPanel"), false);
    assert.equal(src.includes("MoneyKpiStrip"), false);
    assert.equal(src.includes("EarningsLedger"), false);
    assert.equal(/Leave an agency/i.test(src), false);
  });

  it("MoneySpine exposes Payments / Outstanding / Payouts tabs and payment detail", () => {
    const spine = readFileSync(join(moneyDir, "MoneySpine.tsx"), "utf8");
    const outstanding = readFileSync(join(moneyDir, "MoneyOutstandingPanel.tsx"), "utf8");
    assert.match(spine, /Payments/);
    assert.match(spine, /Outstanding/);
    assert.match(spine, /Payouts/);
    assert.match(spine, /buildMoneySpineView/);
    assert.match(spine, /PaymentDetailDrawer/);
    assert.match(outstanding, /Due by today/);
  });
});
