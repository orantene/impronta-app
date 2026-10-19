import assert from "node:assert/strict";
import test from "node:test";

import { cleanCurrency, orderPayable, transactionPayable, DATED_PICKER_COPY, dateState, datedPickerCopy, safeReturnPath, seatsLabel } from "./dated-picker-model";

const base = { seatsLeft: 10, salesOpen: true, privateOnRequest: false };

test("a private-on-request item never offers a seat, whatever the count", () => {
  assert.equal(dateState({ ...base, privateOnRequest: true }), "private");
});

test("closed beats sold out; sold out beats low; low is at 5 or fewer; unknown count is open", () => {
  assert.equal(dateState({ ...base, salesOpen: false, seatsLeft: 0 }), "closed");
  assert.equal(dateState({ ...base, seatsLeft: 0 }), "sold_out");
  assert.equal(dateState({ ...base, seatsLeft: 5 }), "low");
  assert.equal(dateState({ ...base, seatsLeft: 6 }), "open");
  assert.equal(dateState({ ...base, seatsLeft: null }), "open");
});

test("seats label in both languages, singular and plural", () => {
  assert.equal(seatsLabel(4, "en"), "4 spots left");
  assert.equal(seatsLabel(1, "en"), "1 spot left");
  assert.equal(seatsLabel(4, "es"), "Quedan 4 lugares");
  assert.equal(seatsLabel(1, "es"), "Queda 1 lugar");
  assert.equal(seatsLabel(null, "es"), null);
  assert.equal(seatsLabel(0, "en"), null);
});

test("copy: same keys in EN and ES, nothing empty, no em dashes, design-doc sentences present", () => {
  assert.deepEqual(Object.keys(DATED_PICKER_COPY.en).sort(), Object.keys(DATED_PICKER_COPY.es).sort());
  for (const lang of ["en", "es"] as const) {
    for (const [k, v] of Object.entries(DATED_PICKER_COPY[lang])) {
      assert.ok(String(v).trim().length > 0, `${lang}.${k}`);
      assert.ok(!String(v).includes("—"), `${lang}.${k}`);
    }
  }
  assert.equal(datedPickerCopy("es").pickDate, "Elige una fecha");
  assert.equal(datedPickerCopy("en").soldOutWaitlist, "Sold out, join the waitlist");
  assert.equal(datedPickerCopy("es").salesClosed, "Ventas cerradas para esta fecha");
  assert.equal(datedPickerCopy("en").privateOnRequest, "Private date on request");
  assert.equal(datedPickerCopy("es").howMany, "¿Cuántas personas?");
});

test("return path must be a same-site path", () => {
  assert.equal(safeReturnPath("/clases/yoga"), "/clases/yoga");
  assert.equal(safeReturnPath("//evil.example"), "/");
  assert.equal(safeReturnPath("https://evil.example"), "/");
  assert.equal(safeReturnPath("/a\\b"), "/");
  assert.equal(safeReturnPath(undefined), "/");
});

test("only a transaction still waiting for money may open a checkout", () => {
  for (const ok of ["draft", "payment_requested", "pending"]) assert.equal(transactionPayable(ok), true, ok);
  for (const no of ["paid", "payout_pending", "payout_sent", "cancelled", "refunded", "disputed", "failed", "void", "weird", null, undefined]) {
    assert.equal(transactionPayable(no), false, String(no));
  }
  assert.equal(orderPayable("pending_payment"), true);
  for (const no of ["paid", "fulfilled", "cancelled", "refunded", "partially_refunded", "quoted", "x", null]) assert.equal(orderPayable(no), false, String(no));
});

test("a missing or malformed currency is nothing, never USD", () => {
  assert.equal(cleanCurrency("mxn"), "MXN");
  assert.equal(cleanCurrency(" USD "), "USD");
  for (const bad of [null, undefined, "", "US", "DOLLAR", 5]) assert.equal(cleanCurrency(bad), null, String(bad));
});
