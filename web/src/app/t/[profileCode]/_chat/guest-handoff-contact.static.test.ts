/**
 * Path B: booking-sheet Contact → Hablar must show carried name/phone/email
 * on empty Hablar (gate only mounts when contact is missing at send).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(process.cwd(), "src/app/t/[profileCode]/_chat");

test("GuestHandoffContactStrip exposes data-guest-handoff-contact", () => {
  const src = readFileSync(join(ROOT, "GuestHandoffContactStrip.tsx"), "utf8");
  assert.match(src, /data-guest-handoff-contact/);
});

test("MiniChatPanelColumn mounts GuestHandoffContactStrip on Hablar empty", () => {
  const src = readFileSync(join(ROOT, "MiniChatPanelColumn.tsx"), "utf8");
  assert.match(src, /GuestHandoffContactStrip/);
  assert.match(src, /handoffContactLabel/);
});

test("booking-sheet handoff still writes name/phone/email into panel state", () => {
  const src = readFileSync(join(ROOT, "booking-sheet-chat-handoff.ts"), "utf8");
  assert.match(src, /takePendingGuestContact/);
  assert.match(src, /out\.email/);
  assert.match(src, /out\.phone/);
});
