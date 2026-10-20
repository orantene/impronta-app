import assert from "node:assert/strict";
import test from "node:test";

import {
  DATED_DETAIL_FIELDS,
  datedFieldLabel,
  hostLabel,
  parseDatedDetails,
  resolveDatedDetails,
  sanitizeDatedDetails,
} from "./dated-details";

test("parse: not an object is empty; unknown fields and locales are dropped", () => {
  assert.deepEqual(parseDatedDetails(null), {});
  assert.deepEqual(parseDatedDetails([]), {});
  assert.deepEqual(parseDatedDetails({ en: { meetingPoint: "Pier 4", nonsense: "x" }, xx: { meetingPoint: "no" } }), {
    en: { meetingPoint: "Pier 4" },
  });
});

test("sanitize: trims, drops blanks, caps length, keeps minimum age a whole number", () => {
  const out = sanitizeDatedDetails({
    en: { meetingPoint: "  Pier 4  ", program: "   ", whatToBring: "x".repeat(5000), minAge: "12" },
  });
  assert.equal(out.en?.meetingPoint, "Pier 4");
  assert.equal(out.en?.program, undefined);
  assert.equal(out.en?.whatToBring?.length, 2000);
  assert.equal(out.en?.minAge, "12");
  assert.equal(sanitizeDatedDetails({ en: { minAge: "twelve" } }).en?.minAge, undefined);
  assert.equal(sanitizeDatedDetails({ en: { minAge: "-3" } }).en?.minAge, undefined);
  assert.equal(sanitizeDatedDetails({ en: { minAge: "250" } }).en?.minAge, undefined);
});

test("resolve: the viewer locale first, then English, then any other; nothing set resolves to none", () => {
  const data = { en: { meetingPoint: "Pier 4", languages: "English" }, es: { meetingPoint: "Muelle 4" } };
  const es = resolveDatedDetails(data, "es");
  assert.equal(es.find((r) => r.field === "meetingPoint")?.value, "Muelle 4");
  // Spanish missing languages falls back to English rather than hiding the field
  assert.equal(es.find((r) => r.field === "languages")?.value, "English");
  assert.deepEqual(resolveDatedDetails({}, "en"), []);
  assert.deepEqual(resolveDatedDetails({ fr: { program: "Jour 1" } }, "es").map((r) => r.value), ["Jour 1"]);
});

test("resolve keeps the catalog order so the page reads the same everywhere", () => {
  const rows = resolveDatedDetails({ en: { requirements: "ID", meetingPoint: "Pier" } }, "en").map((r) => r.field);
  const order = DATED_DETAIL_FIELDS.map((f) => f.id);
  assert.deepEqual(rows, order.filter((f) => rows.includes(f)));
});

test("labels exist in EN and ES for every field and have no em dashes", () => {
  for (const f of DATED_DETAIL_FIELDS) {
    for (const lang of ["en", "es"] as const) {
      const l = datedFieldLabel(f.id, lang);
      assert.ok(l.length > 0);
      assert.ok(!l.includes("—"));
    }
  }
  assert.equal(datedFieldLabel("meetingPoint", "es"), "Punto de encuentro");
});

test("host label follows the trade's word for one date, with a generic fallback", () => {
  assert.equal(hostLabel("Class", "en"), "Instructor");
  assert.equal(hostLabel("Clase", "es"), "Instructor");
  assert.equal(hostLabel("Departure", "en"), "Guide");
  assert.equal(hostLabel("Salida", "es"), "Guía");
  assert.equal(hostLabel("Show", "en"), "Performer");
  assert.equal(hostLabel("Whatever", "en"), "Host");
  assert.equal(hostLabel("Whatever", "es"), "Anfitrión");
});
