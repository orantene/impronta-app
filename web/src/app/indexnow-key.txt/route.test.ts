/**
 * TUL-589 fix round: an unset INDEXNOW_API_KEY must 404, not serve an empty
 * "verification" file — pingIndexNow() no-ops when it's unset anyway (see
 * indexNowPingAllowed in @/lib/seo/indexnow), so a 200 here would just be a
 * stray, confusing file with nothing behind it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("GET /indexnow-key.txt: 404 when INDEXNOW_API_KEY is unset", async () => {
  const original = process.env.INDEXNOW_API_KEY;
  delete process.env.INDEXNOW_API_KEY;
  try {
    const res = await GET();
    assert.equal(res.status, 404);
  } finally {
    if (original === undefined) delete process.env.INDEXNOW_API_KEY;
    else process.env.INDEXNOW_API_KEY = original;
  }
});

test("GET /indexnow-key.txt: 200 with the key as plain text when configured", async () => {
  const original = process.env.INDEXNOW_API_KEY;
  process.env.INDEXNOW_API_KEY = "test-key-abc";
  try {
    const res = await GET();
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
    assert.equal(await res.text(), "test-key-abc");
  } finally {
    if (original === undefined) delete process.env.INDEXNOW_API_KEY;
    else process.env.INDEXNOW_API_KEY = original;
  }
});
