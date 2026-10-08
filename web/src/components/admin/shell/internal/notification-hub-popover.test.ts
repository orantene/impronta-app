import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HUB_CATEGORY_LABEL,
  HUB_OWNER_LABEL,
  HUB_UI_CATEGORIES,
  POPOVER_LIST_LIMIT,
  hubUiCategoryForBucket,
  hubUiCategoryForKind,
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
  // Owner + category labels already live in dashboard-i18n ES_TEXT.
  for (const en of Object.values(HUB_CATEGORY_LABEL)) {
    assert.ok(typeof en === "string" && en.length > 0);
  }
  for (const en of Object.values(HUB_OWNER_LABEL)) {
    assert.ok(typeof en === "string" && en.length > 0);
  }
});
