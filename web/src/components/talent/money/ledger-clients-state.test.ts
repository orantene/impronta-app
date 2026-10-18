import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { TalentClientRow } from "@/lib/talent/clients-merge";
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
