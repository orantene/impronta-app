/**
 * B2/D3: /book must open on a service that has times, and a service with no
 * times must lead to a request, never a dead end.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isRequestOnlyService, pickInitialOfferingId, resolveSelectedOfferingId, searchWithService } from "./book-availability";

// Catches: the page opened on offerings[0] even when it had no slots.
test("preselects the first service that has times", () => {
  const id = pickInitialOfferingId([
    { id: "a", hasOpenTimes: false },
    { id: "b", visibility: "on_request" },
    { id: "c", hasOpenTimes: true },
    { id: "d", hasOpenTimes: true },
  ]);
  assert.equal(id, "c");
});

test("without probe results, skips services already ruled out", () => {
  assert.equal(
    pickInitialOfferingId([
      { id: "a", hasOpenTimes: false },
      { id: "b" },
    ]),
    "b",
  );
});

test("when nothing has times, keeps the first so the request path shows", () => {
  assert.equal(
    pickInitialOfferingId([
      { id: "a", hasOpenTimes: false },
      { id: "b", visibility: "on_request" },
    ]),
    "a",
  );
  assert.equal(pickInitialOfferingId([]), "");
});

test("request-only: on_request or probed with no times", () => {
  assert.equal(isRequestOnlyService({ id: "x", visibility: "on_request" }), true);
  assert.equal(isRequestOnlyService({ id: "x", hasOpenTimes: false }), true);
  assert.equal(isRequestOnlyService({ id: "x", hasOpenTimes: true }), false);
  assert.equal(isRequestOnlyService({ id: "x" }), false);
});

const LIST = [
  { id: "probed", hasOpenTimes: true },
  { id: "unprobed" },
  { id: "empty", hasOpenTimes: false },
];

// Catches: ?service= losing to the default picker when a probed service is listed first.
test("requested service wins over the picker, probed or not", () => {
  assert.equal(resolveSelectedOfferingId({ offerings: LIST, requestedId: "unprobed" }), "unprobed");
  assert.equal(resolveSelectedOfferingId({ offerings: LIST, requestedId: "empty" }), "empty");
});

test("requested id not in the list falls back to the picker", () => {
  assert.equal(resolveSelectedOfferingId({ offerings: LIST, requestedId: "gone" }), "probed");
  assert.equal(resolveSelectedOfferingId({ offerings: LIST, requestedId: "" }), "probed");
  assert.equal(resolveSelectedOfferingId({ offerings: [], requestedId: "x" }), "");
});

test("a manual pick overrides the requested service", () => {
  assert.equal(
    resolveSelectedOfferingId({ offerings: LIST, requestedId: "unprobed", userPickedId: "probed" }),
    "probed",
  );
  // A stale pick (not in the list) is ignored.
  assert.equal(
    resolveSelectedOfferingId({ offerings: LIST, requestedId: "unprobed", userPickedId: "gone" }),
    "unprobed",
  );
});

// TUL-1913: switching service on /book is mirrored into ?service=.
test("searchWithService replaces the service param and keeps the others", () => {
  assert.equal(searchWithService("", "b"), "?service=b");
  assert.equal(searchWithService("?service=a&promo=X", "b"), "?service=b&promo=X");
  assert.equal(searchWithService("promo=X", "b c"), "?promo=X&service=b+c");
});

test("TUL-1913: the picker reports a hand pick and the page replaces the URL without scroll or history", () => {
  const client = readFileSync(join(__dirname, "BookPageClient.tsx"), "utf8");
  assert.match(client, /onServicePicked\?\.\(e\.target\.value\)/);
  const sync = readFileSync(join(__dirname, "BookPageUrlSync.tsx"), "utf8");
  assert.match(sync, /router\.replace\(.*\{ scroll: false \}\)/);
  assert.doesNotMatch(sync, /router\.push/);
  const page = readFileSync(join(__dirname, "page.tsx"), "utf8");
  assert.match(page, /<BookPageUrlSync/);
});
