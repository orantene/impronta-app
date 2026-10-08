import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientMergeKey,
  clientPickerHint,
  dedupeClientsByPerson,
  mergeClientHistory,
  upsertClient,
  type TalentClientRow,
} from "./clients-merge";

function row(partial: Partial<TalentClientRow> & Pick<TalentClientRow, "id" | "name">): TalentClientRow {
  const completed = partial.completedCount ?? partial.visitCount ?? 0;
  return {
    lastVisit: null,
    amountOwedCents: null,
    currency: null,
    conversationHref: null,
    source: "booking",
    phone: null,
    email: null,
    nextStartsAt: null,
    nextStatus: null,
    nextBookingHref: null,
    overdue: false,
    ...partial,
    completedCount: completed,
    visitCount: completed,
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
        completedCount: 1,
        lastVisit: "2026-09-23T15:00:00Z",
        amountOwedCents: 8_500_000,
        currency: "MXN",
      }),
      { inquiryId: null, accumulateVisit: true, countCompleted: true },
    );
    upsertClient(
      byKey,
      row({
        id: "booking:shared-uuid",
        name: "Camila Ruiz",
        completedCount: 1,
        lastVisit: "2026-09-23T15:00:00Z",
        amountOwedCents: null,
      }),
      { inquiryId: null, accumulateVisit: false },
    );
    assert.equal(byKey.size, 1);
    const camila = byKey.get("shared-uuid");
    assert.ok(camila);
    assert.equal(camila.completedCount, 1);
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
        completedCount: 1,
        amountOwedCents: 8_500_000,
        currency: "MXN",
        conversationHref: "/talent/inbox/inq-ana",
      }),
      { inquiryId: "inq-ana", accumulateVisit: true, countCompleted: true },
    );
    upsertClient(
      byKey,
      row({
        id: "booking:tb-other-uuid",
        name: "Ana López",
        completedCount: 1,
      }),
      { inquiryId: "inq-ana", accumulateVisit: false },
    );
    upsertClient(
      byKey,
      row({
        id: "inquiry:inq-ana",
        name: "Ana López",
        completedCount: 0,
        source: "inquiry",
        conversationHref: "/talent/inbox/inq-ana",
      }),
      { inquiryId: "inq-ana", accumulateVisit: false },
    );
    assert.equal(byKey.size, 1);
    const ana = byKey.get("inquiry:inq-ana");
    assert.ok(ana);
    assert.equal(ana.completedCount, 1);
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
        completedCount: 1,
        amountOwedCents: 100_00,
        currency: "MXN",
      }),
      { inquiryId: "inq-lucia", accumulateVisit: true, countCompleted: true },
    );
    upsertClient(
      byKey,
      row({
        id: "agency:v2",
        name: "Lucía Méndez",
        completedCount: 1,
        amountOwedCents: 200_00,
        currency: "MXN",
      }),
      { inquiryId: "inq-lucia", accumulateVisit: true, countCompleted: true },
    );
    const lucia = byKey.get("inquiry:inq-lucia");
    assert.ok(lucia);
    assert.equal(lucia.completedCount, 2);
    assert.equal(lucia.visitCount, 2);
    assert.equal(lucia.amountOwedCents, 300_00);
  });
});

describe("mergeClientHistory", () => {
  it("dedupes a booking and prefers the entry with money, newest first", () => {
    const base = { currency: "MXN", paymentStatus: null, past: true, href: "/x" } as const;
    const out = mergeClientHistory(
      [{ ...base, bookingId: "a", startsAt: "2026-09-01", amountCents: null }],
      [
        { ...base, bookingId: "a", startsAt: "2026-09-01", amountCents: 50000 },
        { ...base, bookingId: "b", startsAt: "2026-09-10", amountCents: null },
      ],
    );
    assert.deepEqual(
      out.map((h) => [h.bookingId, h.amountCents]),
      [
        ["b", null],
        ["a", 50000],
      ],
    );
  });
});

describe("dedupeClientsByPerson (F98)", () => {
  it("collapses one person across conversations by email or phone", () => {
    const rows = [
      row({ id: "inquiry:1", name: "Lucia Prueba", email: "Lucia@x.com" }),
      row({ id: "inquiry:2", name: "Lucia Prueba", email: "lucia@x.com", phone: "+52 998 111 2222" }),
      row({ id: "inquiry:3", name: "Lucia P", phone: "9981112222" }),
    ];
    const out = dedupeClientsByPerson(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.phone, "+52 998 111 2222");
  });

  it("keeps two different people who share a name, and hints with their contact", () => {
    const rows = [
      row({ id: "inquiry:1", name: "Ana Prueba", email: "ana1@x.com" }),
      row({ id: "inquiry:2", name: "Ana Prueba", email: "ana2@x.com" }),
      row({ id: "inquiry:3", name: "Sofia", email: "s@x.com" }),
    ];
    const out = dedupeClientsByPerson(rows);
    assert.equal(out.length, 3);
    assert.equal(clientPickerHint(out[0]!, out), "ana1@x.com");
    assert.equal(clientPickerHint(out[2]!, out), null);
  });

  it("never merges rows with no contact (a name alone is not identity)", () => {
    const rows = [row({ id: "a", name: "Mia" }), row({ id: "b", name: "Mia" })];
    assert.equal(dedupeClientsByPerson(rows).length, 2);
  });
});
