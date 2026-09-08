import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSalesRows, salesKindLabel } from "./activity-shape";

test("free activity is a row kind, not an order", () => {
  const rows = [
    { kind: "order", id: "o1" },
    { kind: "booking", id: "b1" },
    { kind: "registration", id: "r1" },
  ];
  assert.deepEqual(
    filterSalesRows(rows, "booking").map((row) => row.id),
    ["b1"],
  );
  assert.equal(filterSalesRows(rows, "all").length, 3);
});

test("kind labels stay EN/ES and do not invent a second ledger name", () => {
  assert.equal(salesKindLabel("order", "en"), "Order");
  assert.equal(salesKindLabel("booking", "es"), "Reserva");
});
