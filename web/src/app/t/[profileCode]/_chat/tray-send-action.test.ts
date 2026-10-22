import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { traySendAction } from "./tray-send-action";

test("TUL-966: a live draft is submitted, a sent thread opens, only no record starts one", () => {
  assert.equal(traySendAction({ draftExists: true, canSubmit: true, recordExists: true, promoted: false }), "submit");
  assert.equal(traySendAction({ draftExists: false, canSubmit: false, recordExists: true, promoted: true }), "open_thread");
  assert.equal(traySendAction({ draftExists: false, canSubmit: false, recordExists: false, promoted: false }), "start");
});

test("TUL-966: the sent confirmation survives the send and links to the thread, en + es", () => {
  const col = readFileSync("src/app/t/[profileCode]/_chat/MiniChatPanelColumn.tsx", "utf8");
  assert.match(col, /\(sentNote \|\| \(onSendToAgency/);
  assert.match(col, /onViewThread=/);
  for (const loc of ["en", "es"]) {
    const m = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")) as { public: { guestChat: Record<string, string> } };
    assert.ok(m.public.guestChat.sendSentTitle && m.public.guestChat.sendSentViewThread);
  }
  assert.equal((JSON.parse(readFileSync("messages/es.json", "utf8")) as { public: { guestChat: Record<string, string> } }).public.guestChat.sendSentTitle, "Solicitud enviada");
});
