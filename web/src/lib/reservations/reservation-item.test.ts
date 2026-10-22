import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { refusalFromPurchaseReason, reservationItemState } from "./reservation-item";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("reserve refusals (TUL-1334)", () => {
  test("offering_not_published is its own refusal, not engine_error", () => {
    assert.equal(refusalFromPurchaseReason("offering_not_published"), "offering_not_published");
  });

  test("sold_out and capacity_unavailable keep their meaning; anything unknown stays engine_error", () => {
    assert.equal(refusalFromPurchaseReason("sold_out"), "sold_out");
    assert.equal(refusalFromPurchaseReason("capacity_unavailable"), "capacity_unavailable");
    assert.equal(refusalFromPurchaseReason("something_else"), "engine_error");
  });

  test("reserve.ts uses the mapping", () => {
    assert.match(read("./reserve.ts"), /refusalFromPurchaseReason\(purchase\.reason\)/);
  });
});

describe("reservation item state for the settings prompt", () => {
  const offerings = [
    { id: "a", title: "Table", status: "published" },
    { id: "b", title: "Table (draft)", status: "draft" },
  ];
  test("unset, missing, unpublished and ready", () => {
    assert.equal(reservationItemState(null, offerings), "unset");
    assert.equal(reservationItemState("zzz", offerings), "missing");
    assert.equal(reservationItemState("b", offerings), "unpublished");
    assert.equal(reservationItemState("a", offerings), "ready");
  });
});

describe("copy and wiring exist in ES and EN", () => {
  test("guest copy", () => {
    const island = read("../site-admin/builder-node/reserve-table-island.tsx");
    assert.match(island, /This reservation is not available right now\./);
    assert.match(island, /Esta reserva no está disponible por ahora\./);
  });
  test("staff copy", () => {
    for (const f of ["en", "es"]) {
      const j = read(`../../../messages/${f}.json`);
      assert.match(j, /"offeringNotPublished":/);
    }
    assert.match(read("../../../messages/en.json"), /Publish the reservation item to accept reservations\./);
    assert.match(read("../../../messages/es.json"), /Publica el artículo de reservas para aceptar reservas\./);
    assert.match(read("../../components/admin/floor/floor-copy.ts"), /offering_not_published/);
  });
  test("the rules action validates the item belongs to the workspace", () => {
    const a = read("../server-actions/admin-reservation-rules.ts");
    assert.match(a, /reservationOfferingId/);
    assert.match(a, /tenantScopedQuery\(sb, "talent_offerings", auth\.tenantId\)/);
  });
});

describe("reservation item published status (TUL-1880)", () => {
  test("the slots route and the confirm action both ask whether the item is published", () => {
    const src = read("../../app/(public)/_reserve/reserve-actions.ts");
    assert.equal((src.match(/reservationItemPublished\(/g) ?? []).length, 2);
    assert.match(src, /reason: "offering_not_published"/);
    assert.match(src, /itemState === "unpublished"\) return \{ ok: false, \.\.\.NO_DATES, reason: "reservations_off" \}/);
  });
});

import { reservationItemPublished } from "./item-published";

describe("reservationItemPublished", () => {
  const sb = (row: unknown, error: unknown = null) =>
    ({
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) b[m] = () => b;
        b.maybeSingle = async () => ({ data: row, error });
        return b;
      },
    }) as never;
  test("published, draft, missing and unreadable", async () => {
    assert.equal(await reservationItemPublished(sb({ status: "published" }), "t", "o"), "published");
    assert.equal(await reservationItemPublished(sb({ status: "draft" }), "t", "o"), "unpublished");
    assert.equal(await reservationItemPublished(sb(null), "t", "o"), "unpublished");
    assert.equal(await reservationItemPublished(sb(null, { message: "down" }), "t", "o"), "unknown");
    assert.equal(await reservationItemPublished(sb(null), "t", null), "published");
  });
});
