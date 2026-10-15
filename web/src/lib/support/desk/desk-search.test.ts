import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DESK_SEARCH_PAGE_SIZE,
  parseDeskSearch,
  deskSearchRange,
} from "./desk-search";

describe("parseDeskSearch (TUL-624)", () => {
  it("returns null for empty or whitespace-only input", () => {
    assert.equal(parseDeskSearch("   "), null);
    assert.equal(parseDeskSearch("#"), null);
    assert.equal(parseDeskSearch("%_,()"), null);
  });

  it("reads #45 and 45 as a ticket number", () => {
    assert.deepEqual(parseDeskSearch("#45"), { kind: "number", number: 45 });
    assert.deepEqual(parseDeskSearch(" 45 "), { kind: "number", number: 45 });
  });

  it("reads TAL codes case-insensitively", () => {
    assert.deepEqual(parseDeskSearch("tal-93938"), { kind: "talent", code: "TAL-93938" });
  });

  it("reads an email as an email term", () => {
    assert.deepEqual(parseDeskSearch("Ana@Example.com"), { kind: "email", email: "ana@example.com" });
  });

  it("strips filter-grammar and LIKE wildcards from free text", () => {
    const r = parseDeskSearch("refund),status.eq.resolved,(x%_\\*");
    assert.equal(r?.kind, "text");
    if (r?.kind === "text") {
      assert.doesNotMatch(r.text, /[,()%_\\*"']/);
      assert.equal(r.text, "refundstatus.eq.resolvedx");
    }
  });

  it("caps term length", () => {
    const r = parseDeskSearch("a".repeat(500));
    assert.equal(r?.kind, "text");
    if (r?.kind === "text") assert.ok(r.text.length <= 80);
  });

  it("an absurd number falls back to text instead of overflowing", () => {
    assert.equal(parseDeskSearch("99999999999999999999")?.kind, "text");
  });
});

describe("deskSearchRange", () => {
  it("paginates by page size and clamps bad pages", () => {
    assert.deepEqual(deskSearchRange(0), { from: 0, to: DESK_SEARCH_PAGE_SIZE - 1 });
    assert.deepEqual(deskSearchRange(2), {
      from: 2 * DESK_SEARCH_PAGE_SIZE,
      to: 3 * DESK_SEARCH_PAGE_SIZE - 1,
    });
    assert.deepEqual(deskSearchRange(-5), deskSearchRange(0));
    assert.deepEqual(deskSearchRange(Number.NaN), deskSearchRange(0));
  });
});
