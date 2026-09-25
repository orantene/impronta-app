import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { needsAttention, todayTotals } from "@/lib/talent-agenda/derive";
import { JOR_CLOCK, JOR_DAY_KEY, JOR_WEEK } from "@/lib/talent-agenda/__fixtures__/jor-week";

import { formatDualTimezoneWhen, moneyFromEarnings, todayFromAgenda } from "./present";

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

  it("attention count is 5; still-to-collect is 2620 MXN cents", () => {
    assert.equal(needsAttention(JOR_WEEK, JOR_CLOCK).length, 5);
    const totals = todayTotals(JOR_WEEK, JOR_CLOCK, JOR_DAY_KEY);
    assert.equal(totals.appointmentsToday, 3);
    assert.equal(totals.bookedMinutes, 285);
    assert.equal(totals.stillToCollectCents, 262000);
    const money = moneyFromEarnings({
      collectedLabel: "not shared",
      stillToCollectCents: totals.stillToCollectCents,
      currency: "MXN",
      cardPayouts: false,
    });
    assert.equal(money.find((row) => row.id === "collect")?.value, "2620.00 MXN");
    assert.equal(money.find((row) => row.id === "payout")?.value, "No payout");
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
