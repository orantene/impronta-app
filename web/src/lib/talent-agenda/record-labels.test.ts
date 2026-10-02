import assert from "node:assert/strict";
import { test } from "node:test";

import { recordSourceLabel, recordWhenLabel } from "./record-labels";

const shape = { startsAt: "2026-10-03T15:00:00Z", endsAt: "2026-10-03T15:30:00Z", tz: "America/Cancun" };

test("F61: the record's When carries the date (en)", () => {
  const label = recordWhenLabel({ ...shape, locale: "en" }) ?? "";
  assert.match(label, /^Sat, Oct 3 · 10:00/);
  assert.match(label, /10:30\s?AM Cancun$/);
});

test("F61: the record's When carries the date (es)", () => {
  const label = recordWhenLabel({ ...shape, locale: "es" }) ?? "";
  assert.match(label, /^sáb,? 3 (de )?oct/);
  assert.match(label, /Cancun$/);
});

test("F61: unusable times give null (the caller keeps its fallback)", () => {
  assert.equal(recordWhenLabel({ startsAt: "", endsAt: "", tz: "America/Cancun", locale: "en" }), null);
});

test("F62: raw source values become copy; an agency name stays", () => {
  assert.equal(recordSourceLabel("manual"), "Added by you");
  assert.equal(recordSourceLabel("website"), "Your website");
  assert.equal(recordSourceLabel("qr"), "QR code");
  assert.equal(recordSourceLabel("tulala"), "Tulala");
  assert.equal(recordSourceLabel(""), "Direct");
  assert.equal(recordSourceLabel("Impronta"), "Impronta");
});
