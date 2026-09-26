/**
 * Revert-proof: slot-taken must surface engine nextFreeTimes in the times card
 * and the client pick-time action must ask the scheduler for them.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(process.cwd(), "src");

test("ClientTimesCard renders data-next-free from nextFreeTimes (never invents)", () => {
  const src = readFileSync(join(ROOT, "components/messages-v5/client/ClientCards.tsx"), "utf8");
  assert.match(src, /data-next-free=\{startsAt\}/);
  assert.match(src, /nextFreeTimes/);
  assert.match(src, /data-slot-taken="1"/);
});

test("messagingClientPickTime returns nextFreeTimes on slot_taken", () => {
  const src = readFileSync(join(ROOT, "lib/server-actions/messaging-client.ts"), "utf8");
  assert.match(src, /nextFreeTimesForTalent/);
  assert.match(src, /fail\("unavailable", \{ nextFreeTimes \}\)/);
});

test("guest dock applyFailure reads slot_taken nextFreeTimes", () => {
  const src = readFileSync(
    join(ROOT, "app/t/[profileCode]/_chat/mini-chat-panel-apply-failure.ts"),
    "utf8",
  );
  assert.match(src, /code === "slot_taken"/);
  assert.match(src, /nextFreeTimes/);
});

test("ClientThread /c/t link passes nextFreeTimes into refused activity (not only the guest dock)", () => {
  const src = readFileSync(join(ROOT, "components/messages-v5/client/ClientThread.tsx"), "utf8");
  assert.match(src, /refused\(messageId, result\.reason, result\.nextFreeTimes\)/);
  assert.match(src, /nextFreeTimes && nextFreeTimes\.length > 0/);
});
