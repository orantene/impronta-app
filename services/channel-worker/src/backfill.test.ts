import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BACKFILL_CHAT_LIMIT,
  BACKFILL_MEDIA_PER_CHAT,
  selectBackfillChats,
  shouldDownloadMedia,
} from "./backfill.js";
import { decodedByteLength, extensionForMime, mediaObjectPath } from "./media.js";
import {
  contactDisplayName,
  isRelayableChatId,
  messageWebhookBody,
  resolvePushName,
  sentAtIso,
} from "./relay.js";

function chat(id: string, timestamp: number, isGroup = false) {
  return { id: { _serialized: id }, isGroup, timestamp };
}

test("selectBackfillChats keeps 1:1 chats, newest first", () => {
  const picked = selectBackfillChats([
    chat("111@c.us", 10),
    chat("group@g.us", 99, true),
    chat("222@c.us", 30),
    chat("status@broadcast", 98),
    chat("333@c.us", 20),
  ]);
  assert.deepEqual(
    picked.map((row) => row.id._serialized),
    ["222@c.us", "333@c.us", "111@c.us"],
  );
});

test("selectBackfillChats caps the walk", () => {
  const many = Array.from({ length: 60 }, (_, i) => chat(`${i}@c.us`, i));
  assert.equal(selectBackfillChats(many).length, BACKFILL_CHAT_LIMIT);
  assert.equal(selectBackfillChats(many, 3).length, 3);
});

test("shouldDownloadMedia only covers the newest tail of a chat", () => {
  const total = 50;
  // fetchMessages returns earliest-to-latest, so the newest is the last index.
  assert.equal(shouldDownloadMedia(total - 1, total), true);
  assert.equal(shouldDownloadMedia(total - BACKFILL_MEDIA_PER_CHAT, total), true);
  assert.equal(shouldDownloadMedia(total - BACKFILL_MEDIA_PER_CHAT - 1, total), false);
  assert.equal(shouldDownloadMedia(0, total), false);
  // A short chat is entirely within the window.
  assert.equal(shouldDownloadMedia(0, 5), true);
});

test("isRelayableChatId refuses groups and broadcasts", () => {
  assert.equal(isRelayableChatId("5219991234567@c.us"), true);
  assert.equal(isRelayableChatId("123456789@g.us"), false);
  assert.equal(isRelayableChatId("status@broadcast"), false);
});

test("extensionForMime names the object without trusting the mime blindly", () => {
  assert.equal(extensionForMime("image/jpeg"), "jpg");
  assert.equal(extensionForMime("image/jpeg; codecs=foo"), "jpg");
  assert.equal(extensionForMime("application/pdf"), "pdf");
  assert.equal(extensionForMime("application/vnd.weird"), "vndweird");
  assert.equal(extensionForMime("nonsense"), "bin");
  assert.equal(extensionForMime("image/../../etc"), "bin");
});

test("decodedByteLength measures base64 without allocating", () => {
  assert.equal(decodedByteLength(""), 0);
  assert.equal(decodedByteLength(Buffer.from("abc").toString("base64")), 3);
  assert.equal(decodedByteLength(Buffer.from("ab").toString("base64")), 2);
  assert.equal(decodedByteLength(Buffer.alloc(3000).toString("base64")), 3000);
});

test("mediaObjectPath keeps the tenant as the first segment and is stable", () => {
  const a = mediaObjectPath("tenant-1", "true_123@c.us_ABC", "image/jpeg");
  const b = mediaObjectPath("tenant-1", "true_123@c.us_ABC", "image/jpeg");
  assert.equal(a, b);
  assert.equal(a.startsWith("tenant-1/whatsapp/"), true);
  assert.equal(a.endsWith(".jpg"), true);
  assert.notEqual(a, mediaObjectPath("tenant-1", "true_123@c.us_XYZ", "image/jpeg"));
});

test("sentAtIso trusts unix seconds and falls back to now", () => {
  assert.equal(sentAtIso(1700000000), "2023-11-14T22:13:20.000Z");
  assert.equal(Number.isNaN(Date.parse(sentAtIso(0))), false);
  assert.equal(Number.isNaN(Date.parse(sentAtIso(undefined))), false);
});

test("messageWebhookBody carries direction, timestamp and media", () => {
  const body = messageWebhookBody({
    tenantId: "t1",
    chatId: "5219991234567@c.us",
    pushName: "Ana",
    message: {
      id: { _serialized: "true_5219991234567@c.us_AAA" },
      from: "5219991234567@c.us",
      body: "hola",
      fromMe: false,
      hasMedia: true,
      timestamp: 1700000000,
    },
    media: { url: "t1/whatsapp/abc.jpg", mime: "image/jpeg" },
  });
  assert.equal(body.kind, "message");
  assert.equal(body.chatId, "5219991234567@c.us");
  assert.equal(body.from, "5219991234567@c.us");
  assert.equal(body.pushName, "Ana");
  assert.equal(body.text, "hola");
  assert.equal(body.fromMe, false);
  assert.equal(body.sentAt, "2023-11-14T22:13:20.000Z");
  assert.deepEqual(body.media, { url: "t1/whatsapp/abc.jpg", mime: "image/jpeg" });
});

test("messageWebhookBody leaves an unnamed sender to the caller", () => {
  const body = messageWebhookBody({
    tenantId: "t1",
    chatId: "5219991234567@c.us",
    message: {
      id: { _serialized: "x" },
      from: "5219991234567@c.us",
      body: "",
      fromMe: true,
      hasMedia: false,
      timestamp: 1700000000,
    },
  });
  assert.equal(body.pushName, null);
  assert.equal(body.fromMe, true);
  assert.equal(body.media, null);
});

// whatsapp-web.js 1.34.7 has no name field on Message: `notifyName` exists
// nowhere in the library. Every candidate below is a real Contact property.
test("contactDisplayName prefers the saved contact name, then the pushname", () => {
  assert.equal(contactDisplayName({ name: "Ana Lopez", pushname: "Ani" }), "Ana Lopez");
  assert.equal(contactDisplayName({ pushname: "Ani" }), "Ani");
  assert.equal(contactDisplayName({ verifiedName: "Hotel Sol" }), "Hotel Sol");
  assert.equal(contactDisplayName({ shortName: "Ana" }), "Ana");
  assert.equal(contactDisplayName({ name: "   ", pushname: "Ani" }), "Ani");
  assert.equal(contactDisplayName({}), null);
  assert.equal(contactDisplayName(null), null);
});

const inbound = {
  id: { _serialized: "false_5219991234567@c.us_AAA" },
  from: "5219991234567@c.us",
  body: "hola",
  fromMe: false,
  hasMedia: false,
  timestamp: 1700000000,
};

test("resolvePushName asks the contact only when the caller has no name", async () => {
  let calls = 0;
  const getContact = async () => {
    calls += 1;
    return { pushname: "Ana" };
  };

  assert.equal(await resolvePushName({ ...inbound, getContact }, "Ana Lopez"), "Ana Lopez");
  assert.equal(calls, 0, "the backfill's chat name must not cost a round trip");

  assert.equal(await resolvePushName({ ...inbound, getContact }, null), "Ana");
  assert.equal(calls, 1);

  // Our own reply names nobody: the app only opens an inquiry for inbound.
  assert.equal(await resolvePushName({ ...inbound, fromMe: true, getContact }, null), null);
  assert.equal(calls, 1);
});

test("resolvePushName survives a contact lookup that throws", async () => {
  const getContact = async () => {
    throw new Error("puppeteer detached");
  };
  assert.equal(await resolvePushName({ ...inbound, getContact }, null), null);
  assert.equal(await resolvePushName(inbound, null), null);
});
