import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { requestInfoHref } from "./catalog-request-info-href";

test("TUL-861: Pedir informacion goes to the contact page in the page language", () => {
  assert.equal(requestInfoHref("/t/TAL-93110", "es"), "/es/contact");
  assert.equal(requestInfoHref("/es/t/TAL-93110", "es"), "/es/contact");
  assert.equal(requestInfoHref("/t/TAL-93110", "en"), "/contact");
});

test("TUL-861: keeps the /w/<slug> workspace prefix (locale first)", () => {
  assert.equal(requestInfoHref("/w/qa-b7-studio", "en"), "/w/qa-b7-studio/contact");
  assert.equal(requestInfoHref("/es/w/qa-b7-studio/clases", "es"), "/es/w/qa-b7-studio/contact");
});

test("TUL-861: the empty-slot panel offers chat AND the request link", () => {
  const sheet = readFileSync("src/components/public-booking/CatalogBookingSheet.tsx", "utf8");
  assert.match(sheet, /data-catalog-empty-ask/);
  assert.match(sheet, /data-catalog-empty-request/);
  assert.match(sheet, /Pedir información/);
  assert.match(sheet, /Request information/);
});
