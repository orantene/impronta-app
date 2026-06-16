/**
 * rollback-revision.test.ts — WS-D D2 unit tests.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test \
 *         src/lib/site-admin/builder-core/templates/rollback-revision.test.ts
 *
 * The rollback action itself (`rollbackToRevision`) is a "use server" action
 * with Supabase I/O, so it isn't isolatable in the node runner. What IS pure —
 * and what the action + UI must agree on — is the forward-only version compute
 * and the audit-note wording. Those live in registry-rows.ts (a pure module)
 * specifically so they can be tested here.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextPublishedVersion,
  rollbackRevisionNote,
  normalizeChangelog,
} from "./registry-rows";

describe("nextPublishedVersion", () => {
  it("is forward-only: always current + 1", () => {
    assert.equal(nextPublishedVersion(1), 2);
    assert.equal(nextPublishedVersion(7), 8);
  });

  it("never reuses or rewinds the version even when rolling back to an old one", () => {
    // Rolling back to v2 while the live row is at v9 must still publish at v10,
    // never at v3 — history is never rewritten.
    const liveVersion = 9;
    const rolledBackTo = 2;
    assert.equal(nextPublishedVersion(liveVersion), 10);
    assert.notEqual(nextPublishedVersion(liveVersion), rolledBackTo + 1);
  });
});

describe("rollbackRevisionNote", () => {
  it("formats the audit note with the target version", () => {
    assert.equal(rollbackRevisionNote(2), "Rolled back to v2");
    assert.equal(rollbackRevisionNote(13), "Rolled back to v13");
  });
});

describe("normalizeChangelog (WS-D D4)", () => {
  it("leaves undefined as undefined so the column stays untouched", () => {
    assert.equal(normalizeChangelog(undefined), undefined);
  });

  it("clears blank / whitespace-only input to null", () => {
    assert.equal(normalizeChangelog(null), null);
    assert.equal(normalizeChangelog(""), null);
    assert.equal(normalizeChangelog("   "), null);
    assert.equal(normalizeChangelog("\n\t "), null);
  });

  it("trims and keeps a real note", () => {
    assert.equal(normalizeChangelog("Tightened hero spacing"), "Tightened hero spacing");
    assert.equal(normalizeChangelog("  padded note  "), "padded note");
  });
});
