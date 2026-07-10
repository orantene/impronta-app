/**
 * UNIT TEST — inquiry-context-resolver.ts (Jon 360 CRO, blocker B3).
 *
 * Pins the CTA-state precedence machine. Mirrors the style of
 * inquiry-lifecycle.test.ts. Covers every output kind, the full precedence
 * ordering (esp. terminal rule 0 beats everything; sent rule 1 beats the
 * lineup rules), the sent_awaiting vs live_conversation distinction across the
 * coordinatorId x lastMessageRole matrix, pick_inquiry, and the resume_draft
 * staleness boundary.
 *
 * CRITICAL regression guard: for EVERY terminal status in the lifecycle enum
 * (canonical + legacy), resolveInquiryCta must return kind "terminal" and never
 * a forward-motion kind. This is the dead-CTA-class guard.
 *
 * Run: npx tsx --test src/lib/inquiry/inquiry-context-resolver.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  CANONICAL_STATUSES,
  LEGACY_STATUSES,
  getWorkflowPhase,
  isTerminalPhase,
} from "./inquiry-lifecycle";
import {
  FORWARD_MOTION_KINDS,
  STALE_DRAFT_MS,
  type InquiryCtaInput,
  type InquiryCtaState,
  deriveTerminalReason,
  resolveInquiryCta,
} from "./inquiry-context-resolver";

// Fixed clock so staleness math is deterministic.
const NOW = Date.parse("2026-06-26T00:00:00.000Z");

// A minimal, neutral baseline: a talent-focused surface, empty lineup, no
// draft, no active inquiry, no other open inquiries. Each test overrides only
// the fields that matter to it.
const base: InquiryCtaInput = {
  talentProfileId: "talent-1",
  isInLineup: false,
  lineupCount: 0,
  lineupTalentIds: [],
  contactPromoted: false,
  hasActiveDraft: false,
  draftInquiryId: null,
  activePhase: null,
  activeStatus: null,
  otherOpenInquiries: [],
  identity: "guest",
  lastActivityAt: null,
  coordinatorId: null,
  lastMessageRole: null,
};

function resolve(overrides: Partial<InquiryCtaInput>): InquiryCtaState {
  return resolveInquiryCta({ ...base, ...overrides }, NOW);
}

const FORWARD: ReadonlySet<string> = new Set<string>(FORWARD_MOTION_KINDS);

// ─────────────────────────────────────────────────────────────────────────────
// Each output kind is reachable.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveInquiryCta — every output kind is reachable", () => {
  it("add_first: talent focus, no lineup, no draft", () => {
    assert.deepEqual(resolve({}), { kind: "add_first" });
  });

  it("add_to_lineup: talent focus, draft exists, talent NOT in lineup", () => {
    assert.deepEqual(resolve({ hasActiveDraft: true, lineupCount: 2 }), {
      kind: "add_to_lineup",
      lineupCount: 2,
    });
  });

  it("in_lineup: talent focus, talent already in lineup", () => {
    assert.deepEqual(resolve({ isInLineup: true, lineupCount: 3 }), {
      kind: "in_lineup",
      lineupCount: 3,
    });
  });

  it("review_lineup: no talent focus, non-empty lineup", () => {
    assert.deepEqual(resolve({ talentProfileId: null, lineupCount: 4 }), {
      kind: "review_lineup",
      lineupCount: 4,
    });
  });

  it("pick_inquiry: talent focus + other open inquiries", () => {
    const others = [{ id: "i1", phase: "coordination" as const, label: "Editorial" }];
    assert.deepEqual(resolve({ otherOpenInquiries: others }), {
      kind: "pick_inquiry",
      otherOpenInquiries: others,
    });
  });

  it("resume_draft: no talent focus, stale draft, empty lineup", () => {
    const stale = new Date(NOW - STALE_DRAFT_MS - 1).toISOString();
    assert.deepEqual(
      resolve({
        talentProfileId: null,
        hasActiveDraft: true,
        draftInquiryId: "draft-9",
        lastActivityAt: stale,
      }),
      { kind: "resume_draft", draftInquiryId: "draft-9" },
    );
  });

  it("sent_awaiting: submitted phase, no coordinator", () => {
    assert.deepEqual(resolve({ activePhase: "submitted", activeStatus: "submitted" }), {
      kind: "sent_awaiting",
      phase: "submitted",
    });
  });

  it("live_conversation: coordination phase, coordinator + coordinator spoke last", () => {
    assert.deepEqual(
      resolve({
        activePhase: "coordination",
        activeStatus: "coordination",
        coordinatorId: "coord-1",
        lastMessageRole: "coordinator",
      }),
      { kind: "live_conversation", phase: "coordination", coordinatorId: "coord-1" },
    );
  });

  it("terminal: booked active inquiry", () => {
    assert.deepEqual(resolve({ activePhase: "booked", activeStatus: "booked" }), {
      kind: "terminal",
      reason: "booked",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Precedence ordering — higher rules win over everything below them.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveInquiryCta — precedence ordering", () => {
  it("rule 0 (terminal) beats a fully-loaded forward context", () => {
    // Everything that could push a forward-motion CTA is set, yet terminal wins.
    const out = resolve({
      activePhase: "rejected",
      activeStatus: "rejected",
      talentProfileId: "talent-1",
      isInLineup: true,
      lineupCount: 5,
      hasActiveDraft: true,
      draftInquiryId: "draft-1",
      otherOpenInquiries: [{ id: "i1", phase: "coordination" }],
      coordinatorId: "coord-1",
      lastMessageRole: "coordinator",
    });
    assert.deepEqual(out, { kind: "terminal", reason: "declined" });
  });

  it("rule 0 (terminal) beats an otherwise-live SENT phase", () => {
    // archived is both terminal AND would never be a SENT phase, but prove the
    // short-circuit by also setting live-conversation signals.
    const out = resolve({
      activePhase: "archived",
      activeStatus: "archived",
      coordinatorId: "coord-1",
      lastMessageRole: "you",
    });
    assert.deepEqual(out, { kind: "terminal", reason: "closed" });
  });

  it("rule 1 (sent) beats pick_inquiry / in_lineup / add_to_lineup / add_first", () => {
    const out = resolve({
      activePhase: "coordination",
      activeStatus: "coordination",
      otherOpenInquiries: [{ id: "i1", phase: "coordination" }],
      isInLineup: true,
      lineupCount: 3,
      hasActiveDraft: true,
    });
    // No coordinator + coordinator/you did not speak last -> sent_awaiting, not lineup.
    assert.deepEqual(out, { kind: "sent_awaiting", phase: "coordination" });
  });

  it("rule 2 (pick_inquiry) beats in_lineup / add_to_lineup / add_first", () => {
    const others = [{ id: "i1", phase: "offer_pending" as const }];
    const out = resolve({
      otherOpenInquiries: others,
      isInLineup: true,
      lineupCount: 2,
      hasActiveDraft: true,
    });
    assert.deepEqual(out, { kind: "pick_inquiry", otherOpenInquiries: others });
  });

  it("rule 2 (pick_inquiry) requires a talent focus — null talent skips to review_lineup", () => {
    const others = [{ id: "i1", phase: "coordination" as const }];
    const out = resolve({
      talentProfileId: null,
      otherOpenInquiries: others,
      lineupCount: 2,
    });
    assert.deepEqual(out, { kind: "review_lineup", lineupCount: 2 });
  });

  it("rule 3 (in_lineup) beats add_to_lineup even when a draft exists", () => {
    const out = resolve({ isInLineup: true, hasActiveDraft: true, lineupCount: 1 });
    assert.deepEqual(out, { kind: "in_lineup", lineupCount: 1 });
  });

  it("rule 4 (add_to_lineup) requires a draft; without one falls to add_first", () => {
    assert.deepEqual(resolve({ hasActiveDraft: false }), { kind: "add_first" });
    assert.deepEqual(resolve({ hasActiveDraft: true, lineupCount: 1 }), {
      kind: "add_to_lineup",
      lineupCount: 1,
    });
  });

  it("rule 6 (review_lineup) only fires when talent focus is null", () => {
    // With a talent focus + empty lineup + no draft, we get add_first, not review.
    assert.deepEqual(resolve({ talentProfileId: "talent-1", lineupCount: 3 }), {
      kind: "add_first",
    });
    assert.deepEqual(resolve({ talentProfileId: null, lineupCount: 3 }), {
      kind: "review_lineup",
      lineupCount: 3,
    });
  });

  it("rule 8 (default add_first): no talent, empty lineup, no active inquiry", () => {
    assert.deepEqual(resolve({ talentProfileId: null, lineupCount: 0 }), { kind: "add_first" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sent_awaiting vs live_conversation — full coordinatorId x lastMessageRole.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveInquiryCta — sent vs live across coordinatorId x lastMessageRole", () => {
  const roles = ["coordinator", "client", "you", "system", "talent", null] as const;

  for (const phase of ["submitted", "coordination", "offer_pending", "approved"] as const) {
    describe(`phase "${phase}"`, () => {
      for (const role of roles) {
        for (const hasCoord of [true, false]) {
          const coordinatorId = hasCoord ? "coord-1" : null;
          const liveExpected =
            hasCoord && (role === "coordinator" || role === "you");
          it(`coordinator=${hasCoord} lastMessageRole=${role} -> ${liveExpected ? "live_conversation" : "sent_awaiting"}`, () => {
            const out = resolve({
              activePhase: phase,
              activeStatus: phase,
              coordinatorId,
              lastMessageRole: role,
            });
            if (liveExpected) {
              assert.deepEqual(out, {
                kind: "live_conversation",
                phase,
                coordinatorId: "coord-1",
              });
            } else {
              assert.deepEqual(out, { kind: "sent_awaiting", phase });
            }
          });
        }
      }
    });
  }

  it("coordinator assigned but client spoke last -> sent_awaiting (ball is with the agency)", () => {
    assert.deepEqual(
      resolve({
        activePhase: "coordination",
        activeStatus: "coordination",
        coordinatorId: "coord-1",
        lastMessageRole: "client",
      }),
      { kind: "sent_awaiting", phase: "coordination" },
    );
  });

  it("coordinator/you spoke last but NO coordinator assigned -> sent_awaiting (not live)", () => {
    assert.deepEqual(
      resolve({
        activePhase: "coordination",
        activeStatus: "coordination",
        coordinatorId: null,
        lastMessageRole: "coordinator",
      }),
      { kind: "sent_awaiting", phase: "coordination" },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pick_inquiry.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveInquiryCta — pick_inquiry", () => {
  it("carries the otherOpenInquiries array through untouched", () => {
    const others = [
      { id: "i1", phase: "coordination" as const, label: "Editorial" },
      { id: "i2", phase: "offer_pending" as const },
    ];
    const out = resolve({ otherOpenInquiries: others });
    assert.deepEqual(out, { kind: "pick_inquiry", otherOpenInquiries: others });
  });

  it("empty otherOpenInquiries does NOT trigger pick_inquiry", () => {
    assert.deepEqual(resolve({ otherOpenInquiries: [] }), { kind: "add_first" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resume_draft staleness boundary.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveInquiryCta — resume_draft staleness boundary", () => {
  const draftCtx: Partial<InquiryCtaInput> = {
    talentProfileId: null,
    hasActiveDraft: true,
    draftInquiryId: "draft-1",
    lineupCount: 0,
  };

  it("draft exactly AT the threshold is NOT stale (strictly greater-than)", () => {
    const atThreshold = new Date(NOW - STALE_DRAFT_MS).toISOString();
    // Not stale -> no resume_draft; falls through to default add_first.
    assert.deepEqual(resolve({ ...draftCtx, lastActivityAt: atThreshold }), {
      kind: "add_first",
    });
  });

  it("draft 1ms past the threshold IS stale -> resume_draft", () => {
    const past = new Date(NOW - STALE_DRAFT_MS - 1).toISOString();
    assert.deepEqual(resolve({ ...draftCtx, lastActivityAt: past }), {
      kind: "resume_draft",
      draftInquiryId: "draft-1",
    });
  });

  it("fresh draft (recent activity) is NOT stale -> default add_first", () => {
    const fresh = new Date(NOW - 60_000).toISOString();
    assert.deepEqual(resolve({ ...draftCtx, lastActivityAt: fresh }), { kind: "add_first" });
  });

  it("null lastActivityAt is NOT treated as stale", () => {
    assert.deepEqual(resolve({ ...draftCtx, lastActivityAt: null }), { kind: "add_first" });
  });

  it("unparseable lastActivityAt is NOT treated as stale", () => {
    assert.deepEqual(resolve({ ...draftCtx, lastActivityAt: "not-a-date" }), {
      kind: "add_first",
    });
  });

  it("a talent-focused stale draft prefers add_to_lineup over resume_draft (rule 4 beats rule 7)", () => {
    const stale = new Date(NOW - STALE_DRAFT_MS - 1).toISOString();
    assert.deepEqual(
      resolve({
        talentProfileId: "talent-1",
        hasActiveDraft: true,
        draftInquiryId: "draft-1",
        lastActivityAt: stale,
        lineupCount: 1,
      }),
      { kind: "add_to_lineup", lineupCount: 1 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT reads as a DRAFT — never "Inquiry sent" (P0-2 / W0-B).
//
// A pure early-partial row anchors the resolver with activePhase "draft" (the
// lifecycle's pre-send phase). "draft" is NOT in SENT_LIVE_PHASES and is not
// terminal, so rule 1 (sent_awaiting) must NEVER fire for it — the resolver
// falls through to its lineup/draft/resume states. Those states map in
// launcher-cta-label.ts to the LINEUP keys ("Your lineup (N)" / resume copy),
// NOT ctaSent ("Inquiry sent"). A genuinely SENT thread still yields
// sent_awaiting. This suite is the regression pin for the live "pure draft shows
// Inquiry sent" bug.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveInquiryCta — a draft phase never reads as sent (P0-2 / W0-B)", () => {
  const draftBase: Partial<InquiryCtaInput> = {
    activePhase: "draft",
    activeStatus: "draft",
    hasActiveDraft: true,
    draftInquiryId: "draft-1",
  };

  it("draft-only, talent already in lineup -> in_lineup (never sent_awaiting)", () => {
    // rule 1 (sent) is skipped for the draft phase; rule 3 (in_lineup) wins.
    // in_lineup -> launcher key ctaLineup ("Your lineup (N)"), not ctaSent.
    const out = resolve({ ...draftBase, isInLineup: true, lineupCount: 3 });
    assert.deepEqual(out, { kind: "in_lineup", lineupCount: 3 });
    assert.notEqual(out.kind, "sent_awaiting");
  });

  it("draft-only, talent NOT yet on the draft's lineup -> add_to_lineup", () => {
    // rule 4 — the draft carries a lineup the chip-add flow will append to.
    const out = resolve({ ...draftBase, isInLineup: false, lineupCount: 2 });
    assert.deepEqual(out, { kind: "add_to_lineup", lineupCount: 2 });
    assert.notEqual(out.kind, "sent_awaiting");
  });

  it("draft-only on a talent-less surface (cart/agency launcher) -> review_lineup", () => {
    // rule 6 — no talent focus + non-empty lineup. "Your lineup (N)".
    const out = resolve({ ...draftBase, talentProfileId: null, lineupCount: 4 });
    assert.deepEqual(out, { kind: "review_lineup", lineupCount: 4 });
    assert.notEqual(out.kind, "sent_awaiting");
  });

  it("draft-only, empty lineup, talent focus -> add_to_lineup (rule 4 via hasActiveDraft), never sent_awaiting", () => {
    // A draft anchor always carries hasActiveDraft:true, so rule 4 wins even at
    // count 0 (launcher-cta-label then reads count 0 as "Message {agency}", NOT
    // "Inquiry sent"). The load-bearing invariant is only: never sent_awaiting.
    const out = resolve({ ...draftBase, isInLineup: false, lineupCount: 0 });
    assert.deepEqual(out, { kind: "add_to_lineup", lineupCount: 0 });
    assert.notEqual(out.kind, "sent_awaiting");
  });

  it("SENT session (coordination) still yields sent_awaiting", () => {
    // The sent path is untouched: a real submitted/coordination thread reads as
    // "Inquiry sent" exactly as before.
    const out = resolve({ activePhase: "coordination", activeStatus: "coordination" });
    assert.deepEqual(out, { kind: "sent_awaiting", phase: "coordination" });
  });

  it("draft+sent MIXED, anchored on the draft (cart surface) -> reflects the DRAFT lineup, never sent", () => {
    // The launcher excludes sibling DRAFTS from otherOpenInquiries; a genuinely
    // SENT sibling can still populate it, but on the talent-less cart surface
    // rule 2 (pick_inquiry) requires a talent focus and so does not fire. The
    // anchored draft's own working lineup wins -> review_lineup ("Your lineup").
    const out = resolve({
      ...draftBase,
      talentProfileId: null,
      lineupCount: 5,
      otherOpenInquiries: [{ id: "sent-1", phase: "coordination", label: "Editorial" }],
    });
    assert.deepEqual(out, { kind: "review_lineup", lineupCount: 5 });
    assert.notEqual(out.kind, "sent_awaiting");
  });

  it("draft phase is not terminal and not sent — control across the loaded forward context", () => {
    // With every forward signal set, a draft-phase anchor must resolve to a
    // forward/lineup kind, never terminal and never sent_awaiting.
    const out = resolve({
      ...draftBase,
      isInLineup: true,
      lineupCount: 9,
      lastActivityAt: new Date(NOW - STALE_DRAFT_MS - 1).toISOString(),
    });
    assert.equal(out.kind, "in_lineup");
    assert.notEqual(out.kind, "terminal");
    assert.notEqual(out.kind, "sent_awaiting");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveTerminalReason — explicit reason mapping.
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveTerminalReason", () => {
  it("rejected -> declined", () => assert.equal(deriveTerminalReason("rejected", "rejected"), "declined"));
  it("expired -> expired", () => assert.equal(deriveTerminalReason("expired", "expired"), "expired"));
  it("booked -> booked", () => assert.equal(deriveTerminalReason("booked", "booked"), "booked"));
  it("archived (plain) -> closed", () => assert.equal(deriveTerminalReason("archived", "archived"), "closed"));
  it("archived + raw 'cancelled' -> cancelled", () =>
    assert.equal(deriveTerminalReason("archived", "cancelled"), "cancelled"));
  it("archived + raw 'canceled' (US spelling) -> cancelled", () =>
    assert.equal(deriveTerminalReason("archived", "canceled"), "cancelled"));
  it("legacy 'closed' (->archived) reason derives to closed", () =>
    assert.equal(deriveTerminalReason(getWorkflowPhase("closed"), "closed"), "closed"));
  it("legacy 'closed_lost' (->rejected) reason derives to declined", () =>
    assert.equal(deriveTerminalReason(getWorkflowPhase("closed_lost"), "closed_lost"), "declined"));
  it("legacy 'converted' (->booked) reason derives to booked", () =>
    assert.equal(deriveTerminalReason(getWorkflowPhase("converted"), "converted"), "booked"));
});

// ─────────────────────────────────────────────────────────────────────────────
// Terminal detection by raw status (phase null, status carries terminal).
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveInquiryCta — terminal detection paths", () => {
  it("terminal recognized when only activeStatus is set (activePhase null)", () => {
    assert.deepEqual(resolve({ activePhase: null, activeStatus: "rejected" }), {
      kind: "terminal",
      reason: "declined",
    });
  });

  it("terminal recognized when only activePhase is set (activeStatus null)", () => {
    assert.deepEqual(resolve({ activePhase: "expired", activeStatus: null }), {
      kind: "terminal",
      reason: "expired",
    });
  });

  it("legacy terminal status 'converted' (->booked) yields terminal/booked", () => {
    assert.deepEqual(resolve({ activePhase: null, activeStatus: "converted" }), {
      kind: "terminal",
      reason: "booked",
    });
  });

  it("legacy terminal status 'closed_lost' (->rejected) yields terminal/declined", () => {
    assert.deepEqual(resolve({ activePhase: null, activeStatus: "closed_lost" }), {
      kind: "terminal",
      reason: "declined",
    });
  });

  it("legacy terminal status 'closed' (->archived) yields terminal/closed", () => {
    assert.deepEqual(resolve({ activePhase: null, activeStatus: "closed" }), {
      kind: "terminal",
      reason: "closed",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL regression guard — the dead-CTA class.
// For EVERY terminal status in the lifecycle enum (canonical + legacy),
// resolveInquiryCta returns kind "terminal" and NEVER a forward-motion kind,
// even when every forward signal is set.
// ─────────────────────────────────────────────────────────────────────────────

describe("DEAD-CTA GUARD — every terminal status resolves to terminal, never forward-motion", () => {
  const allStatuses = [...CANONICAL_STATUSES, ...LEGACY_STATUSES];
  const terminalStatuses = allStatuses.filter((s) => isTerminalPhase(s));
  const nonTerminalStatuses = allStatuses.filter((s) => !isTerminalPhase(s));

  // Sanity: the lifecycle enum really does contain terminal statuses (so this
  // suite isn't vacuously green).
  it("the lifecycle enum exposes a non-empty terminal set", () => {
    assert.ok(terminalStatuses.length >= 4, `expected >=4 terminal statuses, got ${terminalStatuses.length}`);
  });

  // A maximally-loaded forward context: every field that could push a
  // forward-motion CTA is set. Only the terminal status should override it.
  const loadedForward: Partial<InquiryCtaInput> = {
    talentProfileId: "talent-1",
    isInLineup: true,
    lineupCount: 9,
    lineupTalentIds: ["talent-1", "talent-2"],
    hasActiveDraft: true,
    draftInquiryId: "draft-1",
    otherOpenInquiries: [{ id: "i1", phase: "coordination" }],
    coordinatorId: "coord-1",
    lastMessageRole: "coordinator",
    lastActivityAt: new Date(NOW - STALE_DRAFT_MS - 1).toISOString(),
  };

  for (const status of terminalStatuses) {
    it(`terminal status "${status}" (phase ${getWorkflowPhase(status)}) -> kind "terminal", never forward-motion`, () => {
      // Pass it both as activeStatus alone and as phase+status; both must hold.
      const viaStatus = resolveInquiryCta(
        { ...base, ...loadedForward, activePhase: null, activeStatus: status },
        NOW,
      );
      const viaBoth = resolveInquiryCta(
        { ...base, ...loadedForward, activePhase: getWorkflowPhase(status), activeStatus: status },
        NOW,
      );
      for (const out of [viaStatus, viaBoth]) {
        assert.equal(out.kind, "terminal", `${status} must be terminal, got ${out.kind}`);
        assert.equal(
          FORWARD.has(out.kind),
          false,
          `${status} must NOT yield a forward-motion kind (${out.kind})`,
        );
      }
    });
  }

  it("control: non-terminal statuses with the same loaded context do NOT return terminal", () => {
    for (const status of nonTerminalStatuses) {
      const out = resolveInquiryCta(
        { ...base, ...loadedForward, activePhase: getWorkflowPhase(status), activeStatus: status },
        NOW,
      );
      assert.notEqual(out.kind, "terminal", `${status} should not be terminal`);
    }
  });
});
