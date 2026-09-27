/**
 * AUD-009 — live Hablar presence line is wired to a real staff signal, not
 * the dev offer preview alone.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
const CHAT = "src/app/t/[profileCode]/_chat";

test("GuestConversationBody mounts GuestStaffViewingLine", () => {
  const body = readFileSync(join(ROOT, CHAT, "GuestConversationBody.tsx"), "utf8");
  assert.match(body, /GuestStaffViewingLine/);
  assert.match(body, /presenceName=\{brand\.talentDisplayName/);
});

test("GuestStaffViewingLine only paints when a staff/peer is present", () => {
  const src = readFileSync(join(ROOT, CHAT, "GuestStaffViewingLine.tsx"), "utf8");
  assert.match(src, /useThreadPresence/);
  assert.match(src, /inquiry:\$\{inquiryId\}:private/);
  assert.match(src, /role === "staff"/);
  assert.match(src, /presenceViewing/);
  assert.match(src, /if \(!staffViewing/);
});

test("Messages v5 publishes staff presence on the open inquiry", () => {
  const shell = readFileSync(
    join(ROOT, "src/components/messages-v5/shell/MessagesV5Shell.tsx"),
    "utf8",
  );
  const hook = readFileSync(
    join(ROOT, "src/components/messages-v5/shell/use-staff-inquiry-presence.ts"),
    "utf8",
  );
  assert.match(shell, /useStaffInquiryPresence/);
  assert.match(hook, /role: "staff"/);
  assert.match(hook, /inquiry:\$\{inquiryId\}:private/);
});
