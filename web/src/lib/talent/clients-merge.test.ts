import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientMergeKey,
  upsertClient,
  type TalentClientRow,
} from "./clients-merge";

function row(partial: Partial<TalentClientRow> & Pick<TalentClientRow, "id" | "name">): TalentClientRow {
  return {
    lastVisit: null,
    visitCount: 0,
    amountOwedCents: null,
    currency: null,
    conversationHref: null,
    source: "booking",
    ...partial,
  };
}

describe("clientMergeKey", () => {
  it("prefers inquiry id over booking/agency prefixes", () => {
    assert.equal(
      clientMergeKey({ prefixedId: "agency:aaa", inquiryId: "inq-1" }),
      "inquiry:inq-1",
    );
    assert.equal(
      clientMergeKey({ prefixedId: "booking:bbb", inquiryId: "inq-1" }),
      "inquiry:inq-1",
    );
  });

  it("collapses booking:X and agency:X to the same bare uuid", () => {
    const a = clientMergeKey({ prefixedId: "agency:shared-uuid", inquiryId: null });
    const b = clientMergeKey({ prefixedId: "booking:shared-uuid", inquiryId: null });
    assert.equal(a, "shared-uuid");
    assert.equal(b, "shared-uuid");
  });

  it("keeps distinct booking uuids separate when no inquiry (two Anas)", () => {
    const anaA = clientMergeKey({ prefixedId: "agency:ana-a", inquiryId: null });
    const anaB = clientMergeKey({ prefixedId: "agency:ana-b", inquiryId: null });
    assert.notEqual(anaA, anaB);
  });
});

describe("upsertClient mirror collapse", () => {
  it("merges shared-PK talent+agency into one row with money and one visit", () => {
    const byKey = new Map<string, TalentClientRow>();
    upsertClient(
      byKey,
      row({
        id: "agency:shared-uuid",
        name: "Camila Ruiz",
        visitCount: 1,
        lastVisit: "2026-09-23T15:00:00Z",
        amountOwedCents: 8_500_000,
        currency: "MXN",
      }),
      { inquiryId: null, accumulateVisit: true },
    );
    upsertClient(
      byKey,
      row({
        id: "booking:shared-uuid",
        name: "Camila Ruiz",
        visitCount: 1,
        lastVisit: "2026-09-23T15:00:00Z",
        amountOwedCents: null,
      }),
      { inquiryId: null, accumulateVisit: false },
    );
    assert.equal(byKey.size, 1);
    const camila = byKey.get("shared-uuid");
    assert.ok(camila);
    assert.equal(camila.visitCount, 1);
    assert.equal(camila.amountOwedCents, 8_500_000);
    assert.equal(camila.currency, "MXN");
  });

  it("merges agency + talent + inquiry stub on the same inquiry id", () => {
    const byKey = new Map<string, TalentClientRow>();
    upsertClient(
      byKey,
      row({
        id: "agency:ag-1",
        name: "Ana López",
        visitCount: 1,
        amountOwedCents: 8_500_000,
        currency: "MXN",
        conversationHref: "/talent/inbox/inq-ana",
      }),
      { inquiryId: "inq-ana", accumulateVisit: true },
    );
    upsertClient(
      byKey,
      row({
        id: "booking:tb-other-uuid",
        name: "Ana López",
        visitCount: 1,
      }),
      { inquiryId: "inq-ana", accumulateVisit: false },
    );
    upsertClient(
      byKey,
      row({
        id: "inquiry:inq-ana",
        name: "Ana López",
        visitCount: 0,
        source: "inquiry",
        conversationHref: "/talent/inbox/inq-ana",
      }),
      { inquiryId: "inq-ana", accumulateVisit: false },
    );
    assert.equal(byKey.size, 1);
    const ana = byKey.get("inquiry:inq-ana");
    assert.ok(ana);
    assert.equal(ana.visitCount, 1);
    assert.equal(ana.amountOwedCents, 8_500_000);
    assert.equal(ana.source, "booking");
  });

  it("accumulates visits across two agency bookings for one inquiry", () => {
    const byKey = new Map<string, TalentClientRow>();
    upsertClient(
      byKey,
      row({
        id: "agency:v1",
        name: "Lucía Méndez",
        visitCount: 1,
        amountOwedCents: 100_00,
        currency: "MXN",
      }),
      { inquiryId: "inq-lucia", accumulateVisit: true },
    );
    upsertClient(
      byKey,
      row({
        id: "agency:v2",
        name: "Lucía Méndez",
        visitCount: 1,
        amountOwedCents: 200_00,
        currency: "MXN",
      }),
      { inquiryId: "inq-lucia", accumulateVisit: true },
    );
    const lucia = byKey.get("inquiry:inq-lucia");
    assert.ok(lucia);
    assert.equal(lucia.visitCount, 2);
    assert.equal(lucia.amountOwedCents, 300_00);
  });
});
