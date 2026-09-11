import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrepReadyCopy } from "./notify-ready";
import { findCatalogEntries, findCatalogEntryById } from "@/lib/notifications/catalog";

test("pickup copy tells the guest to collect; table copy does not", () => {
  const pickup = buildPrepReadyCopy({ locale: "en", destination: "pickup" });
  assert.match(pickup.subject, /pickup/i);
  assert.match(pickup.lines[0] ?? "", /collect/i);
  const table = buildPrepReadyCopy({ locale: "en", destination: "table" });
  assert.match(table.lines[0] ?? "", /table/i);
});

test("Spanish pickup copy is not English", () => {
  const es = buildPrepReadyCopy({ locale: "es", destination: "pickup" });
  assert.match(es.subject, /recoger/i);
  assert.equal(es.locale, "es");
});

test("prep.order_ready fans out to guest email and staff in-app", () => {
  const ids = findCatalogEntries("prep.order_ready").map((e) => e.id).sort();
  assert.deepEqual(ids, ["prep.order_ready.guest", "prep.order_ready.staff"]);
  const guest = findCatalogEntryById("prep.order_ready.guest");
  assert.equal(guest?.email?.templateId, "client.order_ready");
  assert.deepEqual(guest?.defaultChannels, ["email"]);
  const staff = findCatalogEntryById("prep.order_ready.staff");
  assert.deepEqual(staff?.defaultChannels, ["in_app"]);
  assert.equal(staff?.in_app?.surface, "workspace");
});
