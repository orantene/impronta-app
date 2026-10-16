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
    assert.match(adapter, /isTalentAwaitingYouStage\(stage\)/);
    assert.match(jobShell, /isTalentAwaitingYouStage/);
    // Closed / booked rows must not look like "awaiting you" in the inbox list.
    assert.match(adapter, /: INBOX_PREVIEW_CLOSED/);
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

// ── TUL-1109: the shell's small text must pass WCAG AA (4.5:1) ──────────────

const bridgeCss = readFileSync(join(DIR, "../../../../styles/admin-color-bridge.css"), "utf8");

function token(name: string): number[] {
  const m = bridgeCss.match(new RegExp(`${name}:\\s*#([0-9a-fA-F]{6})`));
  assert.ok(m, `${name} is a hex token in admin-color-bridge.css`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

function luminance(rgb: readonly number[]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

const contrast = (a: readonly number[], b: readonly number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("TUL-1109 contrast", () => {
  it("every bubble fill carries white text at 4.5:1 or better", () => {
    const fills: Record<string, string> = {
      messages: "--color-admin-coral-deep",
      money: "--color-admin-green",
      attention: "--color-admin-amber",
    };
    for (const [kind, tok] of Object.entries(fills)) {
      const cls = SHELL_BUBBLE_FILL_CLASS[kind as keyof typeof SHELL_BUBBLE_FILL_CLASS];
      assert.ok(cls.includes(`bg-${tok.slice(2).replace("color-", "")}`), `${kind} fill is ${tok}`);
      const ratio = contrast([255, 255, 255], token(tok));
      assert.ok(ratio >= 4.5, `${kind}: white on ${tok} is ${ratio.toFixed(2)}:1`);
    }
  });

  it("the raw coral would fail (3.86:1), so the messages bubble must not use it", () => {
    assert.ok(contrast([255, 255, 255], token("--color-admin-coral")) < 4.5);
    assert.doesNotMatch(SHELL_BUBBLE_FILL_CLASS.messages, /bg-admin-coral(?!-)/);
  });

  it("the brand tagline in the identity bar is ink at an opacity that passes 4.5:1 on the surface", () => {
    const src = readFileSync(join(DIR, "page-modules/IdentityBar-1.tsx"), "utf8");
    const m = src.match(/className="text-admin-ink pr-\[4px\]"\s*descriptorOpacity=\{([0-9.]+)\}/);
    assert.ok(m, "the identity bar passes descriptorOpacity to the lockup");
    const alpha = Number(m[1]);
    const surface = token("--color-admin-surface");
    const ink = token("--color-admin-ink");
    const flat = ink.map((v, i) => v * alpha + surface[i] * (1 - alpha));
    const ratio = contrast(flat, surface);
    assert.ok(ratio >= 4.5, `tagline at opacity ${alpha} is ${ratio.toFixed(2)}:1 on the surface`);
  });

  it("the helper reproduces QA's numbers for the old values (coral 3.85, tagline at 0.5 = #838382 at ~3.6)", () => {
    const surface = token("--color-admin-surface");
    const ink = token("--color-admin-ink");
    const old = ink.map((v, i) => v * 0.5 + surface[i] * 0.5);
    assert.deepEqual(old.map(Math.round), [131, 131, 130]);
    assert.ok(contrast(old, surface) < 4.5);
  });
});

describe("TUL-1109 /talent/today node groups (09's axe list)", () => {
  const read = (rel: string) => readFileSync(join(DIR, rel), "utf8");
  const fixtures = read("state/fixtures.ts");
  const hexOf = (key: string): number[] => {
    const m = fixtures.match(new RegExp(`\\b${key}:\\s*"#([0-9A-Fa-f]{6})"`));
    assert.ok(m, `COLORS.${key} is a hex in fixtures.ts`);
    return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  };
  const over = (fg: readonly number[], alpha: number, bg: readonly number[]) =>
    fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
  const WHITE = [255, 255, 255];
  const SURFACE_ALT = hexOf("surfaceAlt");
  const INK = hexOf("ink");
  const INK_MUTED_ALPHA = 0.72;

  it("stage pills: coral/green text sits on its 10% tint at 4.5:1 or better (30 + 4 nodes)", () => {
    const src = read("talent/shared/client-threads-1.tsx");
    assert.match(src, /inquiry: \{ label: "Inquiry", tone: COLORS\.coralDeep,/);
    assert.match(src, /cancelled: \{ label: "Cancelled", tone: COLORS\.coralDeep,/);
    assert.match(src, /booked: \{ label: "Booked", tone: COLORS\.successDeep,/);
    const coralTint = over(token("--color-admin-coral"), 0.1, WHITE);
    const greenTint = over(token("--color-admin-green"), 0.1, WHITE);
    assert.ok(contrast(hexOf("coralDeep"), coralTint) >= 4.5, "coralDeep on the coral tint");
    assert.ok(contrast(hexOf("successDeep"), greenTint) >= 4.5, "successDeep on the green tint");
    assert.ok(contrast(token("--color-admin-coral"), coralTint) < 4.5, "the old raw coral failed (3.43)");
  });

  it("week strip 'Gratis'/'Hoy' 9px labels: the extra opacity no longer drops them below 4.5:1 (7 nodes)", () => {
    const src = read("talent/shared/week-rhythm-1.tsx");
    const m = src.match(/fontSize: 9, color: theme\.label, fontFamily: FONTS\.body,\s*opacity: ([0-9.]+),/);
    assert.ok(m, "the Free/Today label keeps an explicit opacity");
    const opacity = Number(m[1]);
    const flat = over(INK, INK_MUTED_ALPHA * opacity, SURFACE_ALT);
    assert.ok(contrast(flat, SURFACE_ALT) >= 4.5, `Gratis at opacity ${opacity} is ${contrast(flat, SURFACE_ALT).toFixed(2)}:1`);
  });

  it("stat-tile captions use the muted ink (empty hints) and the deep coral, never the dim ink", () => {
    const src = read("talent/shared/calendar-2.tsx");
    assert.match(src, /\? COLORS\.coralDeep\n\s+: captionTone === "indigo"\n\s+\? COLORS\.indigo\n\s+: COLORS\.inkMuted;/);
    assert.ok(contrast(over(INK, INK_MUTED_ALPHA, WHITE), WHITE) >= 4.5);
  });

  it("talent muted token passes on the grey segmented strip (was #66717D at 4.43:1)", () => {
    const tokens = read("talent/visual/tokens.ts");
    const m = tokens.match(/muted: "#([0-9A-Fa-f]{6})"/);
    assert.ok(m, "TALENT_VISUAL.muted is a hex");
    const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    assert.ok(contrast(rgb, SURFACE_ALT) >= 4.5, `muted ${m[1]} on the strip is ${contrast(rgb, SURFACE_ALT).toFixed(2)}:1`);
    assert.notEqual(m[1].toUpperCase(), "66717D");
  });

  it("small eyebrows and the sidebar group labels use the muted ink class, not the 0.38-alpha dim one", () => {
    assert.match(read("talent/shared/earnings-tile-1.tsx"), /className="text-admin-ink-muted">\s*\{copy\.t\("Earnings"\)\}/);
    assert.match(read("../../../talent/website-reward/WebsiteRewardControl.tsx"), /truncate text-\[11px\] leading-tight text-admin-ink-muted/);
    const talent = read("../internal/talent.tsx");
    assert.match(talent, /tracking-\[0\.14em\] text-admin-ink-muted/);
    assert.doesNotMatch(talent, /pt-\[10px\] text-\[10px\] font-bold uppercase tracking-\[0\.14em\] text-admin-ink-dim/);
  });

  it("KindChip, the chip that actually renders the Today rows (30 coral + 4 green nodes, 09's live re-run), uses the deep tones", () => {
    const src = read("talent/shared/today-1.tsx");
    assert.match(src, /success: \{ bg: COLORS\.successSoft, fg: COLORS\.successDeep \},/);
    assert.match(src, /coral: \{ bg: COLORS\.coralSoft, fg: COLORS\.coralDeep \},/);
    assert.doesNotMatch(src, /fg: COLORS\.green \}/, "the raw green text on its tint was 4.39:1");
    assert.doesNotMatch(src, /fg: COLORS\.coral \}/, "the raw coral text on its tint was 3.43:1");
    const coralTint = over(token("--color-admin-coral"), 0.1, WHITE);
    const greenTint = over(token("--color-admin-green"), 0.1, WHITE);
    assert.ok(contrast(hexOf("coralDeep"), coralTint) >= 4.5);
    assert.ok(contrast(hexOf("successDeep"), greenTint) >= 4.5);
  });

  it("HeroStat, the tile that renders the Today captions ('aún nada', 'Aún sin pagos este mes', 'toca para terminar'), uses muted ink and deep coral", () => {
    const src = read("talent/shared/today-3.tsx");
    assert.match(src, /: captionTone === "coral"\n\s+\? COLORS\.coralDeep\n\s+: COLORS\.inkMuted;/);
    assert.ok(contrast(over(INK, INK_MUTED_ALPHA, WHITE), WHITE) >= 4.5);
  });

  it("the Today row age stamps ('hace 5 h') no longer use the 0.38-alpha ink or the raw coral, in both row components", () => {
    const src = read("talent/shared/today-3.tsx");
    assert.match(src, /const ageColor = ageHrs >= 12 \? COLORS\.coralDeep : COLORS\.inkMuted;/);
    assert.match(src, /const ageColor = request\.ageHrs >= 12 \? COLORS\.coralDeep : COLORS\.inkMuted;/);
    assert.doesNotMatch(src, /ageColor = [^;]*COLORS\.inkDim/);
    assert.doesNotMatch(src, /ageColor = [^;]*\? COLORS\.coral :/);
  });
});
