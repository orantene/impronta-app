import test from "node:test";
import assert from "node:assert/strict";

import { summariseScans, formatBroughtIn, type ScanRow } from "./analytics";

const hourOf = (iso: string) => Number(iso.slice(11, 13));

const row = (over: Partial<ScanRow> = {}): ScanRow => ({
  scanned_at: "2026-09-03T21:15:00Z",
  device_class: "phone",
  is_nfc: false,
  country: "MX",
  session_key: null,
  resolved_to: "menu",
  ...over,
});

test("money brought in is NULL, never zero, until attribution exists", () => {
  // A zero is a measurement: it claims the code earned nothing. An operator
  // who sees $0 next to a busy table concludes the code is broken.
  const s = summariseScans([row(), row()], hourOf);
  assert.equal(s.broughtInCents, null);
  assert.notEqual(s.broughtInCents as unknown, 0);
});

test("an unmeasured figure renders as words, not as a currency zero", () => {
  const en = formatBroughtIn(null, "USD", "en-US");
  assert.equal(en.measured, false);
  assert.doesNotMatch(en.text, /0/);
  const es = formatBroughtIn(null, "USD", "es-MX");
  assert.equal(es.measured, false);
  assert.doesNotMatch(es.text, /0/);
  // No em dashes in user-facing copy.
  assert.ok(!en.text.includes("—") && !es.text.includes("—"));
});

test("a measured figure formats as currency in the caller's locale", () => {
  const out = formatBroughtIn(124000, "USD", "en-US");
  assert.equal(out.measured, true);
  assert.match(out.text, /1,240/);
});

test("distinct visitors are UNKNOWN when any scan lacks a session key", () => {
  // LINK_SCAN_SALT unset means scanSessionKey refuses to hash an IP, so keys
  // are null. Counting only the scans that happen to have one and calling it
  // a total would understate reach and look authoritative doing it.
  const s = summariseScans([row({ session_key: "abc" }), row({ session_key: null })], hourOf);
  assert.equal(s.visitors, null);
});

test("distinct visitors are counted when every scan carries a key", () => {
  const s = summariseScans(
    [row({ session_key: "a" }), row({ session_key: "a" }), row({ session_key: "b" })],
    hourOf,
  );
  assert.equal(s.scans, 3);
  assert.equal(s.visitors, 2, "one person refreshing is not two people");
});

test("NFC taps are counted separately from camera scans", () => {
  const s = summariseScans([row(), row({ is_nfc: true }), row({ is_nfc: true })], hourOf);
  assert.equal(s.scans, 3);
  assert.equal(s.nfcTaps, 2);
});

test("the hour histogram uses the venue's local hour, not UTC", () => {
  // The caller supplies the conversion. Here a fake UTC-5 venue.
  const localHour = (iso: string) => (Number(iso.slice(11, 13)) + 24 - 5) % 24;
  const s = summariseScans([row({ scanned_at: "2026-09-04T02:00:00Z" })], localHour);
  assert.equal(s.byHour[21], 1, "02:00Z is 21:00 in a UTC-5 venue");
  assert.equal(s.byHour[2], 0);
  assert.equal(s.byHour.length, 24);
});

test("destinations are tallied, so a retarget can be judged", () => {
  const s = summariseScans(
    [row({ resolved_to: "menu" }), row({ resolved_to: "menu" }), row({ resolved_to: "tickets" })],
    hourOf,
  );
  assert.deepEqual(s.byDestination, { menu: 2, tickets: 1 });
});

test("an empty scan list summarises to zeroes rather than throwing", () => {
  const s = summariseScans([], hourOf);
  assert.equal(s.scans, 0);
  assert.equal(s.nfcTaps, 0);
  assert.equal(s.visitors, 0, "no scans means no unknown keys, so zero is honest here");
  assert.equal(s.broughtInCents, null);
  assert.deepEqual(s.byHour, new Array(24).fill(0));
});

test("a null country is skipped rather than counted as a country", () => {
  const s = summariseScans([row({ country: null }), row({ country: "MX" })], hourOf);
  assert.deepEqual(s.byCountry, { MX: 1 });
});
