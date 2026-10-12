import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

test("TUL-388: the inbox summary carries the inbox's own unread and Needs reply counts", () => {
  const src = read("src/lib/messaging/talent-inbox-rows.ts");
  assert.match(src, /unreadCount: inbox\.unreadCount/);
  assert.match(src, /needsReply: countAwaitingReply\(inbox\.rows\)/);
});

test("TUL-387/388: talent Messages and Attention counts come from the inbox read", () => {
  const src = read("src/app/(workspace)/talent/_talent-layout-inner.tsx");
  assert.match(src, /loadTalentInboxSummary\(readCtx\)\.catch\(\(\) => null\)/);
  assert.match(src, /talentInboxSummary\?\.unreadCount \?\? sumTalentInquiryUnread\(talentInquiries\)/);
  assert.match(src, /talentInboxSummary\?\.needsReply \?\? countTalentAwaitingInquiries\(talentInquiries\)/);
  assert.match(src, /scopeTalentNotificationsToInbox\(userNotificationsAll, talentInboxSummary\?\.ids \?\? null\)/);
});

test("TUL-388: the talent Attention bubble and Hoy use the layout count, even at 0", () => {
  const bubble = read("src/components/admin/shell/internal/shell-count-bubbles.tsx");
  assert.match(bubble, /: \(shellCounts\?\.attention \?\? awaiting\) \+ signals\);/);
  const today = read("src/components/admin/shell/internal/talent/pages/TodayPage.tsx");
  assert.match(today, /shellCounts\?\.attention \?\? countTalentAwaitingInquiries\(effectiveTalentInquiries\)/);
});
