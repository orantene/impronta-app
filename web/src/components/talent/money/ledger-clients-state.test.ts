import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { TalentClientRow } from "@/lib/talent/clients-merge";
import { talentOwedSummary } from "@/lib/talent/money-home";
import { ledgerClientsForSummary, resolveLedgerClients } from "./ledger-clients-state";

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
