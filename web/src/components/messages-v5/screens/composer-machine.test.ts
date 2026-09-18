import assert from "node:assert/strict";
import { test } from "node:test";

import { channelAvailability, composerReducer, fallbackFor, initialComposerState, isResolvedRefusal, isVersionConflict, kitStateFor, type ComposerEvent, type ComposerWireState } from "./composer-machine";

function run(state: ComposerWireState, events: ComposerEvent[]): ComposerWireState {
  return events.reduce(composerReducer, state);
}
const start = () => initialComposerState({ channel: "web_chat", resolved: false });

test("idle → typing → sending → idle with an ok line; the draft clears on sent", () => {
  let s = start();
  assert.equal(kitStateFor(s), "idle");
  s = composerReducer(s, { type: "change", value: "See you Saturday" });
  assert.equal(kitStateFor(s), "typing");
  s = composerReducer(s, { type: "send" });
  assert.equal(kitStateFor(s), "sending");
  s = composerReducer(s, { type: "sent", ok: "Sent" });
  assert.equal(kitStateFor(s), "idle");
  assert.equal(s.value, "");
  assert.equal(s.ok, "Sent");
});

test("send is ignored with no text, offline, resolved or already sending", () => {
  const s = start();
  assert.equal(composerReducer(s, { type: "send" }), s);
  const offline = run(s, [{ type: "change", value: "x" }, { type: "online", online: false }]);
  assert.equal(kitStateFor(offline), "offline");
  assert.equal(composerReducer(offline, { type: "send" }), offline);
  const resolved = run(s, [{ type: "change", value: "x" }, { type: "resolved", resolved: true }]);
  assert.equal(kitStateFor(resolved), "resolved");
  assert.equal(composerReducer(resolved, { type: "send" }), resolved);
  const sending = run(s, [{ type: "change", value: "x" }, { type: "send" }]);
  assert.equal(composerReducer(sending, { type: "send" }), sending);
});

test("failed keeps the text and offers retry; retry goes back to sending; coming back online clears failed", () => {
  let s = run(start(), [{ type: "change", value: "Yes" }, { type: "send" }, { type: "failed" }]);
  assert.equal(kitStateFor(s), "failed");
  assert.equal(s.value, "Yes");
  const back = composerReducer(s, { type: "online", online: true });
  assert.equal(kitStateFor(back), "typing");
  s = composerReducer(s, { type: "retry" });
  assert.equal(kitStateFor(s), "sending");
});

test("refused keeps the text and the code; typing clears the refusal; a version conflict is a reload that keeps the text", () => {
  let s = run(start(), [{ type: "change", value: "Hi" }, { type: "send" }, { type: "refused", reason: "checkout_locked" }]);
  assert.equal(kitStateFor(s), "refused");
  assert.equal(s.refusal, "checkout_locked");
  assert.equal(s.value, "Hi");
  s = composerReducer(s, { type: "change", value: "Hi there" });
  assert.equal(kitStateFor(s), "typing");
  assert.equal(s.refusal, null);
  const conflict = run(start(), [{ type: "change", value: "Hi" }, { type: "send" }, { type: "conflict_reloaded", text: "Hi" }, { type: "ok", text: "reloaded" }]);
  assert.equal(kitStateFor(conflict), "typing");
  assert.equal(conflict.value, "Hi");
  assert.equal(conflict.ok, "reloaded");
  assert.ok(isVersionConflict("conflict") && isVersionConflict("version_stale") && !isVersionConflict("expired"));
  assert.ok(isResolvedRefusal("already_resolved") && !isResolvedRefusal("conflict"));
});

test("resolved locks and unlocks; reopen clears the refusal; the note mode survives", () => {
  let s = run(start(), [{ type: "mode", mode: "note" }, { type: "change", value: "team only" }, { type: "resolved", resolved: true }]);
  assert.equal(kitStateFor(s), "resolved");
  s = composerReducer(s, { type: "resolved", resolved: false });
  assert.equal(kitStateFor(s), "typing");
  assert.equal(s.mode, "note");
});

test("Send via: web chat and email on, whatsapp needs the connection, sms is coming, counter is quiet; fallback is email for chat channels", () => {
  assert.equal(channelAvailability("web_chat", { whatsappConnected: false }), "on");
  assert.equal(channelAvailability("email", { whatsappConnected: false }), "on");
  assert.equal(channelAvailability("whatsapp", { whatsappConnected: false }), "not_connected");
  assert.equal(channelAvailability("whatsapp", { whatsappConnected: true }), "on");
  assert.equal(channelAvailability("sms", { whatsappConnected: true }), "coming");
  assert.equal(channelAvailability("counter", { whatsappConnected: true }), "quiet");
  assert.equal(fallbackFor("web_chat"), "email");
  assert.equal(fallbackFor("whatsapp"), "email");
  assert.equal(fallbackFor("email"), null);
  const s = composerReducer(start(), { type: "channel", channel: "email" });
  assert.equal(s.channel, "email");
});
