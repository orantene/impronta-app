import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookingAssistantUsage,
  bookingAssistantUsageLine,
  formatAssistantCents,
} from "./usage-format";

describe("booking assistant usage formatting", () => {
  it("formats cents as dollars and clamps bad input", () => {
    assert.equal(formatAssistantCents(120), "$1.20");
    assert.equal(formatAssistantCents(0), "$0.00");
    assert.equal(formatAssistantCents(-5), "$0.00");
    assert.equal(formatAssistantCents(Number.NaN), "$0.00");
  });

  it("computes used, cap, remaining and percent per plan band", () => {
    assert.deepEqual(bookingAssistantUsage(120, "free"), {
      usedCents: 120,
      capCents: 500,
      remainingCents: 380,
      percentUsed: 24,
    });
    const paid = bookingAssistantUsage(500, "talent_pro");
    assert.equal(paid.capCents, 2000);
    assert.equal(paid.remainingCents, 1500);
    assert.equal(paid.percentUsed, 25);
  });

  it("never goes negative or past 100 percent once over the cap", () => {
    const over = bookingAssistantUsage(9000, null);
    assert.equal(over.remainingCents, 0);
    assert.equal(over.percentUsed, 100);
  });

  it("renders the one-line label in English and Spanish", () => {
    const u = bookingAssistantUsage(120, "free");
    assert.equal(bookingAssistantUsageLine(u, "en"), "Used this month: $1.20 of $5.00");
    assert.equal(bookingAssistantUsageLine(u, "es"), "Usado este mes: $1.20 de $5.00");
  });
});
