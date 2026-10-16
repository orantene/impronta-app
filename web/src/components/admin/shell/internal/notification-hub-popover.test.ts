import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HUB_CATEGORY_LABEL,
  HUB_OWNER_LABEL,
  HUB_UI_CATEGORIES,
  POPOVER_LIST_LIMIT,
  hubUiCategoryForBucket,
  hubSectionCount,
  hubUiCategoryForKind,
  matchesHubPayloadCategory,
  notificationCenterDrawerId,
  selectPopoverList,
  shouldShowSeeAllNotifications,
  type HubPopoverItem,
} from "./notification-hub-popover";

function item(
  id: string,
  category: HubPopoverItem["category"],
  owner: HubPopoverItem["owner"] = "admin",
): HubPopoverItem {
  return { id, category, owner };
}

test("TUL-390: threshold — 8 items stay in popover; 9 shows See all", () => {
  assert.equal(POPOVER_LIST_LIMIT, 8);
  assert.equal(shouldShowSeeAllNotifications(8), false);
  assert.equal(shouldShowSeeAllNotifications(9), true);
  assert.equal(shouldShowSeeAllNotifications(0), false);
});

test("TUL-390: selectPopoverList caps preview at 8 and flags See all at 9", () => {
  const nine = Array.from({ length: 9 }, (_, i) => item(`n${i}`, "messages"));
  const atNine = selectPopoverList(nine, { category: "all", owner: "all" });
  assert.equal(atNine.filteredCount, 9);
  assert.equal(atNine.visible.length, 8);
  assert.equal(atNine.showSeeAll, true);

  const eight = nine.slice(0, 8);
  const atEight = selectPopoverList(eight, { category: "all", owner: "all" });
  assert.equal(atEight.showSeeAll, false);
  assert.equal(atEight.visible.length, 8);
});

test("TUL-390: category + owner filters compose", () => {
  const rows = [
    item("m1", "messages", "admin"),
    item("m2", "messages", "talent"),
    item("p1", "money", "admin"),
    item("a1", "attention", "talent"),
  ];
  const filtered = selectPopoverList(rows, { category: "messages", owner: "talent" });
  assert.deepEqual(filtered.visible.map((r) => r.id), ["m2"]);
  assert.equal(filtered.showSeeAll, false);
});

test("TUL-390: kind→category mirrors TUL-389 display buckets", () => {
  assert.equal(hubUiCategoryForKind("message"), "messages");
  assert.equal(hubUiCategoryForKind("payment"), "money");
  assert.equal(hubUiCategoryForKind("approval"), "attention");
  assert.equal(hubUiCategoryForKind("offer"), "attention");
  assert.equal(hubUiCategoryForKind("system"), "updates");
  assert.equal(hubUiCategoryForKind("unknown"), "updates");
  assert.equal(hubUiCategoryForBucket("action"), "attention");
  assert.equal(hubUiCategoryForBucket("update"), "messages");
  assert.equal(hubUiCategoryForBucket("system"), "updates");
});

test("TUL-390: drawer id follows shell surface", () => {
  assert.equal(notificationCenterDrawerId("workspace"), "notifications");
  assert.equal(notificationCenterDrawerId("talent"), "talent-notifications");
  assert.equal(notificationCenterDrawerId("client"), "notifications");
});

test("TUL-390: drawer payload category matches hub kind map", () => {
  assert.equal(matchesHubPayloadCategory("message", null), true);
  assert.equal(matchesHubPayloadCategory("message", "messages"), true);
  assert.equal(matchesHubPayloadCategory("payment", "messages"), false);
  assert.equal(matchesHubPayloadCategory("approval", "attention"), true);
  assert.equal(matchesHubPayloadCategory("system", "updates"), true);
});

test("TUL-390: i18n label keys exist for every category + owner tab", () => {
  for (const cat of HUB_UI_CATEGORIES) {
    assert.ok(HUB_CATEGORY_LABEL[cat].length > 0);
  }
  assert.equal(HUB_OWNER_LABEL.admin, "Admin");
  assert.equal(HUB_OWNER_LABEL.talent, "Talent");
});

test("TUL-390: ES chrome keys for See all + Attention", async () => {
  const { NOTIFICATIONS_ES_TEXT } = await import("./dashboard-i18n-notifications");
  assert.equal(NOTIFICATIONS_ES_TEXT["See all notifications"], "Ver todas las notificaciones");
  assert.equal(NOTIFICATIONS_ES_TEXT["Attention"], "Atención");
  // Messages / Money / Updates / All / Admin / Talent already live in dashboard-i18n ES_TEXT.
  for (const en of Object.values(HUB_CATEGORY_LABEL)) {
    assert.ok(typeof en === "string" && en.length > 0);
  }
  for (const en of Object.values(HUB_OWNER_LABEL)) {
    assert.ok(typeof en === "string" && en.length > 0);
  }
});

test("TUL-391 r2: offers carry money, so the Money tab lists them (was empty 'All caught up')", () => {
  const rows: HubPopoverItem[] = [
    { id: "o1", category: "attention", owner: "talent", kind: "offer" },
    { id: "o2", category: "attention", owner: "talent", kind: "offer" },
    { id: "a1", category: "attention", owner: "talent", kind: "approval" },
  ];
  const money = selectPopoverList(rows, { category: "money", owner: "all" });
  assert.deepEqual(money.visible.map((r) => r.id), ["o1", "o2"]);
  // Offers stay in Attention too (they need a decision).
  assert.equal(selectPopoverList(rows, { category: "attention", owner: "all" }).filteredCount, 3);
  assert.equal(matchesHubPayloadCategory("offer", "money"), true);
  assert.equal(matchesHubPayloadCategory("approval", "money"), false);
});

test("TUL-391 r2: section header count equals the badge (unread), not the capped row count", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
  const rows = ids.map((id) => item(id, "messages"));
  // 12 rows, 1 read: badge says 11; header must not say 8 (the preview cap) or 12.
  assert.equal(hubSectionCount(rows, new Set(["n0"])), 11);
  // Nothing unread: fall back to the row count.
  assert.equal(hubSectionCount(rows.slice(0, 3), new Set(["n0", "n1", "n2"])), 3);
});
