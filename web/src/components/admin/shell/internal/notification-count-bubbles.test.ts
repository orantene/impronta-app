import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBubbleCount,
  visibleNotificationBubbles,
  NOTIFICATION_BUBBLE_DESIGN,
} from "./notification-count-bubbles";

test("formatBubbleCount hides zero and caps at 99+", () => {
  assert.equal(formatBubbleCount(0), "");
  assert.equal(formatBubbleCount(-1), "");
  assert.equal(formatBubbleCount(1), "1");
  assert.equal(formatBubbleCount(99), "99");
  assert.equal(formatBubbleCount(100), "99+");
});

test("visibleNotificationBubbles keeps order messages → money → attention and drops zeros", () => {
  assert.deepEqual(
    visibleNotificationBubbles([
      { kind: "attention", count: 2 },
      { kind: "messages", count: 0 },
      { kind: "money", count: 7 },
    ]),
    [
      { kind: "money", count: 7 },
      { kind: "attention", count: 2 },
    ],
  );
});

test("visibleNotificationBubbles caps at 3", () => {
  assert.equal(
    visibleNotificationBubbles([
      { kind: "messages", count: 1 },
      { kind: "money", count: 1 },
      { kind: "attention", count: 1 },
    ]).length,
    3,
  );
});

test("design tokens avoid gold/rust fills (TUL-385)", () => {
  const fills = Object.values(NOTIFICATION_BUBBLE_DESIGN.fills).join(" ").toLowerCase();
  assert.doesNotMatch(fills, /#c68a1e|#b8860b|gold|rust/);
  assert.equal(NOTIFICATION_BUBBLE_DESIGN.maxBubbles, 3);
  assert.equal(NOTIFICATION_BUBBLE_DESIGN.cap, 99);
});
