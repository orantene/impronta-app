import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formatShellBubbleCount,
  shellBubbleFillsAvoidGoldRust,
  SHELL_BUBBLE_FILL_CLASS,
  visibleShellCountBubbles,
} from "./shell-count-bubbles-logic";

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

describe("ShellCountBubbles mount (static)", () => {
  it("IdentityBar and MobileTopBar import ShellCountBubbles", () => {
    const root = join(import.meta.dirname);
    const identity = readFileSync(join(root, "page-modules/IdentityBar-1.tsx"), "utf8");
    const mobile = readFileSync(join(root, "page-modules/MobileTopBar.tsx"), "utf8");
    assert.match(identity, /ShellCountBubbles/);
    assert.match(mobile, /ShellCountBubbles/);
  });

  it("dead TopBarNotificationBell file is gone", () => {
    const path = join(
      import.meta.dirname,
      "../../../admin-shell-notification-bell.tsx",
    );
    let missing = false;
    try {
      readFileSync(path);
    } catch {
      missing = true;
    }
    assert.equal(missing, true);
  });
});
