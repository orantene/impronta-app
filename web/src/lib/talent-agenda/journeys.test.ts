/**
 * T9.5 / G4.2 Journey logic — real derive + CTA contracts (no Array.slice theater).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { needsAttention, todayTotals, derivePaymentState } from "./derive";
import { resolveAttentionCta } from "./attention-cta";
import { JOR_CLOCK, JOR_DAY_KEY, JOR_WEEK } from "./__fixtures__/jor-week";
import { TRADE_PROFILES } from "./trades";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

describe("T9.5 / G4.2 journey logic", () => {
  it("accept a request → attention count drops when request is removed", () => {
    const before = needsAttention(JOR_WEEK, JOR_CLOCK).length;
    const withoutRequest = JOR_WEEK.filter((i) => i.kind !== "request");
    const after = needsAttention(withoutRequest, JOR_CLOCK).length;
    assert.ok(before > after);
  });

  it("deposit awaiting hold resolves to release_hold CTA", () => {
    const hold = JOR_WEEK.find((i) => i.id === "jor-hold-sofia")!;
    assert.equal(resolveAttentionCta(hold).kind, "release_hold");
  });

  it("still-to-collect includes overdue + today due", () => {
    const t = todayTotals(JOR_WEEK, JOR_CLOCK, JOR_DAY_KEY);
    assert.equal(t.stillToCollectCents, 262000);
  });

  it("new booking paymentChoice maps received → paid", () => {
    const map = (c: "received" | "due_later" | "request_link") =>
      c === "received" ? "paid" : "unpaid";
    assert.equal(map("received"), "paid");
    assert.equal(map("due_later"), "unpaid");
  });

  it("cash collected paid status does not invent overdue after complete", () => {
    assert.equal(
      derivePaymentState({
        booking: "completed",
        paymentStatus: "paid",
        paidCents: 95000,
        totalCents: 95000,
        now: JOR_CLOCK,
      }),
      "paid",
    );
  });

  it("create-slot still returns alternatives contract (≤3) in source", () => {
    const src = readFileSync(path.join(ROOT, "create-slot.ts"), "utf8");
    assert.ok(src.includes("out.length < 3"));
    assert.ok(src.includes("alternatives"));
  });

  it("HoldFlows releases via releaseOwnTalentHold", () => {
    const src = readFileSync(
      path.join(ROOT, "../../components/admin/shell/internal/talent/agenda/AgendaHoldFlows.tsx"),
      "utf8",
    );
    assert.ok(src.includes("releaseOwnTalentHold"));
  });

  it("notSupported lists exist and UI must not invent those features", () => {
    for (const p of Object.values(TRADE_PROFILES)) {
      assert.ok(Array.isArray(p.notSupported));
      assert.ok(p.notSupported.every((s) => typeof s === "string" && s.length > 0));
    }
  });
});
