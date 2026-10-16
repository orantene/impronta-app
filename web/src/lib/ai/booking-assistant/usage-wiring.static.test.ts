import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("usage panel (ported from #3746) is wired into platform admin and talent settings", () => {
  assert.match(read("app/(workspace)/platform/admin/ai-providers/page.tsx"), /<BookingAssistantUsageSection \/>/);
  const screen = read("components/talent/website-settings/WebsiteSettingsScreen.tsx");
  assert.match(screen, /loadBookingAssistantUsageAction\(\)/);
  assert.match(screen, /usageLine=\{aiUsage \?/);
  assert.match(read("components/talent/website-settings/WebsiteSettingsSwitchGroups.tsx"), /usageLine \? <p/);
});

test("the talent usage action is read-only and allow-listed for impersonation", () => {
  assert.match(read("lib/impersonation/readonly-actions.allow.ts"), /booking-assistant-usage-action\.ts", \["loadBookingAssistantUsageAction"\], READ/);
  assert.match(read("components/talent/website-settings/booking-assistant-usage-action.ts"), /requireTalentSelf\(\)/);
});

test("main's newer 'Let AI assistants book me' switch is kept", () => {
  assert.match(read("components/talent/website-settings/WebsiteSettingsSwitchGroups.tsx"), /agentBookingEnabled/);
});

test("TUL-320 (#3746): the prior-events query only reads assistant rows", async () => {
  const { BOOKING_ASSISTANT_EVENT_TYPES } = await import("./turns");
  assert.deepEqual([...BOOKING_ASSISTANT_EVENT_TYPES], ["booking_assistant_reply", "booking_assistant_handoff"]);
  assert.match(read("lib/ai/booking-assistant/turn.server.ts"), /\.in\("metadata->>system_event_type", \[\.\.\.BOOKING_ASSISTANT_EVENT_TYPES\]\)/);
});
