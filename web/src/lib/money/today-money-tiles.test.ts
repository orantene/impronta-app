/**
 * M3 Today tiles — amounts and Due-by-today landing from the M1 ledger only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { LEDGER_CONTRACT_AGGREGATES } from "./september-ledger-contract";
import { parseMoneyLanding, serializeMoneyLanding } from "./today-money-tiles";
import { todayMoneyTilesFromLedger } from "./today-money-tiles.fixture";

// These tests exercise the September FIXTURE tiles, which are demo/QA-only.

describe("Today money tiles (M3)", () => {
  it("amounts match LEDGER-CONTRACT via the Money spine view", () => {
    const tiles = todayMoneyTilesFromLedger();
    const a = LEDGER_CONTRACT_AGGREGATES;
    const collected = tiles.find((t) => t.id === "collected");
    const due = tiles.find((t) => t.id === "due_by_today");
    const payout = tiles.find((t) => t.id === "payout");
    assert.ok(collected && due && payout);
    assert.equal(collected.amountMajor, a.collected_gross);
    assert.equal(due.amountMajor, a.due_by_today);
    assert.equal(payout.amountMajor, a.next_payout_estimated);
    assert.equal(collected.amountLabel, "$18,450 MXN");
    assert.equal(due.amountLabel, "$2,620 MXN");
    assert.equal(payout.amountLabel, "$5,784 MXN");
    assert.match(collected.linesEn, /24 payments/);
    assert.match(due.linesEn, /\$620 overdue/);
    assert.match(due.linesEn, /\$2,000 due today/);
  });

  it("Due by today lands on Outstanding filter today (mc_out_today)", () => {
    const due = todayMoneyTilesFromLedger().find((t) => t.id === "due_by_today");
    assert.deepEqual(due?.landing, { tab: "outstanding", outFilt: "today" });
    assert.equal(due?.labelEn, "Due by today");
    assert.equal(due?.labelEs, "Por cobrar hasta hoy");
  });

  it("Collected and next payout land on Payments and Payouts", () => {
    const tiles = todayMoneyTilesFromLedger();
    assert.deepEqual(tiles.find((t) => t.id === "collected")?.landing, { tab: "payments" });
    assert.deepEqual(tiles.find((t) => t.id === "payout")?.landing, { tab: "payouts" });
    assert.equal(tiles.find((t) => t.id === "payout")?.labelEn, "Next payout · estimated");
  });

  it("serializes the due-by-today landing for MoneySpine", () => {
    const raw = serializeMoneyLanding({ tab: "outstanding", outFilt: "today" });
    assert.deepEqual(parseMoneyLanding(raw), { tab: "outstanding", outFilt: "today" });
    assert.equal(parseMoneyLanding("nope"), null);
  });
});

it("the production tiles module never imports the fixture read model (TUL-1178)", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "today-money-tiles.ts"), "utf8");
  assert.doesNotMatch(src, /^import\s+(?!type\b)[^;]*money-spine-view/m);
  assert.doesNotMatch(src, /september-ledger/);
  assert.equal(src.includes("todayMoneyTilesFromLedger"), false);
});
