import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentClientRow } from "./clients-merge";
import { countClientsByFilter, filterClientsDirectory } from "./clients-directory";

const NOW = "2026-10-13T12:00:00.000Z";
const ago = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

function row(id: string, firstSeenAt: string | null, completedCount: number): TalentClientRow {
  return {
    id, name: id, firstSeenAt, completedCount, lastVisit: null, visitCount: 0,
    amountOwedCents: null, currency: null, conversationHref: null, source: "booking",
    phone: null, email: null, nextStartsAt: null, nextStatus: null, nextBookingHref: null, overdue: false,
  } as TalentClientRow;
}

describe("TUL-717 Nuevo chip matches the row badge", () => {
  const items = [row("recent", ago(3), 0), row("old-never-booked", ago(90), 0), row("done", ago(2), 1), row("nodate", null, 0)];
  it("counts only recent never-completed clients", () => {
    assert.equal(countClientsByFilter(items, NOW).fresh, 1);
  });
  it("filters to the same set", () => {
    const out = filterClientsDirectory({ items, filter: "fresh", query: "", nowIso: NOW });
    assert.deepEqual(out.map((r) => r.id), ["recent"]);
  });
});
