import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";
import {
  formatIncomeMoney,
  incomeSummaryStrings,
  resolveIncomeSummaryLocale,
  resolveIncomeSummaryYear,
  restrictEarningsToYear,
} from "@/lib/talent/income-summary";

function row(over: Partial<TalentEarningsRow> & { workDate: string }): TalentEarningsRow {
  return {
    id: over.id ?? over.workDate,
    bookingId: over.bookingId ?? "b",
    payoutDate: null,
    agencyName: "Agencia",
    client: "Cliente",
    grossCents: 1000,
    netCents: 900,
    status: "paid",
    source: "direct",
    paymentMethod: null,
    paymentStatus: null,
    collectedCents: null,
    collectedByMethod: null,
    clientFeeCents: null,
    ...over,
  } as TalentEarningsRow;
}

const bundle: TalentEarnings = {
  totals: { ytdGrossCents: 0, ytdNetCents: 0, pendingCents: 0, confirmedPipelineCents: 0, currency: "MXN" },
  perAgency: [
    { tenantId: "t1", slug: "a", name: "Agencia", ytdNetCents: 0, bookingsCount: 0, lastBookingAt: null, commissionBps: 0 },
    { tenantId: "t2", slug: "b", name: "Solo 2026", ytdNetCents: 0, bookingsCount: 0, lastBookingAt: null, commissionBps: 0 },
  ],
  rows: [
    row({ workDate: "2025-03-01", netCents: 10_000, grossCents: 12_000 }),
    row({ workDate: "2026-10-17", netCents: 47_000, grossCents: 50_000, agencyName: "Solo 2026", status: "pending" }),
  ],
};

describe("income summary year window (TUL-1243)", () => {
  it("a 2025 summary carries no 2026 rows, totals or agencies", () => {
    const out = restrictEarningsToYear(bundle, 2025);
    assert.equal(out.rows.length, 1);
    assert.equal(out.totals.ytdNetCents, 10_000);
    assert.equal(out.totals.ytdGrossCents, 12_000);
    assert.equal(out.totals.pendingCents, 0);
    assert.equal(out.totals.currency, "MXN");
    assert.deepEqual(out.perAgency.map((a) => a.name), ["Agencia"]);
    assert.equal(out.perAgency[0]!.lastBookingAt, "2025-03-01");
  });

  it("a year with no work is empty, not the other year's data", () => {
    const out = restrictEarningsToYear(bundle, 2024);
    assert.equal(out.rows.length, 0);
    assert.equal(out.totals.ytdNetCents, 0);
    assert.equal(out.perAgency.length, 0);
  });

  it("2026 keeps its pending amount", () => {
    const out = restrictEarningsToYear(bundle, 2026);
    assert.equal(out.totals.pendingCents, 47_000);
  });

  it("year param falls back when out of range", () => {
    assert.equal(resolveIncomeSummaryYear("2025", 2026), 2025);
    assert.equal(resolveIncomeSummaryYear("1999", 2026), 2026);
    assert.equal(resolveIncomeSummaryYear("abc", 2026), 2026);
    assert.equal(resolveIncomeSummaryYear(null, 2026), 2026);
  });
});

describe("income summary language", () => {
  it("es is fully Spanish and names the year in the title", () => {
    assert.equal(resolveIncomeSummaryLocale("es-MX"), "es");
    assert.equal(resolveIncomeSummaryLocale("en"), "en");
    assert.equal(resolveIncomeSummaryLocale(undefined), "en");
    const L = incomeSummaryStrings("es");
    assert.equal(L.title(2025), "Resumen de ingresos 2025");
    assert.match(L.disclaimer, /Tulala informa/);
    assert.equal(L.statusLabel("paid"), "Pagado");
    assert.doesNotMatch(L.disclaimer, /Tulala reports/);
  });

  it("en title keeps the year and uses no em dash", () => {
    const L = incomeSummaryStrings("en");
    assert.equal(L.title(2025), "Income Summary 2025");
    assert.doesNotMatch(L.disclaimer, /—/);
  });

  it("money keeps the account currency", () => {
    assert.match(formatIncomeMoney(47_000, "MXN", "es-MX"), /470/);
    assert.match(formatIncomeMoney(47_000, "MXN", "es-MX"), /\$/);
  });
});
