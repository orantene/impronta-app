import { test } from "node:test";
import assert from "node:assert/strict";

import { CSV_BOM, csvCell, plainAmount, salesByItemCsv } from "./csv";
import type { SalesItemRow } from "./by-item";

test("commas, quotes and newlines are quoted and doubled", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell("line1\r\nline2"), '"line1\r\nline2"');
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(null), "");
});

test("formula-injection guard prefixes a quote on text starting with = + - @ tab or CR", () => {
  for (const bad of ["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"]) {
    const out = csvCell(bad);
    assert.ok(out.replace(/^"/, "").startsWith("'"), `${JSON.stringify(bad)} -> ${out}`);
  }
  assert.equal(csvCell("=1,2"), `"'=1,2"`);
});

test("numbers are written as numbers and are not guarded (a negative net stays a number)", () => {
  assert.equal(csvCell(-12.5), "-12.5");
  assert.equal(csvCell(0), "0");
});

test("plainAmount uses the currency minor unit and integer math", () => {
  assert.equal(plainAmount(123456, "USD"), "1234.56");
  assert.equal(plainAmount(5, "MXN"), "0.05");
  assert.equal(plainAmount(-250, "USD"), "-2.50");
  assert.equal(plainAmount(1500, "JPY"), "1500");
});

const row = (over: Partial<SalesItemRow>): SalesItemRow => ({
  key: "k",
  offeringId: "o",
  title: "Haircut",
  currency: "USD",
  quantity: 3,
  grossCents: 9000,
  refundedCents: 1000,
  netCents: 8000,
  orderCount: 2,
  ...over,
});

test("export starts with a BOM, uses CRLF and the given headers, and guards titles", () => {
  const csv = salesByItemCsv(
    [row({ title: '=HYPERLINK("x")' }), row({ title: "Cut, wash", key: "k2" })],
    ["Item", "Qty", "Gross", "Refunded", "Net", "Orders", "Currency"],
  );
  assert.ok(csv.startsWith(CSV_BOM));
  const lines = csv.slice(CSV_BOM.length).split("\r\n");
  assert.equal(lines[0], "Item,Qty,Gross,Refunded,Net,Orders,Currency");
  assert.equal(lines[1], `"'=HYPERLINK(""x"")",3,90.00,10.00,80.00,2,USD`);
  assert.equal(lines[2], `"Cut, wash",3,90.00,10.00,80.00,2,USD`);
  assert.equal(lines[3], "");
});
