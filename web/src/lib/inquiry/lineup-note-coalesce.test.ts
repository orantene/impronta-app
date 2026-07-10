/**
 * UNIT TEST — lineup-note-coalesce.ts (P1-7: coalesce lineup notes into one line).
 *
 * Pins the two pure decisions captureGuestChip reads before writing a lineup note:
 *   • the SAME-VALUE guard (order-insensitive set compare) that suppresses a
 *     no-op talent write, and
 *   • the COALESCE decision that collapses a run of lineup notes into one
 *     updating line vs. inserting fresh (human message in between / stale /
 *     deleted / other kind).
 *
 * Run: npx tsx --test src/lib/inquiry/lineup-note-coalesce.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  LINEUP_NOTE_COALESCE_WINDOW_MS,
  buildLineupNoteBody,
  decideLineupNoteWrite,
  deepEqualJson,
  isTalentLineupNoteMetadata,
  pickNewestLineupNote,
  sameStringSet,
  talentSelectionUnchanged,
} from "./lineup-note-coalesce";

const NOW = Date.parse("2026-07-09T12:00:00.000Z");
const isoAgo = (ms: number) => new Date(NOW - ms).toISOString();

/** A canonical, coalesce-eligible last lineup note in the guest-visible thread. */
function eligiblePrivateLineupNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    metadata: { system_event_type: "inquiry_details_updated", chip_kind: "talent" },
    sender_user_id: null,
    guest_session_id: null,
    deleted_at: null,
    created_at: isoAgo(30_000), // 30s ago
    ...overrides,
  };
}

describe("sameStringSet — order-insensitive set equality", () => {
  it("treats reordered / duplicated ids as the same set", () => {
    assert.equal(sameStringSet(["a", "b"], ["b", "a"]), true);
    assert.equal(sameStringSet(["a", "a", "b"], ["b", "a"]), true);
    assert.equal(sameStringSet([], []), true);
  });
  it("distinguishes different sets", () => {
    assert.equal(sameStringSet(["a", "b"], ["a", "b", "c"]), false);
    assert.equal(sameStringSet(["a"], ["b"]), false);
    assert.equal(sameStringSet(["a"], []), false);
  });
});

describe("talentSelectionUnchanged — same-set skip", () => {
  it("SKIPS when ids match as a set and mode is unchanged (order-insensitive)", () => {
    assert.equal(
      talentSelectionUnchanged(
        { ids: ["a", "b"], mode: "i_know_who" },
        { ids: ["b", "a"], mode: "i_know_who" },
      ),
      true,
    );
  });
  it("PROCEEDS when the set changed", () => {
    assert.equal(
      talentSelectionUnchanged(
        { ids: ["a", "b"], mode: "i_know_who" },
        { ids: ["a", "b", "c"], mode: "i_know_who" },
      ),
      false,
    );
  });
  it("PROCEEDS when only the selection mode changed", () => {
    assert.equal(
      talentSelectionUnchanged(
        { ids: [], mode: null },
        { ids: [], mode: "agency_recommends" },
      ),
      false,
    );
  });
});

describe("buildLineupNoteBody — P1-7 copy (no double prefix)", () => {
  it("renders 'Lineup · {n} talent' for a real lineup", () => {
    assert.equal(buildLineupNoteBody(9, "i_know_who"), "Lineup · 9 talent");
    assert.equal(buildLineupNoteBody(1, "i_know_who"), "Lineup · 1 talent");
  });
  it("renders 'Let the agency recommend' for the empty / agency_recommends case", () => {
    assert.equal(buildLineupNoteBody(0, "i_know_who"), "Let the agency recommend");
    assert.equal(buildLineupNoteBody(3, "agency_recommends"), "Let the agency recommend");
  });
});

describe("isTalentLineupNoteMetadata — matches both note shapes", () => {
  it("matches the private note shape", () => {
    assert.equal(
      isTalentLineupNoteMetadata({ system_event_type: "inquiry_details_updated", chip_kind: "talent" }),
      true,
    );
  });
  it("matches the group bubble shape", () => {
    assert.equal(isTalentLineupNoteMetadata({ chip_kind: "talent" }), true);
  });
  it("rejects a different chip kind and garbage", () => {
    assert.equal(isTalentLineupNoteMetadata({ chip_kind: "date" }), false);
    assert.equal(isTalentLineupNoteMetadata({}), false);
    assert.equal(isTalentLineupNoteMetadata(null), false);
    assert.equal(isTalentLineupNoteMetadata("talent"), false);
  });
});

describe("decideLineupNoteWrite — coalesce vs insert", () => {
  it("coalesce-eligible (last msg, same kind, <10min) → UPDATE", () => {
    assert.equal(
      decideLineupNoteWrite({ lastMessage: eligiblePrivateLineupNote(), chipKind: "talent", nowMs: NOW }),
      "update",
    );
  });

  it("also coalesces the group bubble shape", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({ metadata: { chip_kind: "talent" } }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "update",
    );
  });

  it("non-talent chip → INSERT (only lineup notes coalesce)", () => {
    assert.equal(
      decideLineupNoteWrite({ lastMessage: eligiblePrivateLineupNote(), chipKind: "date", nowMs: NOW }),
      "insert",
    );
  });

  it("no last message → INSERT", () => {
    assert.equal(
      decideLineupNoteWrite({ lastMessage: null, chipKind: "talent", nowMs: NOW }),
      "insert",
    );
  });

  it("guest message in between (guest_session_id set) → INSERT (run broken)", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({
          guest_session_id: "guest-123",
          metadata: null, // a plain guest message carries no lineup metadata
        }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "insert",
    );
  });

  it("coordinator message in between (sender_user_id set) → INSERT", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({ sender_user_id: "user-9", metadata: null }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "insert",
    );
  });

  it("last note is a different chip kind (date) → INSERT", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({
          metadata: { system_event_type: "inquiry_details_updated", chip_kind: "date" },
        }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "insert",
    );
  });

  it("stale (>10min) → INSERT", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({
          created_at: isoAgo(LINEUP_NOTE_COALESCE_WINDOW_MS + 1_000),
        }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "insert",
    );
  });

  it("exactly at the window boundary still coalesces; one ms past does not", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({ created_at: isoAgo(LINEUP_NOTE_COALESCE_WINDOW_MS) }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "update",
    );
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({ created_at: isoAgo(LINEUP_NOTE_COALESCE_WINDOW_MS + 1) }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "insert",
    );
  });

  it("deleted last note → INSERT (never resurrect)", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({ deleted_at: isoAgo(1_000) }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "insert",
    );
  });

  it("future timestamp (clock skew) → INSERT", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({ created_at: new Date(NOW + 5_000).toISOString() }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "insert",
    );
  });

  it("garbage created_at → INSERT", () => {
    assert.equal(
      decideLineupNoteWrite({
        lastMessage: eligiblePrivateLineupNote({ created_at: "not-a-date" }),
        chipKind: "talent",
        nowMs: NOW,
      }),
      "insert",
    );
  });
});

describe("deepEqualJson — generic non-talent same-value guard", () => {
  it("treats key-reordered objects as equal", () => {
    assert.equal(
      deepEqualJson({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }),
      true,
    );
  });
  it("detects a changed scalar", () => {
    assert.equal(deepEqualJson({ a: 1 }, { a: 2 }), false);
    assert.equal(deepEqualJson({ a: 1 }, { a: 1, b: 2 }), false);
  });
  it("arrays stay order-sensitive", () => {
    assert.equal(deepEqualJson([1, 2], [2, 1]), false);
    assert.equal(deepEqualJson([1, 2], [1, 2]), true);
  });
  it("null handling", () => {
    assert.equal(deepEqualJson(null, null), true);
    assert.equal(deepEqualJson(null, {}), false);
  });
});

describe("pickNewestLineupNote (repair path, W0-E follow-up)", () => {
  const note = (over: Record<string, unknown> = {}) => ({
    metadata: { chip_kind: "talent" },
    sender_user_id: null,
    guest_session_id: null,
    deleted_at: null,
    ...over,
  });

  it("picks the newest matching lineup note from a newest-first window", () => {
    const rows = [
      { metadata: { chip_kind: "date" }, sender_user_id: null, guest_session_id: null, deleted_at: null },
      note({ id: "newest-lineup" }),
      note({ id: "older-lineup" }),
    ];
    assert.equal((pickNewestLineupNote(rows) as { id?: string }).id, "newest-lineup");
  });

  it("skips deleted and human-authored rows", () => {
    const rows = [
      note({ id: "deleted", deleted_at: "2026-07-10T00:00:00Z" }),
      note({ id: "guest-msg", guest_session_id: "gs1" }),
      note({ id: "coordinator", sender_user_id: "u1" }),
      note({ id: "valid" }),
    ];
    assert.equal((pickNewestLineupNote(rows) as { id?: string }).id, "valid");
  });

  it("returns null when no lineup note exists in the window", () => {
    const rows = [
      { metadata: { chip_kind: "budget" }, sender_user_id: null, guest_session_id: null, deleted_at: null },
      note({ metadata: { chip_kind: "location" } }),
    ];
    assert.equal(pickNewestLineupNote(rows), null);
  });

  it("returns null on an empty window", () => {
    assert.equal(pickNewestLineupNote([]), null);
  });
});
