import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const WEB = process.cwd();

test("workspace-ui loader never reads the experimental messaging flag", () => {
  const src = readFileSync(join(WEB, "src/lib/platform/workspace-ui.ts"), "utf8");
  assert.equal(
    src.includes("workspace_messaging_channels_enabled"),
    false,
    "A missing column on the main workspace-ui select would hide FAB/POS. Keep the flag in lib/channels/flag.ts only.",
  );
});

test("WhatsApp send miss is isolated from the stored Messages reply", () => {
  const src = readFileSync(join(WEB, "src/lib/server-actions/messaging-engine.ts"), "utf8");
  // Messages v5: EVERY channel miss on a stored reply is a delivery state on
  // the bubble, never a refusal; WhatsApp is one case of that rule.
  const reply = src.slice(src.indexOf("export async function messagingReply("), src.indexOf("export async function messagingInternalNote("));
  assert.match(reply, /delivery: "failed" as const/, "A channel miss must not fail a stored Messages reply.");
  assert.ok(!/return \{ ok: false as const, reason: sent\.reason \}/.test(reply), "no refusal after the reply row is stored");
});
