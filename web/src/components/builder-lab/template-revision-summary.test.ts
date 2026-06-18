/**
 * Unit tests for template-revision-summary.ts (Builder Studio WS-D D4).
 * Pure helpers — no DOM, no network.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  formatRevRelative,
  summarizeLatestRevision,
} from "./template-revision-summary";

// ── formatRevRelative ──────────────────────────────────────────────────────────

describe("formatRevRelative", () => {
  const NOW = new Date("2026-06-18T12:00:00.000Z").getTime();

  // Freeze Date.now so relative-time assertions are stable.
  let originalNow: () => number;
  beforeEach(() => {
    originalNow = Date.now;
    Date.now = () => NOW;
  });
  afterEach(() => {
    Date.now = originalNow;
  });

  it("returns '' for an invalid ISO string", () => {
    assert.equal(formatRevRelative("not-a-date"), "");
  });

  it("returns 'just now' for timestamps < 1 minute ago", () => {
    const iso = new Date(NOW - 30_000).toISOString();
    assert.equal(formatRevRelative(iso), "just now");
  });

  it("returns 'Xm ago' for timestamps < 1 hour ago", () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    assert.equal(formatRevRelative(iso), "5m ago");
  });

  it("returns 'Xh ago' for timestamps < 1 day ago", () => {
    const iso = new Date(NOW - 3 * 3_600_000).toISOString();
    assert.equal(formatRevRelative(iso), "3h ago");
  });

  it("returns 'Xd ago' for timestamps < 7 days ago", () => {
    const iso = new Date(NOW - 2 * 86_400_000).toISOString();
    assert.equal(formatRevRelative(iso), "2d ago");
  });

  it("returns a short locale date for timestamps >= 7 days ago", () => {
    // 10 days ago — should produce something like "Jun 8" (locale-dependent)
    const iso = new Date(NOW - 10 * 86_400_000).toISOString();
    const result = formatRevRelative(iso);
    // Not asserting exact locale output; just that it's non-empty and not "ago".
    assert.ok(result.length > 0, "should return a non-empty date string");
    assert.ok(!result.includes("ago"), "should not say '...ago' for old dates");
  });
});

// ── summarizeLatestRevision ───────────────────────────────────────────────────

describe("summarizeLatestRevision", () => {
  const NOW = new Date("2026-06-18T12:00:00.000Z").getTime();
  let originalNow: () => number;
  beforeEach(() => {
    originalNow = Date.now;
    Date.now = () => NOW;
  });
  afterEach(() => {
    Date.now = originalNow;
  });

  it("includes version, relative time, and note when note is present", () => {
    const iso = new Date(NOW - 2 * 86_400_000).toISOString(); // 2 days ago
    const result = summarizeLatestRevision(7, iso, "copy fix");
    assert.equal(result, "v7, changed 2d ago, copy fix");
  });

  it("omits the note segment when changelog is null", () => {
    const iso = new Date(NOW - 60_000).toISOString(); // 1m ago
    const result = summarizeLatestRevision(3, iso, null);
    assert.equal(result, "v3, changed 1m ago");
  });

  it("omits the note segment when changelog is empty string", () => {
    const iso = new Date(NOW - 60_000).toISOString();
    const result = summarizeLatestRevision(1, iso, "   ");
    assert.equal(result, "v1, changed 1m ago");
  });

  it("omits the note segment when changelog is undefined", () => {
    const iso = new Date(NOW - 3 * 3_600_000).toISOString(); // 3h ago
    const result = summarizeLatestRevision(12, iso, undefined);
    assert.equal(result, "v12, changed 3h ago");
  });

  it("falls back gracefully on an invalid updatedAt", () => {
    const result = summarizeLatestRevision(5, "bad-date", "my note");
    assert.equal(result, "v5, unknown date, my note");
  });
});
