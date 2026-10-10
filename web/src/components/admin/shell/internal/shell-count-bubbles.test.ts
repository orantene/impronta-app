import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TalentInquiryRow } from "./data-bridge";
import {
  countTalentAwaitingInquiries,
  formatShellBubbleCount,
  isTalentAwaitingYouStage,
  isTalentInquiryAwaitingYou,
  shellAttentionTooltip,
  shellBubbleFillsAvoidGoldRust,
  SHELL_BUBBLE_FILL_CLASS,
  talentInquiryMsgStageFromStatus,
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
  it("counts every status the inbox maps to awaiting-you, including new", () => {
    // Stack check: submitted 1 + coordination 1 + new 3 = 5 "esperando tu respuesta".
    const rows: TalentInquiryRow[] = [
      bridgeInquiry({ id: "a", status: "submitted" }),
      bridgeInquiry({ id: "b", status: "coordination" }),
      bridgeInquiry({ id: "n1", status: "new" }),
      bridgeInquiry({ id: "n2", status: "new" }),
      bridgeInquiry({ id: "n3", status: "new" }),
      bridgeInquiry({ id: "c", status: "offer_pending", myApprovalStatus: "pending" }),
      bridgeInquiry({ id: "d", status: "approved" }),
      bridgeInquiry({ id: "e", status: "booked" }),
      bridgeInquiry({ id: "f", status: "rejected" }),
      bridgeInquiry({ id: "g", status: "expired" }),
    ];
    assert.equal(countTalentAwaitingInquiries(rows), 7);
    assert.equal(isTalentInquiryAwaitingYou({ status: "new" }), true);
  });

  it("uses the stage predicate only — no second status allowlist", () => {
    assert.equal(isTalentAwaitingYouStage(talentInquiryMsgStageFromStatus("new")), true);
    assert.equal(isTalentAwaitingYouStage(talentInquiryMsgStageFromStatus("submitted")), true);
    assert.equal(isTalentAwaitingYouStage(talentInquiryMsgStageFromStatus("booked")), false);
    const logic = readFileSync(join(DIR, "shell-count-bubbles-logic.ts"), "utf8");
    assert.doesNotMatch(logic, /TALENT_AWAITING_YOU_STATUSES/);
  });

  it("maps DB statuses the same way as the conversation adapter", () => {
    assert.equal(talentInquiryMsgStageFromStatus("new"), "inquiry");
    assert.equal(talentInquiryMsgStageFromStatus("submitted"), "inquiry");
    assert.equal(talentInquiryMsgStageFromStatus("coordination"), "inquiry");
    assert.equal(talentInquiryMsgStageFromStatus("offer_pending"), "hold");
    assert.equal(talentInquiryMsgStageFromStatus("approved"), "hold");
    assert.equal(talentInquiryMsgStageFromStatus("booked"), "booked");
    assert.equal(talentInquiryMsgStageFromStatus("converted"), "booked");
    assert.equal(talentInquiryMsgStageFromStatus("rejected"), "cancelled");
  });

  it("returns zero for an empty list", () => {
    assert.equal(countTalentAwaitingInquiries([]), 0);
  });
});

describe("shellAttentionTooltip (TUL-519)", () => {
  it("builds en and es first-time meanings", () => {
    const en = (s: string) => s;
    const es = (s: string) =>
      ({
        "1 conversation awaits your reply": "1 conversación espera tu respuesta",
        "{n} conversations await your reply": "{n} conversaciones esperan tu respuesta",
      }[s] ?? s);
    assert.equal(shellAttentionTooltip(1, en), "1 conversation awaits your reply");
    assert.equal(shellAttentionTooltip(2, en), "2 conversations await your reply");
    assert.equal(shellAttentionTooltip(2, es), "2 conversaciones esperan tu respuesta");
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
    assert.match(src, /shellAttentionTooltip/);
    assert.match(src, /title=\{title\}/);
    assert.match(src, /Attention/);
    // TUL-536: talent must not prefer shellCounts.attention over inbox awaiting.
    assert.match(src, /inWorkspace\s*\?\s*\(shellCounts\?\.attention/);
    assert.doesNotMatch(
      src,
      /shellCounts\?\.attention && shellCounts\.attention > 0\s*\?\s*shellCounts\.attention\s*:\s*awaiting/,
    );
  });

  it("Hoy Requiere atención uses the same awaiting count as the bubble", () => {
    const today = readFileSync(join(DIR, "talent/pages/TodayPage.tsx"), "utf8");
    assert.match(today, /countTalentAwaitingInquiries\(effectiveTalentInquiries\)/);
    assert.doesNotMatch(today, /countAwaitingReply/);
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

  it("Attention label + tooltip have ES catalog rows", () => {
    const gaps = readFileSync(join(DIR, "dashboard-i18n-talent-gaps.ts"), "utf8");
    assert.match(gaps, /"Attention": "Atención"/);
    assert.match(
      gaps,
      /"\{n\} conversations await your reply": "\{n\} conversaciones esperan tu respuesta"/,
    );
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
