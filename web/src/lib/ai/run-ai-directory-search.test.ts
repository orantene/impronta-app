import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiSearchDedupeKey,
  buildClassicAfterHybridCursor,
} from "./run-ai-directory-search";
import { decodeDirectoryCursor } from "@/lib/directory/cursor";

test("AI dedupe key includes tenant scope", () => {
  const base = {
    rawQ: "fashion week makeup",
    taxonomyTermIds: ["11111111-1111-1111-1111-111111111111"],
    locale: "en",
    limit: 24,
    tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  };

  const keyA = buildAiSearchDedupeKey(base);
  const keyB = buildAiSearchDedupeKey({
    ...base,
    tenantId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  });

  assert.notEqual(keyA, keyB);
});

test("classic-after-hybrid cursor uses actual returned count", () => {
  const cursor = buildClassicAfterHybridCursor({
    resultsLength: 5,
    limit: 10,
    contextStamp: "abc123",
  });
  assert.equal(cursor, null);

  const cursor2 = buildClassicAfterHybridCursor({
    resultsLength: 10,
    limit: 10,
    contextStamp: "abc123",
  });
  assert.ok(cursor2);
  const decoded = decodeDirectoryCursor(cursor2!);
  assert.equal(decoded?.mode, "classic_after_hybrid");
  assert.equal(decoded?.offset, 10);
  assert.equal(decoded?.hybridContextStamp, "abc123");
});
