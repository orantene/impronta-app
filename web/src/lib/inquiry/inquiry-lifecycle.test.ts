/**
 * CHARACTERIZATION TEST — inquiry-lifecycle.ts
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 "Test gap" + §5).
 * Pins the CURRENT behavior of the inquiry status machine BEFORE the
 * Phase 1c (messages.tsx) / Phase 2 (ThreadShell) refactors touch the
 * message/inquiry data flow. This file ADDS a test only — it does not
 * fix anything. Quirks are pinned as-is, not corrected.
 *
 * Run: npx tsx --test src/lib/inquiry/inquiry-lifecycle.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  CANONICAL_STATUSES,
  LEGACY_STATUSES,
  STATUS_LABELS,
  type CanonicalInquiryStatus,
  canTransition,
  getAllowedTransitions,
  getWorkflowPhase,
  isMutablePhase,
  isTerminalPhase,
  resolveNextActionBy,
  validateInquiryConsistency,
} from "./inquiry-lifecycle";

// ─────────────────────────────────────────────────────────────────────────────
// Independent oracle — hard-coded here so a change to the source's
// CANONICAL_EDGES (or the legacy→phase table) fails these tests.
// This is the literal allowed-transition adjacency as of 2026-05-19.
// ─────────────────────────────────────────────────────────────────────────────

const CANON: CanonicalInquiryStatus[] = [
  "draft",
  "submitted",
  "coordination",
  "offer_pending",
  "approved",
  "booked",
  "rejected",
  "expired",
  "archived",
];

const ALLOWED: Record<CanonicalInquiryStatus, CanonicalInquiryStatus[]> = {
  draft: ["submitted", "archived"],
  submitted: ["coordination", "rejected", "expired", "archived"],
  coordination: ["offer_pending", "rejected", "expired", "archived"],
  offer_pending: ["coordination", "approved", "rejected", "expired", "archived"],
  approved: ["booked", "coordination", "rejected", "archived"],
  booked: ["archived"],
  rejected: ["archived"],
  expired: ["archived"],
  archived: [],
};

describe("status enum surface", () => {
  it("CANONICAL_STATUSES is exactly the 9-value canonical list, in order", () => {
    assert.deepEqual(
      [...CANONICAL_STATUSES],
      [
        "draft",
        "submitted",
        "coordination",
        "offer_pending",
        "approved",
        "booked",
        "rejected",
        "expired",
        "archived",
      ],
    );
  });

  it("LEGACY_STATUSES is exactly the 9-value legacy list, in order", () => {
    assert.deepEqual(
      [...LEGACY_STATUSES],
      [
        "new",
        "reviewing",
        "waiting_for_client",
        "talent_suggested",
        "in_progress",
        "qualified",
        "converted",
        "closed",
        "closed_lost",
      ],
    );
  });

  it("STATUS_LABELS maps every canonical + legacy DB value to its display label", () => {
    assert.deepEqual(STATUS_LABELS, {
      draft: "Draft",
      submitted: "Submitted",
      coordination: "Coordination",
      offer_pending: "Offer pending",
      approved: "Approved",
      booked: "Booked",
      rejected: "Rejected",
      expired: "Expired",
      archived: "Archived",
      new: "New",
      reviewing: "Under review",
      waiting_for_client: "Waiting for client",
      talent_suggested: "Talent suggested",
      in_progress: "In progress",
      qualified: "Qualified",
      converted: "Converted",
      closed: "Closed",
      closed_lost: "Closed (lost)",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getWorkflowPhase — legacy→canonical phase mapping + unknown fallback.
// ─────────────────────────────────────────────────────────────────────────────

describe("getWorkflowPhase", () => {
  it("canonical statuses map to the identically-named phase", () => {
    for (const s of CANON) {
      assert.equal(getWorkflowPhase(s), s, `${s} should map to phase ${s}`);
    }
  });

  const legacyToPhase: Record<string, string> = {
    new: "submitted",
    reviewing: "coordination",
    waiting_for_client: "coordination",
    talent_suggested: "coordination",
    in_progress: "coordination",
    qualified: "coordination",
    converted: "booked",
    closed_lost: "rejected",
    closed: "archived",
  };
  for (const [legacy, phase] of Object.entries(legacyToPhase)) {
    it(`legacy "${legacy}" maps to phase "${phase}"`, () => {
      assert.equal(getWorkflowPhase(legacy), phase);
    });
  }

  it("QUIRK: an unknown status falls back to phase 'coordination' (not draft/null)", () => {
    assert.equal(getWorkflowPhase("totally-made-up"), "coordination");
    assert.equal(getWorkflowPhase(""), "coordination");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isTerminalPhase / isMutablePhase
// ─────────────────────────────────────────────────────────────────────────────

describe("isTerminalPhase", () => {
  const terminal = ["booked", "rejected", "expired", "archived"];
  const nonTerminal = ["draft", "submitted", "coordination", "offer_pending", "approved"];
  for (const s of terminal) {
    it(`"${s}" is terminal`, () => assert.equal(isTerminalPhase(s), true));
  }
  for (const s of nonTerminal) {
    it(`"${s}" is NOT terminal`, () => assert.equal(isTerminalPhase(s), false));
  }
  it("legacy 'converted' (→booked) is terminal; 'reviewing' (→coordination) is not", () => {
    assert.equal(isTerminalPhase("converted"), true);
    assert.equal(isTerminalPhase("reviewing"), false);
  });
  it("QUIRK: unknown status is NOT terminal (maps to coordination)", () => {
    assert.equal(isTerminalPhase("garbage"), false);
  });
});

describe("isMutablePhase", () => {
  it("isFrozen=true forces NOT mutable, regardless of status", () => {
    assert.equal(isMutablePhase("draft", true), false);
    assert.equal(isMutablePhase("coordination", true), false);
    assert.equal(isMutablePhase("approved", true), false);
  });
  it("booked and archived are NOT mutable", () => {
    assert.equal(isMutablePhase("booked"), false);
    assert.equal(isMutablePhase("archived"), false);
  });
  it("draft/submitted/coordination/offer_pending/approved are mutable", () => {
    for (const s of ["draft", "submitted", "coordination", "offer_pending", "approved"]) {
      assert.equal(isMutablePhase(s), true, `${s} should be mutable`);
    }
  });
  it("QUIRK: 'rejected' and 'expired' are terminal yet still report MUTABLE (only booked/archived block)", () => {
    // Surprising but this is the contract today: isTerminalPhase(rejected)=true
    // while isMutablePhase(rejected)=true. Pinned as-is, not judged a bug.
    assert.equal(isTerminalPhase("rejected"), true);
    assert.equal(isMutablePhase("rejected"), true);
    assert.equal(isTerminalPhase("expired"), true);
    assert.equal(isMutablePhase("expired"), true);
  });
  it("QUIRK: unknown status is mutable (maps to coordination)", () => {
    assert.equal(isMutablePhase("garbage"), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAllowedTransitions — canonical edges + legacy is mapped first.
// ─────────────────────────────────────────────────────────────────────────────

describe("getAllowedTransitions", () => {
  for (const from of CANON) {
    it(`"${from}" → [${ALLOWED[from].join(", ")}]`, () => {
      assert.deepEqual(getAllowedTransitions(from), ALLOWED[from]);
    });
  }

  it("legacy 'new' resolves to submitted's edges", () => {
    assert.deepEqual(getAllowedTransitions("new"), ALLOWED.submitted);
  });
  it("legacy 'converted' resolves to booked's edges (['archived'])", () => {
    assert.deepEqual(getAllowedTransitions("converted"), ["archived"]);
  });
  it("legacy 'closed' resolves to archived's edges ([])", () => {
    assert.deepEqual(getAllowedTransitions("closed"), []);
  });
  it("legacy 'closed_lost' resolves to rejected's edges (['archived'])", () => {
    assert.deepEqual(getAllowedTransitions("closed_lost"), ["archived"]);
  });
  it("the 5 coordination-phase legacy values all resolve to coordination's edges", () => {
    for (const s of ["reviewing", "waiting_for_client", "talent_suggested", "in_progress", "qualified"]) {
      assert.deepEqual(getAllowedTransitions(s), ALLOWED.coordination, s);
    }
  });
  it("QUIRK: unknown status resolves to coordination's edges", () => {
    assert.deepEqual(getAllowedTransitions("garbage"), ALLOWED.coordination);
  });
  it("returns a fresh array — mutating the result does not corrupt internal state", () => {
    const a = getAllowedTransitions("submitted");
    a.push("draft" as CanonicalInquiryStatus);
    assert.deepEqual(getAllowedTransitions("submitted"), ALLOWED.submitted);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canTransition — EVERY allowed edge + EVERY blocked edge of the 9×9
// canonical matrix. One assertion per ordered pair (81 total: 22 allowed,
// 59 blocked, diagonal self-edges are all blocked).
// ─────────────────────────────────────────────────────────────────────────────

describe("canTransition — full 9×9 canonical edge matrix", () => {
  let allowedCount = 0;
  let blockedCount = 0;

  for (const from of CANON) {
    it(`from "${from}": each of the 9 target statuses pins one allowed/blocked edge`, () => {
      for (const to of CANON) {
        const expected = ALLOWED[from].includes(to);
        const result = canTransition(from, to);
        if (expected) {
          allowedCount++;
          assert.deepEqual(result, { ok: true }, `${from} → ${to} should be ALLOWED`);
        } else {
          blockedCount++;
          assert.deepEqual(
            result,
            { ok: false, reason: "invalid_status_transition" },
            `${from} → ${to} should be BLOCKED (invalid_status_transition)`,
          );
        }
      }
    });
  }

  it("the matrix has exactly 22 allowed edges and 59 blocked edges (incl. all 9 self-edges blocked)", () => {
    assert.equal(allowedCount, 22, "allowed edge count");
    assert.equal(blockedCount, 59, "blocked edge count");
    for (const s of CANON) {
      assert.deepEqual(
        canTransition(s, s),
        { ok: false, reason: "invalid_status_transition" },
        `self-edge ${s}→${s} must be blocked`,
      );
    }
  });
});

describe("canTransition — frozen context short-circuits before edge logic", () => {
  it("frozen blocks an otherwise-ALLOWED edge with reason 'inquiry_frozen'", () => {
    assert.deepEqual(canTransition("draft", "submitted", { isFrozen: true }), {
      ok: false,
      reason: "inquiry_frozen",
    });
  });
  it("frozen on an otherwise-BLOCKED edge still reports 'inquiry_frozen' (frozen check wins)", () => {
    assert.deepEqual(canTransition("archived", "draft", { isFrozen: true }), {
      ok: false,
      reason: "inquiry_frozen",
    });
  });
  it("isFrozen:false behaves identically to no context", () => {
    assert.deepEqual(canTransition("draft", "submitted", { isFrozen: false }), { ok: true });
  });
});

describe("canTransition — legacy + unknown statuses are phase-mapped to canonical first", () => {
  it("legacy→legacy: 'new' → 'reviewing' is submitted→coordination = ALLOWED", () => {
    assert.deepEqual(canTransition("new", "reviewing"), { ok: true });
  });
  it("legacy→canonical: 'converted' → 'archived' is booked→archived = ALLOWED", () => {
    assert.deepEqual(canTransition("converted", "archived"), { ok: true });
  });
  it("legacy→legacy: 'closed' → 'closed' is archived→archived = BLOCKED", () => {
    assert.deepEqual(canTransition("closed", "closed"), {
      ok: false,
      reason: "invalid_status_transition",
    });
  });
  it("QUIRK: unknown 'from' maps to coordination — 'garbage' → 'offer_pending' is ALLOWED", () => {
    assert.deepEqual(canTransition("garbage", "offer_pending"), { ok: true });
  });
  it("QUIRK: unknown 'to' maps to coordination — 'submitted' → 'garbage' is ALLOWED", () => {
    // submitted → coordination is allowed, and 'garbage' resolves to coordination.
    assert.deepEqual(canTransition("submitted", "garbage"), { ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveNextActionBy
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveNextActionBy", () => {
  it("draft → 'client'", () => assert.equal(resolveNextActionBy("draft"), "client"));
  it("submitted → 'coordinator'", () => assert.equal(resolveNextActionBy("submitted"), "coordinator"));
  it("coordination → 'coordinator' (no ctx)", () =>
    assert.equal(resolveNextActionBy("coordination"), "coordinator"));
  it("coordination + hasPendingTalentAcceptance → 'talent'", () =>
    assert.equal(resolveNextActionBy("coordination", { hasPendingTalentAcceptance: true }), "talent"));
  it("offer_pending → 'client' (no ctx)", () =>
    assert.equal(resolveNextActionBy("offer_pending"), "client"));
  it("offer_pending + hasPendingTalentApproval → 'talent'", () =>
    assert.equal(resolveNextActionBy("offer_pending", { hasPendingTalentApproval: true }), "talent"));
  it("approved → 'coordinator'", () => assert.equal(resolveNextActionBy("approved"), "coordinator"));
  it("booked/rejected/expired/archived → null", () => {
    for (const s of ["booked", "rejected", "expired", "archived"]) {
      assert.equal(resolveNextActionBy(s), null, s);
    }
  });
  it("legacy 'new' (→submitted) → 'coordinator'; 'converted' (→booked) → null", () => {
    assert.equal(resolveNextActionBy("new"), "coordinator");
    assert.equal(resolveNextActionBy("converted"), null);
  });
  it("QUIRK: unknown status → 'coordinator' (maps to coordination, NOT null)", () => {
    assert.equal(resolveNextActionBy("garbage"), "coordinator");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateInquiryConsistency — check order matters (terminal check first).
// ─────────────────────────────────────────────────────────────────────────────

describe("validateInquiryConsistency", () => {
  const base = {
    status: "coordination",
    next_action_by: "coordinator" as string | null,
    coordinator_id: null as string | null,
    current_offer_id: null as string | null,
    booked_at: null as string | null,
    is_frozen: false,
    frozen_at: null as string | null,
    frozen_by_user_id: null as string | null,
  };

  it("a consistent non-terminal inquiry with next_action_by set is OK", () => {
    assert.deepEqual(validateInquiryConsistency({ ...base }), { ok: true });
  });

  it("coordinator_id / current_offer_id are accepted but NOT enforced (null is fine)", () => {
    assert.deepEqual(
      validateInquiryConsistency({ ...base, coordinator_id: null, current_offer_id: null }),
      { ok: true },
    );
  });

  it("terminal phase + non-null next_action_by → fails with the terminal message", () => {
    assert.deepEqual(
      validateInquiryConsistency({ ...base, status: "archived", next_action_by: "client" }),
      { ok: false, message: "next_action_by must be null in terminal phase" },
    );
  });

  it("terminal phase + null next_action_by → passes the terminal check", () => {
    assert.deepEqual(
      validateInquiryConsistency({ ...base, status: "archived", next_action_by: null }),
      { ok: true },
    );
  });

  it("booked + no booked_at + null next_action_by → fails 'booked status requires booked_at'", () => {
    assert.deepEqual(
      validateInquiryConsistency({ ...base, status: "booked", next_action_by: null, booked_at: null }),
      { ok: false, message: "booked status requires booked_at" },
    );
  });

  it("booked + booked_at set + null next_action_by → OK", () => {
    assert.deepEqual(
      validateInquiryConsistency({
        ...base,
        status: "booked",
        next_action_by: null,
        booked_at: "2026-05-19T00:00:00Z",
      }),
      { ok: true },
    );
  });

  it("QUIRK: check ORDER — booked + next_action_by set + no booked_at returns the next_action_by message (terminal check runs first)", () => {
    assert.deepEqual(
      validateInquiryConsistency({
        ...base,
        status: "booked",
        next_action_by: "client",
        booked_at: null,
      }),
      { ok: false, message: "next_action_by must be null in terminal phase" },
    );
  });

  it("is_frozen with missing frozen_at → fails", () => {
    assert.deepEqual(
      validateInquiryConsistency({
        ...base,
        is_frozen: true,
        frozen_at: null,
        frozen_by_user_id: "u1",
      }),
      { ok: false, message: "frozen inquiry requires frozen_at and frozen_by_user_id" },
    );
  });

  it("is_frozen with missing frozen_by_user_id → fails", () => {
    assert.deepEqual(
      validateInquiryConsistency({
        ...base,
        is_frozen: true,
        frozen_at: "2026-05-19T00:00:00Z",
        frozen_by_user_id: null,
      }),
      { ok: false, message: "frozen inquiry requires frozen_at and frozen_by_user_id" },
    );
  });

  it("is_frozen fully stamped → OK (frozen check passes when both present)", () => {
    assert.deepEqual(
      validateInquiryConsistency({
        ...base,
        is_frozen: true,
        frozen_at: "2026-05-19T00:00:00Z",
        frozen_by_user_id: "u1",
      }),
      { ok: true },
    );
  });
});
