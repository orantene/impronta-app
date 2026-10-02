import assert from "node:assert/strict";
import { test } from "node:test";

import { pickNearestStarts } from "./next-free-times";

const TZ = "UTC";

test("pickNearestStarts: same day nearest the request first, then following days", () => {
  const starts = [
    "2026-10-05T09:00:00.000Z",
    "2026-10-06T09:00:00.000Z",
    "2026-10-06T15:00:00.000Z",
    "2026-10-06T17:00:00.000Z",
    "2026-10-07T09:00:00.000Z",
  ];
  const got = pickNearestStarts(starts, "2026-10-06T16:00:00.000Z", TZ);
  assert.deepEqual(got, [
    "2026-10-06T15:00:00.000Z",
    "2026-10-06T17:00:00.000Z",
    "2026-10-06T09:00:00.000Z",
  ].sort());
  assert.ok(!got.includes("2026-10-05T09:00:00.000Z"));
});

test("pickNearestStarts: no same-day times falls to following days, then earlier", () => {
  const starts = ["2026-10-04T09:00:00.000Z", "2026-10-07T09:00:00.000Z", "2026-10-08T09:00:00.000Z"];
  assert.deepEqual(pickNearestStarts(starts, "2026-10-06T12:00:00.000Z", TZ, 2), [
    "2026-10-07T09:00:00.000Z",
    "2026-10-08T09:00:00.000Z",
  ]);
});
