/**
 * UNIT TEST — guest-draft-resume.ts (P0-1, message-panel wave W0-A).
 *
 * Pins the duplicate-draft fix: guest early drafts carry NO inquiry_participants
 * rows (the lineup lives only on interpreted_query.talent.selected_ids), so the
 * resume/ensure pickers MUST key on the lineup spine. Covered here:
 *   (a) a second ensure for the same session+tenant+talent picks the SAME draft
 *       (no insert),
 *   (b) an ensure for a DIFFERENT talent still reuses the existing draft,
 *   (c) the ensure/write-target pick NEVER returns a sent/submitted row,
 *   (d) resume prefers a draft containing the talent over a newer sent thread.
 *
 * Run: npx tsx --test src/lib/inquiry/guest-draft-resume.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  pickGuestEnsureTarget,
  pickGuestResumeTarget,
  readSelectedIds,
} from "./guest-draft-resume";

const TALENT_A = "talent-aaaa";
const TALENT_B = "talent-bbbb";

/** Build a candidate row the way guest-chat-actions fetches them. */
function row(id: string, status: string, lineup: string[] | null = null) {
  return {
    id,
    status,
    contact_name: "Guest",
    contact_email: `pending-x@guest.impronta`,
    interpreted_query:
      lineup === null
        ? null
        : { schema_version: 1, talent: { selected_ids: lineup, selection_mode: "i_know_who" } },
  };
}

describe("readSelectedIds", () => {
  it("reads the lineup off interpreted_query.talent.selected_ids", () => {
    assert.deepEqual(
      readSelectedIds({ talent: { selected_ids: [TALENT_A, TALENT_B] } }),
      [TALENT_A, TALENT_B],
    );
  });

  it("is tolerant of every malformed/legacy shape (never throws, returns [])", () => {
    assert.deepEqual(readSelectedIds(null), []);
    assert.deepEqual(readSelectedIds(undefined), []);
    assert.deepEqual(readSelectedIds("nope"), []);
    assert.deepEqual(readSelectedIds({}), []);
    assert.deepEqual(readSelectedIds({ talent: "nope" }), []);
    assert.deepEqual(readSelectedIds({ talent: { selected_ids: "nope" } }), []);
    assert.deepEqual(readSelectedIds({ talent: { selected_ids: [1, "", null] } }), []);
  });

  it("dedupes repeated ids", () => {
    assert.deepEqual(
      readSelectedIds({ talent: { selected_ids: [TALENT_A, TALENT_A] } }),
      [TALENT_A],
    );
  });
});

describe("pickGuestEnsureTarget (the ensure/write-target pick)", () => {
  it("(a) second ensure with the same talent returns the SAME draft id, no insert", () => {
    // First call: no live rows -> null -> the caller inserts draft-1.
    assert.equal(pickGuestEnsureTarget([], TALENT_A), null);

    // Second call: the freshly inserted draft is now in the candidate set. The
    // old participants gate could never see it (early drafts have no
    // participant rows); the lineup-spine pick MUST return it.
    const draft1 = row("draft-1", "draft", [TALENT_A]);
    const picked = pickGuestEnsureTarget([draft1], TALENT_A);
    assert.ok(picked, "expected the existing draft to be reused");
    assert.equal(picked.row.id, "draft-1");
    assert.equal(picked.containsTalent, true);
  });

  it("(b) ensure with a DIFFERENT talent still returns the existing draft (no new row)", () => {
    const draft1 = row("draft-1", "draft", [TALENT_A]);
    const picked = pickGuestEnsureTarget([draft1], TALENT_B);
    assert.ok(picked, "a live draft must NEVER be bypassed to insert a duplicate");
    assert.equal(picked.row.id, "draft-1");
    assert.equal(picked.containsTalent, false);
  });

  it("(c) never returns a sent/submitted row as the write target (talent branch)", () => {
    const sent = row("sent-1", "submitted", [TALENT_A]);
    assert.equal(pickGuestEnsureTarget([sent], TALENT_A), null);
  });

  it("(c) never returns a sent/submitted row as the write target (agency branch)", () => {
    const sent = row("sent-1", "submitted", []);
    assert.equal(pickGuestEnsureTarget([sent], null), null);
  });

  it("(c) picks the draft, not a newer sent row, when both are live", () => {
    const sentNewest = row("sent-1", "submitted", [TALENT_A]);
    const draftOlder = row("draft-1", "draft", [TALENT_A]);
    const picked = pickGuestEnsureTarget([sentNewest, draftOlder], TALENT_A);
    assert.ok(picked);
    assert.equal(picked.row.id, "draft-1");
  });

  it("prefers the newest draft CONTAINING the talent over a newer talent-less draft", () => {
    const draftNewest = row("draft-2", "draft", []);
    const draftWithTalent = row("draft-1", "draft", [TALENT_A]);
    const picked = pickGuestEnsureTarget([draftNewest, draftWithTalent], TALENT_A);
    assert.ok(picked);
    assert.equal(picked.row.id, "draft-1");
    assert.equal(picked.containsTalent, true);
  });

  it("agency-level (no talent): reuses the newest live draft", () => {
    const sentNewest = row("sent-1", "submitted", []);
    const draftMid = row("draft-2", "draft", [TALENT_B]);
    const draftOld = row("draft-1", "draft", [TALENT_A]);
    const picked = pickGuestEnsureTarget([sentNewest, draftMid, draftOld], null);
    assert.ok(picked);
    assert.equal(picked.row.id, "draft-2");
  });
});

describe("pickGuestResumeTarget (the read-resume pick)", () => {
  it("(d) prefers the draft containing the talent over a NEWER sent thread", () => {
    const sentNewest = row("sent-1", "submitted", [TALENT_A]);
    const draftOlder = row("draft-1", "draft", [TALENT_A]);
    const picked = pickGuestResumeTarget([sentNewest, draftOlder], TALENT_A);
    assert.ok(picked);
    assert.equal(picked.row.id, "draft-1");
    assert.equal(picked.containsTalent, true);
  });

  it("falls back to ANY live draft, flagged containsTalent:false", () => {
    const draft = row("draft-1", "draft", [TALENT_A]);
    const picked = pickGuestResumeTarget([draft], TALENT_B);
    assert.ok(picked, "a session with a live draft resumes it, never restarts");
    assert.equal(picked.row.id, "draft-1");
    assert.equal(picked.containsTalent, false);
  });

  it("no drafts: resumes the newest sent thread whose lineup contains the talent", () => {
    const sentOther = row("sent-2", "submitted", [TALENT_B]);
    const sentWithTalent = row("sent-1", "submitted", [TALENT_A]);
    const picked = pickGuestResumeTarget([sentOther, sentWithTalent], TALENT_A);
    assert.ok(picked);
    assert.equal(picked.row.id, "sent-1");
    assert.equal(picked.containsTalent, true);
  });

  it("returns null when nothing is resumable for this talent (fresh start)", () => {
    const sentOther = row("sent-1", "submitted", [TALENT_B]);
    assert.equal(pickGuestResumeTarget([sentOther], TALENT_A), null);
    assert.equal(pickGuestResumeTarget([], TALENT_A), null);
  });

  it("agency launcher (no talent context): resumes the newest live row of any status", () => {
    const sentNewest = row("sent-1", "submitted", []);
    const draftOlder = row("draft-1", "draft", [TALENT_A]);
    const picked = pickGuestResumeTarget([sentNewest, draftOlder], null);
    assert.ok(picked);
    assert.equal(picked.row.id, "sent-1");
  });

  it("tolerates legacy rows with no interpreted_query at all", () => {
    const legacy = row("legacy-1", "submitted", null);
    assert.equal(pickGuestResumeTarget([legacy], TALENT_A), null);
    const legacyDraft = row("legacy-2", "draft", null);
    const picked = pickGuestResumeTarget([legacyDraft], TALENT_A);
    assert.ok(picked);
    assert.equal(picked.containsTalent, false);
  });
});
