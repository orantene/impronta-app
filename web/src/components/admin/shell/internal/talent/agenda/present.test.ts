import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { needsAttention, todayTotals } from "@/lib/talent-agenda/derive";
import { JOR_CLOCK, JOR_DAY_KEY, JOR_WEEK } from "@/lib/talent-agenda/__fixtures__/jor-week";
import { LEDGER_CONTRACT_AGGREGATES } from "@/lib/money/september-ledger-contract";
import { todayMoneyTilesFromLedger } from "@/lib/money/today-money-tiles";

import { formatDualTimezoneWhen, moneyFromEarnings, moneyFromLedger, todayFromAgenda } from "./present";

describe("T4.1 Today V2 · Jor clock 09:50", () => {
  it("next up is Camila 10:00; rest is Ana then Lucía", () => {
    const { next, rest } = todayFromAgenda(JOR_WEEK, JOR_CLOCK);
    assert.equal(next?.id, "jor-today-1");
    assert.deepEqual(
      rest.map((item) => item.id),
      ["jor-today-2", "jor-today-3"],
    );
  });

  it("after Camila ends, next is Ana and rest excludes Camila", () => {
    const afterCamila = new Date("2026-09-23T11:30:00-05:00");
    const { next, rest } = todayFromAgenda(JOR_WEEK, afterCamila);
    assert.equal(next?.id, "jor-today-2");
    assert.deepEqual(
      rest.map((item) => item.id),
      ["jor-today-3"],
    );
  });

  it("attention count is 5; agenda still-to-collect matches ledger due_by_today cents", () => {
    assert.equal(needsAttention(JOR_WEEK, JOR_CLOCK).length, 5);
    const totals = todayTotals(JOR_WEEK, JOR_CLOCK, JOR_DAY_KEY);
    assert.equal(totals.appointmentsToday, 3);
    assert.equal(totals.bookedMinutes, 285);
    assert.equal(totals.stillToCollectCents, 262000);
    // Legacy helper kept for non-M3 callers; M3 uses moneyFromLedger.
    const money = moneyFromEarnings({
      collectedLabel: "not shared",
      stillToCollectCents: totals.stillToCollectCents,
      currency: "MXN",
      cardPayouts: false,
    });
    assert.equal(money.find((row) => row.id === "collect")?.value, "2620.00 MXN");
    assert.equal(money.find((row) => row.id === "payout")?.value, "No payout");
  });

  it("M3 tiles use Money ledger amounts (not earnings / invent)", () => {
    const landings: string[] = [];
    const items = moneyFromLedger({
      tiles: todayMoneyTilesFromLedger(),
      onOpen: (landing) => landings.push(`${landing.tab}:${landing.outFilt ?? ""}`),
    });
    assert.equal(items.find((r) => r.id === "collected")?.value, "$18,450 MXN");
    assert.equal(items.find((r) => r.id === "due_by_today")?.value, "$2,620 MXN");
    assert.equal(items.find((r) => r.id === "due_by_today")?.label, "Due by today");
    assert.equal(
      items.find((r) => r.id === "payout")?.value,
      `$${LEDGER_CONTRACT_AGGREGATES.next_payout_estimated.toLocaleString("en-US")} MXN`,
    );
    items.find((r) => r.id === "due_by_today")?.onClick?.();
    assert.deepEqual(landings, ["outstanding:today"]);
  });
});

describe("T2.5 dual timezone", () => {
  it("shows talent and client zones", () => {
    const label = formatDualTimezoneWhen(
      "2026-09-23T18:00:00.000Z",
      "2026-09-23T19:00:00.000Z",
      "America/Merida",
      "Europe/Madrid",
    );
    assert.match(label, /Merida/);
    assert.match(label, /Madrid/);
  });
});
