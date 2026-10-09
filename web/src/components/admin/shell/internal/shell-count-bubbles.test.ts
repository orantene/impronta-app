import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TalentInquiryRow } from "./data-bridge";
import {
  countTalentAwaitingInquiries,
  formatShellBubbleCount,
  isTalentInquiryAwaitingYou,
  shellBubbleFillsAvoidGoldRust,
  SHELL_BUBBLE_FILL_CLASS,
  talentInquiryMsgStageFromStatus,
  TALENT_AWAITING_YOU_STATUSES,
  visibleShellCountBubbles,
} from "./shell-count-bubbles-logic";

const DIR = dirname(fileURLToPath(import.meta.url));

/** Bridge-shaped fixture — fields mirror `TalentInquiryRow` from the data bridge. */
function bridgeInquiry(
  overrides: Partial<TalentInquiryRow> & Pick<TalentInquiryRow, "status" | "id">,
): TalentInquiryRow {
  return {
    contact_name: "QA Client",
    company: null,
    message: null,
    event_date: null,
    event_location: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-08T12:00:00.000Z",
    participantStatus: "invited",
    unreadCount: 0,
    trustLevel: null,
    sourceChannel: null,
    myApprovalStatus: null,
    iAmCoordinator: false,
    clientIdentity: null,
    ...overrides,
  };
}

describe("formatShellBubbleCount", () => {
  it("hides zero and negatives", () => {
    assert.equal(formatShellBubbleCount(0), "");
    assert.equal(formatShellBubbleCount(-3), "");
  });

  it("caps above 99", () => {
    assert.equal(formatShellBubbleCount(99), "99");
    assert.equal(formatShellBubbleCount(100), "99+");
    assert.equal(formatShellBubbleCount(1000), "99+");
  });

  it("passes through small positives", () => {
    assert.equal(formatShellBubbleCount(1), "1");
    assert.equal(formatShellBubbleCount(12), "12");
  });
});

describe("visibleShellCountBubbles", () => {
  it("hides zeros and keeps stable order", () => {
    const visible = visibleShellCountBubbles([
      { kind: "attention", count: 2 },
      { kind: "messages", count: 0 },
      { kind: "money", count: 4 },
    ]);
    assert.deepEqual(
      visible.map((v) => v.kind),
      ["money", "attention"],
    );
  });

  it("caps at three even if more kinds appear", () => {
    const visible = visibleShellCountBubbles([
      { kind: "messages", count: 1 },
      { kind: "money", count: 1 },
      { kind: "attention", count: 1 },
    ]);
    assert.equal(visible.length, 3);
  });

  it("returns empty when all zero", () => {
    assert.deepEqual(
      visibleShellCountBubbles([
        { kind: "messages", count: 0 },
        { kind: "money", count: 0 },
        { kind: "attention", count: 0 },
      ]),
      [],
    );
  });
});

describe("shell bubble fills", () => {
  it("uses coral / forest / slate tokens — no gold or rust", () => {
    assert.equal(shellBubbleFillsAvoidGoldRust(), true);
    assert.match(SHELL_BUBBLE_FILL_CLASS.messages, /bg-admin-coral/);
    assert.match(SHELL_BUBBLE_FILL_CLASS.money, /bg-admin-green/);
    assert.match(SHELL_BUBBLE_FILL_CLASS.attention, /bg-admin-amber/);
  });
});

describe("countTalentAwaitingInquiries (TUL-519 card 385)", () => {
  it("counts real inquiry_status values that map to awaiting-you", () => {
    const rows: TalentInquiryRow[] = [
      bridgeInquiry({ id: "a", status: "submitted" }),
      bridgeInquiry({ id: "b", status: "coordination" }),
      bridgeInquiry({ id: "c", status: "offer_pending", myApprovalStatus: "pending" }),
      bridgeInquiry({ id: "d", status: "approved" }),
      bridgeInquiry({ id: "e", status: "booked" }),
      bridgeInquiry({ id: "f", status: "rejected" }),
      bridgeInquiry({ id: "g", status: "expired" }),
    ];
    assert.equal(countTalentAwaitingInquiries(rows), 4);
  });

  it("does not treat MsgStage name inquiry as a DB status", () => {
    assert.equal(
      countTalentAwaitingInquiries([
        bridgeInquiry({ id: "fake", status: "inquiry" }),
      ]),
      0,
    );
    assert.equal(isTalentInquiryAwaitingYou({ status: "inquiry" }), false);
  });

  it("maps DB statuses the same way as the conversation adapter", () => {
    assert.equal(talentInquiryMsgStageFromStatus("submitted"), "inquiry");
    assert.equal(talentInquiryMsgStageFromStatus("coordination"), "inquiry");
    assert.equal(talentInquiryMsgStageFromStatus("offer_pending"), "hold");
    assert.equal(talentInquiryMsgStageFromStatus("approved"), "hold");
    assert.equal(talentInquiryMsgStageFromStatus("booked"), "booked");
    assert.equal(talentInquiryMsgStageFromStatus("converted"), "booked");
    assert.equal(talentInquiryMsgStageFromStatus("rejected"), "cancelled");
  });

  it("awaiting-you set is exactly the active pipeline statuses", () => {
    assert.deepEqual(
      [...TALENT_AWAITING_YOU_STATUSES].sort(),
      ["approved", "coordination", "offer_pending", "submitted"],
    );
  });

  it("returns zero for an empty list", () => {
    assert.equal(countTalentAwaitingInquiries([]), 0);
  });
});

describe("ShellCountBubbles mount (static)", () => {
  it("IdentityBar and MobileTopBar import ShellCountBubbles", () => {
    const identity = readFileSync(join(DIR, "page-modules/IdentityBar-1.tsx"), "utf8");
    const mobile = readFileSync(join(DIR, "page-modules/MobileTopBar.tsx"), "utf8");
    assert.match(identity, /ShellCountBubbles/);
    assert.match(mobile, /ShellCountBubbles/);
    // Talent surface mounts the mobile top bar so bubbles stay reachable.
    assert.match(identity, /MobileTopBar/);
    assert.match(identity, /data-tulala-identity-mobile/);
  });

  it("talent shell falls back to awaiting-inquiry attention counts", () => {
    const src = readFileSync(join(DIR, "shell-count-bubbles.tsx"), "utf8");
    assert.match(src, /countTalentAwaitingInquiries/);
    assert.match(src, /effectiveTalentInquiries/);
  });

  it("adapter + TalentJobShell share the awaiting predicate", () => {
    const adapter = readFileSync(
      join(DIR, "talent/shared/conversation-adapter-1.tsx"),
      "utf8",
    );
    const jobShell = readFileSync(join(DIR, "messages/TalentJobShell.tsx"), "utf8");
    assert.match(adapter, /talentInquiryMsgStageFromStatus/);
    assert.match(jobShell, /isTalentAwaitingYouStage/);
  });

  it("dead TopBarNotificationBell file is gone", () => {
    const path = join(DIR, "../../../admin-shell-notification-bell.tsx");
    let missing = false;
    try {
      readFileSync(path);
    } catch {
      missing = true;
    }
    assert.equal(missing, true);
  });
});
