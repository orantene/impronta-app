import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("Messages page does not read the inbox itself; the shell reports the total", () => {
  const src = read("components/admin/shell/internal/talent/pages/messages/MessagesPage.tsx");
  assert.doesNotMatch(src, /loadInbox|safeLoadInbox|fetchTalentInbox/);
  assert.match(src, /onInboxLoaded=\{setTotalConversations\}/);
});

test("/talent/inbox server-starts the first read and primes the client reader", () => {
  const src = read("app/(workspace)/talent/inbox/page.tsx");
  assert.match(src, /messagingTalentLoadInbox\(\{ locationSlug: "all", filter: "all" \}\)/);
  assert.match(src, /<TalentInboxPrimer initial=\{initial\} \/>/);
});

test("talent inbox reads get the GET budget, not the 4 s server-action stall budget", () => {
  assert.match(read("components/messages-v5/shell/talent-engine.ts"), /loadInboxBudgetMs: TALENT_INBOX_FETCH_BUDGET_MS/);
  assert.match(read("components/messages-v5/shell/MessagesV5Shell.tsx"), /engine\.loadInboxBudgetMs\)/);
  const today = read("components/admin/shell/internal/talent/pages/TodayPage.tsx");
  assert.match(today, /talentShellEngine\.loadInboxBudgetMs/);
  assert.match(today, /countAwaitingReply\(r\.rows\) : "unavailable"/);
});

test("Today never draws 'You are clear' from an unknown reply count", () => {
  const src = read("components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx");
  assert.match(src, /attention\.length === 0 && replyState === "none"/);
});
