import test from "node:test";
import assert from "node:assert/strict";

import { buildQuerySuffix } from "./redirect-query";

test("buildQuerySuffix: undefined → empty string", () => {
  assert.equal(buildQuerySuffix(undefined), "");
});

test("buildQuerySuffix: empty record → empty string", () => {
  assert.equal(buildQuerySuffix({}), "");
});

test("buildQuerySuffix: single string param", () => {
  assert.equal(buildQuerySuffix({ inquiry: "abc" }), "?inquiry=abc");
});

test("buildQuerySuffix: multiple params", () => {
  const out = buildQuerySuffix({ a: "1", b: "2" });
  // URLSearchParams preserves insertion order
  assert.equal(out, "?a=1&b=2");
});

test("buildQuerySuffix: array values produce repeated keys", () => {
  assert.equal(
    buildQuerySuffix({ tag: ["red", "blue"] }),
    "?tag=red&tag=blue",
  );
});

test("buildQuerySuffix: undefined values are skipped", () => {
  assert.equal(
    buildQuerySuffix({ a: "1", b: undefined, c: "3" }),
    "?a=1&c=3",
  );
});

test("buildQuerySuffix: percent-encodes special characters", () => {
  assert.equal(
    buildQuerySuffix({ q: "hello world" }),
    "?q=hello+world",
  );
  assert.equal(
    buildQuerySuffix({ next: "/foo?bar=baz" }),
    "?next=%2Ffoo%3Fbar%3Dbaz",
  );
});

test("buildQuerySuffix: arrays with undefined entries skip those entries", () => {
  assert.equal(
    buildQuerySuffix({ tag: ["red", undefined as unknown as string, "blue"] }),
    "?tag=red&tag=blue",
  );
});
