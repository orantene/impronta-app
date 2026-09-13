import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The drawer used to stream the worker's Chrome window into an iframe, which
 * the owner described as remote-control VPN: slow, clumsy, and blocked outright
 * on the live HTTPS site (mixed content, plus Chrome 142's local-network
 * permission). The drawer reads the database now. These assertions exist so
 * nobody reintroduces the frame.
 */

const SRC = join(process.cwd(), "src");

function read(relative: string): string {
  return readFileSync(join(SRC, relative), "utf8");
}

test("the WhatsApp drawer mounts the native inbox filtered to WhatsApp", () => {
  const drawer = read("components/admin/channels/WhatsAppDrawer.tsx");
  assert.match(drawer, /<MessagesShell/);
  assert.match(drawer, /channelFilter="whatsapp"/);
  assert.match(drawer, /locationSlug="default"/);
});

test("the drawer embeds no frame and no loopback URL", () => {
  const drawer = read("components/admin/channels/WhatsAppDrawer.tsx");
  assert.doesNotMatch(drawer, /<iframe/);
  assert.doesNotMatch(drawer, /127\.0\.0\.1/);
});

test("the full WhatsApp Web session stays reachable as a window, not a frame", () => {
  const drawer = read("components/admin/channels/WhatsAppDrawer.tsx");
  assert.match(drawer, /window\.open\(/);
  assert.match(drawer, /connection\.webViewUrl/);
  assert.match(drawer, /dashboard\.channels\.drawer\.webOpen/);
});

test("the inbox opens on every WhatsApp thread, not just the unanswered ones", () => {
  const shell = read("components/admin/pos/messages/MessagesShell.tsx");
  assert.match(shell, /channelFilter === "whatsapp" \? "all" : "needs_reply"/);
});

test("inbound media is rendered from card_payload, never as a bare kind", () => {
  const handler = read("lib/channels/webhook-handler.ts");
  // 'media' is not in inquiry_messages_message_kind_check; writing it lost the
  // message to a check_violation.
  assert.doesNotMatch(handler, /message_kind: "media"/);
  assert.match(handler, /message_kind: "text"/);
  assert.match(handler, /card_payload: messageCardPayload/);
  // Backfilled history must keep the timestamp the phone recorded.
  assert.match(handler, /created_at: body\.sentAt/);

  const card = read("components/admin/pos/messages/cards/OperatorCard.tsx");
  assert.match(card, /hasStoredMedia/);
  assert.match(card, /<MessageMedia/);
});

test("the media URL action takes a message id, never a storage path", () => {
  const action = read("lib/server-actions/message-media.ts");
  assert.match(action, /getMessageMediaUrl\(messageId: string\)/);
  assert.match(action, /requireWorkspaceStaffAction/);
  assert.match(action, /tenantScopedQuery\(admin, "inquiry_messages", guard\.tenantId\)/);
  assert.doesNotMatch(action, /\(\s*path: string\s*\)/);
});
