/** TUL-1466 consultant fixes: Mexico City month boundaries, a sales base that is never silently truncated, and refusal copy. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { RENT_COPY, rentRefusalText } from "./rent-copy";
import { currentRentPeriod, nextRentPeriodOf, zonedMonthStartUtc } from "./rent-cycle";
import { PAGE_SIZE, MAX_PAGES, sumSalesPages } from "./rent-sales-paging";

describe("months are Mexico City months", () => {
  test("the month starts at local midnight: 06:00 UTC (no DST since 2022)", () => {
    assert.equal(zonedMonthStartUtc("2026-10").toISOString(), "2026-10-01T06:00:00.000Z");
    assert.equal(zonedMonthStartUtc("2026-12").toISOString(), "2026-12-01T06:00:00.000Z");
    assert.equal(zonedMonthStartUtc("2027-01").toISOString(), "2027-01-01T06:00:00.000Z");
  });
  test("an order at 23:30 on Oct 31 Mexico time (05:30 UTC Nov 1) belongs to October, not November", () => {
    const lastMomentOfOct = new Date("2026-11-01T05:59:59Z").getTime();
    assert.ok(lastMomentOfOct >= zonedMonthStartUtc("2026-10").getTime() && lastMomentOfOct < zonedMonthStartUtc(nextRentPeriodOf("2026-10")).getTime());
  });
  test("the current period follows the same clock", () => {
    assert.equal(currentRentPeriod(new Date("2026-11-01T05:30:00Z")), "2026-10");
    assert.equal(currentRentPeriod(new Date("2026-11-01T06:00:00Z")), "2026-11");
  });
  test("next period rolls the year", () => {
    assert.equal(nextRentPeriodOf("2026-12"), "2027-01");
  });
});

describe("the sales base reads every page, or says it could not", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ total_cents: 1_000, refunded_cents: i % 2 === 0 ? 0 : 200 }));
  const pager = (all: Array<{ total_cents: number; refunded_cents: number }>, fail?: number) => async (from: number, to: number) => {
    if (fail !== undefined && from >= fail) return { rows: null, error: true };
    return { rows: all.slice(from, to + 1), error: false };
  };
  test("2,500 lines (beyond a 1,000 row cap) are all summed, net of refunds", async () => {
    const r = await sumSalesPages(pager(lines(2_500)));
    assert.equal(r, 1_250 * 1_000 + 1_250 * 800);
  });
  test("exactly one full page still reads the next (empty) page", async () => {
    assert.equal(await sumSalesPages(pager(lines(PAGE_SIZE))), PAGE_SIZE / 2 * 1_000 + PAGE_SIZE / 2 * 800);
  });
  test("a page that fails midway fails the whole base (no partial number)", async () => {
    assert.equal(await sumSalesPages(pager(lines(2_500), PAGE_SIZE)), null);
  });
  test("a month bigger than the safety cap fails closed instead of under-billing", async () => {
    const endless = async () => ({ rows: lines(PAGE_SIZE), error: false });
    assert.equal(await sumSalesPages(endless), null);
    assert.equal(MAX_PAGES * PAGE_SIZE >= 20_000, true);
  });
  test("a refund bigger than the line never makes a negative base", async () => {
    assert.equal(await sumSalesPages(async (from) => ({ rows: from === 0 ? [{ total_cents: 500, refunded_cents: 900 }] : [], error: false })), 0);
  });
});

describe("the base query (TUL-1702: paid time, net lines; behaviour in rent-sales-net.test.ts)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-sales-base.server.ts"), "utf8");
  test("this workspace, paid/fulfilled/partially_refunded, plan currency, the Mexico City month by PAID time, every read paged", () => {
    assert.match(src, /tenantScopedQuery\(admin, "order_lines", p\.tenantId\)/);
    assert.match(src, /\["paid", "fulfilled", "partially_refunded"\]/);
    assert.match(src, /\.eq\("currency", p\.currency\)/);
    assert.match(src, /zonedMonthStartUtc\(p\.period\)/);
    assert.match(src, /\.gte\("paid_at", from\)/);
    assert.match(src, /readAllPages</);
    assert.doesNotMatch(src, /created_at/, "orders count by when they were paid, not created");
  });
  test("rent invoices themselves are never part of the base", () => {
    assert.match(src, /o\.source_page !== "rent"/);
  });
});

describe("refusal copy for the three percentage-month outcomes", () => {
  for (const [reason, en, es] of [
    ["month_not_closed", "A percentage rent is billed once the month is over.", "La renta por porcentaje se cobra cuando termina el mes."],
    ["sales_unavailable", "Could not read this member's sales for that month. Nothing was issued. Try again.", "No se pudieron leer las ventas del miembro en ese mes. No se emitió nada. Inténtalo de nuevo."],
    ["nothing_due", "Nothing is due for that month.", "No hay nada que cobrar de ese mes."],
  ] as const) {
    test(reason, () => {
      assert.equal(rentRefusalText(reason, RENT_COPY.en), en);
      assert.equal(rentRefusalText(reason, RENT_COPY.es), es);
    });
  }
});

describe("the owner picks the month", () => {
  const card = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/settings/rent/RentCard.tsx"), "utf8");
  test("a month picker feeds issueRent, defaulting to the last closed month for a percentage plan", () => {
    assert.match(card, /data-testid="rent-issue-period"/);
    assert.match(card, /issueRent\(\{ planId: p\.id, period: issuePeriod\[p\.id\] \?\? defaultIssuePeriod\(p\.percentBps > 0\) \}\)/);
  });
});
