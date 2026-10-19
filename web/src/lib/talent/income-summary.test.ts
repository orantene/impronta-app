import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";
import {
  formatIncomeMoney,
  incomeSummaryStrings,
  paidOutNetCents,
  resolveIncomeSummaryLocale,
  resolveIncomeSummaryYear,
  restrictEarningsToYear,
} from "@/lib/talent/income-summary";

function row(over: Partial<TalentEarningsRow> & { id: string; workDate: string }): TalentEarningsRow {
  return {
    bookingId: over.id,
    payoutDate: null,
    agencyName: "Agencia",
    tenantId: "t1",
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

function bundleOf(rows: TalentEarningsRow[], perAgency: TalentEarnings["perAgency"]): TalentEarnings {
  return {
    totals: { ytdGrossCents: 0, ytdNetCents: 0, pendingCents: 0, confirmedPipelineCents: 0, currency: "MXN" },
    perAgency,
    rows,
  };
}

const agency = (tenantId: string, name: string) => ({
  tenantId, slug: tenantId, name, ytdNetCents: 0, bookingsCount: 0, lastBookingAt: null, commissionBps: 0,
});

// Fixed fixtures (printed in the PR body): B3 is worked 2025-12-30 and paid 2026-01-05.
const FIXTURE_ROWS: TalentEarningsRow[] = [
  row({ id: "B1", workDate: "2025-03-01", payoutDate: "2025-03-04", netCents: 10_000, grossCents: 12_000 }),
  row({ id: "B2", workDate: "2025-11-20", payoutDate: "2025-11-24", netCents: 20_000, grossCents: 24_000 }),
  row({ id: "B3", workDate: "2025-12-30", payoutDate: "2026-01-05", netCents: 30_000, grossCents: 36_000 }),
  row({ id: "B4", workDate: "2026-10-17", payoutDate: null, netCents: 47_000, grossCents: 50_000, status: "pending" }),
];
const bundle = bundleOf(FIXTURE_ROWS, [agency("t1", "Agencia")]);

const sum = (rows: TalentEarningsRow[], k: "netCents" | "grossCents") => rows.reduce((s, r) => s + r[k], 0);

describe("income summary year window and basis (TUL-1243)", () => {
  it("worked basis: a Dec-worked / Jan-paid booking counts in the work year only, once", () => {
    const y25 = restrictEarningsToYear(bundle, 2025, "worked");
    const y26 = restrictEarningsToYear(bundle, 2026, "worked");
    assert.deepEqual(y25.rows.map((r) => r.id), ["B1", "B2", "B3"]);
    assert.deepEqual(y26.rows.map((r) => r.id), ["B4"]);
    assert.equal(y25.totals.ytdNetCents, 60_000);
    assert.equal(y26.totals.ytdNetCents, 47_000);
    // Nothing dropped, nothing doubled across the two years.
    assert.equal(y25.rows.length + y26.rows.length, FIXTURE_ROWS.length);
  });

  it("paid basis: the same booking counts in the payout year only, once", () => {
    const p25 = restrictEarningsToYear(bundle, 2025, "paid");
    const p26 = restrictEarningsToYear(bundle, 2026, "paid");
    assert.deepEqual(p25.rows.map((r) => r.id), ["B1", "B2"]);
    assert.deepEqual(p26.rows.map((r) => r.id), ["B3"]);
    assert.equal(paidOutNetCents(bundle, 2025), 30_000);
    assert.equal(paidOutNetCents(bundle, 2026), 30_000);
  });

  it("totals equal the sum of that year's rows (2025 and 2026, both bases)", () => {
    for (const basis of ["worked", "paid"] as const) {
      for (const year of [2025, 2026]) {
        const out = restrictEarningsToYear(bundle, year, basis);
        assert.equal(out.totals.ytdNetCents, sum(out.rows, "netCents"), `${basis} ${year} net`);
        assert.equal(out.totals.ytdGrossCents, sum(out.rows, "grossCents"), `${basis} ${year} gross`);
        assert.equal(out.perAgency.reduce((s, a) => s + a.ytdNetCents, 0), out.totals.ytdNetCents);
      }
    }
  });

  it("evidence table: before (lower bound only) vs after (year window)", () => {
    // "Before": year=2025 summed every row on or after Jan 1 2025, so 2026 data leaked in.
    const before = sum(FIXTURE_ROWS, "netCents");
    const after = restrictEarningsToYear(bundle, 2025, "worked").totals.ytdNetCents;
    const lines = ["row  worked      paid        net     in 2025(worked)  in 2025(paid)"];
    for (const r of FIXTURE_ROWS) {
      lines.push(
        `${r.id.padEnd(4)} ${r.workDate}  ${(r.payoutDate ?? "-").padEnd(10)}  ${String(r.netCents).padStart(6)}  ${String(r.workDate.startsWith("2025")).padEnd(15)}  ${String((r.payoutDate ?? "").startsWith("2025"))}`,
      );
    }
    lines.push(`2025 net BEFORE=${before} (sum of all rows, 2026 leaked)  AFTER=${after} (= sum of 2025 rows)`);
    console.log(lines.join("\n"));
    assert.equal(before, 107_000);
    assert.equal(after, 60_000);
  });

  it("two agencies sharing a display name stay two rows with their own sums", () => {
    const rows = [
      row({ id: "X1", workDate: "2025-02-01", agencyName: "Studio", tenantId: "ta", netCents: 5_000 }),
      row({ id: "X2", workDate: "2025-04-01", agencyName: "Studio", tenantId: "tb", netCents: 7_000 }),
      row({ id: "X3", workDate: "2025-05-01", agencyName: "Studio", tenantId: "tb", netCents: 1_000 }),
    ];
    const out = restrictEarningsToYear(bundleOf(rows, [agency("ta", "Studio"), agency("tb", "Studio")]), 2025);
    assert.equal(out.perAgency.length, 2);
    const a = out.perAgency.find((p) => p.tenantId === "ta")!;
    const b = out.perAgency.find((p) => p.tenantId === "tb")!;
    assert.equal(a.ytdNetCents, 5_000);
    assert.equal(a.bookingsCount, 1);
    assert.equal(b.ytdNetCents, 8_000);
    assert.equal(b.bookingsCount, 2);
    assert.equal(b.lastBookingAt, "2025-05-01");
  });

  it("an agency with no rows in the year is dropped; an empty year is empty", () => {
    const out = restrictEarningsToYear(bundle, 2024);
    assert.equal(out.rows.length, 0);
    assert.equal(out.totals.ytdNetCents, 0);
    assert.equal(out.perAgency.length, 0);
  });

  it("2026 worked keeps its pending amount", () => {
    assert.equal(restrictEarningsToYear(bundle, 2026).totals.pendingCents, 47_000);
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
    assert.match(L.paidOut(2025), /por fecha de pago/);
    assert.doesNotMatch(L.disclaimer, /Tulala reports/);
  });

  it("en title keeps the year, states the basis and uses no em dash", () => {
    const L = incomeSummaryStrings("en");
    assert.equal(L.title(2025), "Income Summary 2025");
    assert.match(L.paidOut(2025), /by payout date/);
    assert.doesNotMatch(L.disclaimer + L.basisNote, /—/);
  });

  it("money keeps the account currency", () => {
    assert.match(formatIncomeMoney(47_000, "MXN", "es-MX"), /470/);
    assert.match(formatIncomeMoney(47_000, "MXN", "es-MX"), /\$/);
  });
});
