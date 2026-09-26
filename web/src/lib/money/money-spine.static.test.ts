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
    assert.match(spine, /consumeMoneyLanding/);
    assert.match(outstanding, /Due by today/);
  });

  it("MoneySpine M4 wires payout detail, failed alternate, and account states", () => {
    const spine = readFileSync(join(moneyDir, "MoneySpine.tsx"), "utf8");
    const payouts = readFileSync(join(moneyDir, "MoneyPayoutsPanel.tsx"), "utf8");
    const detail = readFileSync(join(moneyDir, "PayoutDetailDrawer.tsx"), "utf8");
    const states = readFileSync(join(moneyDir, "PayoutAccountStatesSheet.tsx"), "utf8");
    assert.match(spine, /PayoutDetailDrawer/);
    assert.match(spine, /PayoutAccountStatesSheet/);
    assert.match(spine, /buildPayoutDetail/);
    assert.match(spine, /openAccountStates/);
    assert.match(payouts, /onOpen/);
    assert.match(detail, /data-money-payout-detail/);
    assert.match(detail, /Update payout account/);
    assert.match(detail, /Download statement/);
    assert.match(states, /Payout account and payout states/);
    assert.match(states, /Design reference/);
    assert.match(states, /onViewFailedPayout/);
  });
});

describe("Today money tiles M3", () => {
  it("Agenda Today wires ledger tiles and Money deep-link", () => {
    const today = readFileSync(
      join(here, "../../components/admin/shell/internal/talent/pages/TodayPage.tsx"),
      "utf8",
    );
    const agenda = readFileSync(
      join(here, "../../components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx"),
      "utf8",
    );
    assert.match(agenda, /todayMoneyTilesFromLedger/);
    assert.match(agenda, /moneyFromLedger/);
    assert.match(agenda, /pinMoneyLanding/);
    assert.match(agenda, /onOpenMoney/);
    assert.match(today, /onOpenMoney/);
    assert.equal(today.includes("moneyFromEarnings"), false);
    assert.equal(agenda.includes("moneyFromEarnings"), false);
    assert.equal(agenda.includes("stillToCollectCents"), false);
  });
});
