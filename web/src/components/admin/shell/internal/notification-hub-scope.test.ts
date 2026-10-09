import test from "node:test";
import assert from "node:assert/strict";

import type { UserNotification } from "./data-bridge";
import {
  countUnreadRealNotifications,
  filterNotificationsByUiCategory,
  hubClickTarget,
  scopeRealNotifications,
  staffQueuesVisible,
} from "./notification-hub-scope";
import { uiCategoryForKind } from "@/lib/notifications/categories-ui";

function row(over: Partial<UserNotification>): UserNotification {
  return {
    id: "n1",
    kind: "system",
    surface: "talent",
    title: "t",
    body: null,
    actorInitials: null,
    targetDrawer: null,
    targetPayload: null,
    originInquiryId: null,
    read: false,
    ts: "now",
    createdAt: "2026-09-30T00:00:00Z",
    ...over,
  };
}

test("F71: staff queues (pending approvals, plan cap) are workspace-only", () => {
  assert.equal(staffQueuesVisible("workspace"), true);
  assert.equal(staffQueuesVisible("talent"), false);
  assert.equal(staffQueuesVisible("client"), false);
});

test("F71: talent surface drops non-talent rows", () => {
  const rows = [row({ id: "a" }), row({ id: "b", surface: "workspace", kind: "approval" })];
  assert.deepEqual(scopeRealNotifications(rows, "talent").map((r) => r.id), ["a"]);
  assert.equal(scopeRealNotifications(rows, "workspace").length, 2);
});

test("F72: the theme update bell opens /talent/site?themeUpdate=open", () => {
  const t = hubClickTarget(row({ targetDrawer: "theme-update" }), "/admin");
  assert.deepEqual(t, { kind: "href", href: "/talent/site?themeUpdate=open" });
});

test("F72: legacy theme_update payload without target_drawer still deep-links", () => {
  const t = hubClickTarget(row({ targetPayload: { kind: "theme_update" } }), "/admin");
  assert.deepEqual(t, { kind: "href", href: "/talent/site?themeUpdate=open" });
});

test("F72: other entry types deep-link; a row with no target stays inert", () => {
  assert.deepEqual(hubClickTarget(row({ targetDrawer: "money" }), "/admin"), { kind: "href", href: "/talent/payouts" });
  assert.deepEqual(hubClickTarget(row({ targetDrawer: "talent-reviews" }), "/admin"), { kind: "href", href: "/talent/reviews" });
  assert.equal(hubClickTarget(row({ targetDrawer: "representation" }), "/admin")?.kind, "drawer");
  assert.equal(hubClickTarget(row({}), "/admin"), null);
});

test("TUL-389: filterNotificationsByUiCategory uses the shared kind→category map", () => {
  const rows = [
    row({ id: "m", kind: "message" }),
    row({ id: "p", kind: "payment" }),
    row({ id: "a", kind: "approval" }),
    row({ id: "s", kind: "system" }),
  ];
  assert.deepEqual(filterNotificationsByUiCategory(rows, "messages").map((r) => r.id), ["m"]);
  assert.deepEqual(filterNotificationsByUiCategory(rows, "money").map((r) => r.id), ["p"]);
  assert.deepEqual(filterNotificationsByUiCategory(rows, "attention").map((r) => r.id), ["a"]);
  assert.deepEqual(filterNotificationsByUiCategory(rows, "updates").map((r) => r.id), ["s"]);
  assert.equal(uiCategoryForKind("ticket"), "attention");
});

test("TUL-389: unread count follows read_at (n.read) and optimistic mark-read ids", () => {
  const rows = [
    row({ id: "u1", kind: "message", read: false }),
    row({ id: "u2", kind: "payment", read: true }),
    row({ id: "u3", kind: "approval", read: false }),
  ];
  assert.equal(countUnreadRealNotifications(rows), 2);
  // Optimistic mark-read (hub session) clears the badge before reload.
  assert.equal(countUnreadRealNotifications(rows, new Set(["u1"])), 1);
  assert.equal(countUnreadRealNotifications(rows, new Set(["notif-u3"])), 1);
  assert.equal(countUnreadRealNotifications(rows, new Set(["u1", "notif-u3"])), 0);
});
