import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, test } from "node:test";

import type { TalentClientRow } from "@/lib/talent/clients-merge";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { talentOwedSummary } from "@/lib/talent/money-home";
import {
  ledgerClientsForSummary,
  OWED_UNKNOWN_TEXT,
  owedAmountText,
  resolveLedgerClients,
  type LedgerClientsState,
} from "./ledger-clients-state";

const rows = [{ id: "c1" }] as unknown as TalentClientRow[];

test("a successful read is ready and feeds the summary", async () => {
  const s = await resolveLedgerClients(async () => ({ ok: true, items: rows }));
  assert.equal(s.status, "ready");
  assert.equal(ledgerClientsForSummary(s), rows);
});

test("an ok:false read is an error, never an empty ledger (the $0 flip)", async () => {
  const s = await resolveLedgerClients(async () => ({ ok: false, error: "Could not load clients." }));
  assert.equal(s.status, "error");
  assert.equal(ledgerClientsForSummary(s), null);
});

test("a rejected or stalled read is an error, never stuck loading", async () => {
  const s = await resolveLedgerClients(async () => {
    throw new Error("did not settle within 4000ms");
  });
  assert.equal(s.status, "error");
});

test("PROOF amounts unchanged: talentOwedSummary on fixed fixtures gives the same pinned numbers whether rows arrive directly or through the ledger state", () => {
  const fixture = [
    { id: "a", amountOwedCents: 3000, currency: "USD", nextBookingHref: "/talent/bookings/a" },
    { id: "b", amountOwedCents: 2800, currency: "USD", nextBookingHref: "/talent/bookings/b" },
    { id: "c", amountOwedCents: 1000, currency: "USD", nextBookingHref: "/talent/bookings/c" },
    { id: "m", amountOwedCents: 50000, currency: "MXN", nextBookingHref: "/talent/bookings/m" },
  ] as unknown as TalentClientRow[];
  const golden = { cents: 6800, count: 3, currency: "USD", others: [{ currency: "MXN", cents: 50000 }] };
  const direct = talentOwedSummary({ clients: fixture, agendaOwed: [], currency: "USD" });
  const viaState = talentOwedSummary({
    clients: ledgerClientsForSummary({ status: "ready", items: fixture }),
    agendaOwed: [],
    currency: "USD",
  });
  assert.deepEqual(direct, golden);
  assert.deepEqual(viaState, golden);
  // a ready-but-empty ledger is a real $0; loading / error never reach the sum as rows
  assert.equal(talentOwedSummary({ clients: ledgerClientsForSummary({ status: "ready", items: [] }), agendaOwed: [], currency: "USD" }).cents, 0);
});

describe("owed figure display states (TUL-1242)", () => {
  const fmt = (c: number, cur: string) => formatDashboardMoneyCents(c, cur, "es");
  const row = (over: Record<string, unknown>) =>
    ({ id: "r", amountOwedCents: 0, currency: "MXN", nextBookingHref: "/talent/bookings/r", ...over }) as unknown as TalentClientRow;
  const show = (state: LedgerClientsState, rows: TalentClientRow[] | null, cur = "MXN") => {
    const s = talentOwedSummary({ clients: rows, agendaOwed: [], currency: cur });
    return owedAmountText(state, s.currency ? s : { cents: 0, currency: null }, fmt, cur);
  };
  const ready = (items: TalentClientRow[]): LedgerClientsState => ({ status: "ready", items });

  it("loading renders a dash, never 0", () => {
    assert.equal(show({ status: "loading" }, null), OWED_UNKNOWN_TEXT);
  });
  it("error renders a dash, never 0", () => {
    assert.equal(show({ status: "error" }, null), OWED_UNKNOWN_TEXT);
  });
  it("empty ledger is a real zero, in the page currency", () => {
    assert.equal(show(ready([]), []), "$0 MXN");
  });
  it("a client with 0 owed (paid in full) is zero", () => {
    assert.equal(show(ready([row({ amountOwedCents: 0 })]), [row({ amountOwedCents: 0 })]), "$0 MXN");
  });
  it("owed: MXN format is $500 MXN", () => {
    const rows = [row({ amountOwedCents: 50000 })];
    assert.equal(show(ready(rows), rows), "$500 MXN");
  });
  it("partial: only the remainder is shown", () => {
    const rows = [row({ amountOwedCents: 20000 }), row({ id: "p", amountOwedCents: 0 })];
    assert.equal(show(ready(rows), rows), "$200 MXN");
  });
  it("repeated loads are stable: every render before ready is a dash, the same ready ledger always gives the same text", () => {
    const rows = [row({ amountOwedCents: 50000 })];
    const sequence: Array<[LedgerClientsState, TalentClientRow[] | null]> = [
      [{ status: "loading" }, null],
      [{ status: "error" }, null],
      [{ status: "loading" }, null],
      [ready(rows), rows],
      [ready(rows), rows],
    ];
    const shown = sequence.map(([s, r]) => show(s, r));
    assert.deepEqual(shown, [OWED_UNKNOWN_TEXT, OWED_UNKNOWN_TEXT, OWED_UNKNOWN_TEXT, "$500 MXN", "$500 MXN"]);
    for (let i = 0; i < 50; i += 1) assert.equal(show(ready(rows), rows), "$500 MXN");
  });
});

test("loading feeds the summary null, so no number is shown", () => {
  assert.equal(ledgerClientsForSummary({ status: "loading" }), null);
});

test("Today and Money use the shared hook, not a bare loadTalentClients call", () => {
  const root = process.cwd();
  for (const rel of [
    "src/components/talent/money/MoneyHomePage.tsx",
    "src/components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.match(src, /useTalentLedgerClients\(/, `${rel} must use the hook`);
    assert.doesNotMatch(src, /loadTalentClients\(/, `${rel} must not call the action directly`);
  }
});
