import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESERVATION_CATALOG_ENTRIES } from "./catalog-entries-reservation";

describe("reservation catalog", () => {
  it("covers the six plan nouns", () => {
    const ids = RESERVATION_CATALOG_ENTRIES.map((e) => e.id);
    assert.ok(ids.includes("reservation.requested.client"));
    assert.ok(ids.includes("reservation.request_received.workspace"));
    assert.ok(ids.includes("reservation.proposed.client"));
    assert.ok(ids.includes("reservation.confirmed.client"));
    assert.ok(ids.includes("reservation.declined.client"));
    assert.ok(ids.includes("reservation.hold_expiring.workspace"));
  });

  it("is terminology-aware in subjects", () => {
    const recipient = {
      userId: "u",
      email: "a@b.c",
      displayName: "A",
      locale: "en",
      isPlatformAdmin: false,
      role: "client" as const,
      dedupeId: "u",
    };
    for (const entry of RESERVATION_CATALOG_ENTRIES) {
      const subject = entry.email?.subject(
        {
          type: entry.triggers[0] ?? "",
          tenantId: null,
          eventId: "t",
          payload: { termSingular: "appointment" },
        },
        recipient,
      );
      assert.ok(subject && subject.includes("appointment"), entry.id);
    }
  });
});
