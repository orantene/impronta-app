import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { supportChatFailOpenFields } from "./support-chat-fail-open-log";
import { supportChatOfferHumanBody } from "./support-chat-shared";

test("fail-open fields carry the reason and a sanitized short code, nothing else", () => {
  assert.deepEqual(supportChatFailOpenFields("model", "timeout"), { reason: "model", code: "timeout" });
  assert.deepEqual(supportChatFailOpenFields("parse"), { reason: "parse" });
  const f = supportChatFailOpenFields("gated", "spend cap!\nuser@x.com");
  assert.match(f.code ?? "", /^[a-z0-9_]+$/i);
});

test("every fail-open in the route records its reason", () => {
  const src = readFileSync("src/app/api/ai/support-chat/route.ts", "utf8");
  const calls = src.match(/await failOpen\([^)]*\)/g) ?? [];
  assert.equal(calls.length, 5);
  for (const c of calls) assert.match(c, /failOpen\(ticketId, "/);
  assert.match(src, /logSupportChatFailOpen\(ticketId, reason, code\)/);
});

test("the stored offer-human body follows the requester's language", () => {
  assert.match(supportChatOfferHumanBody("es-MX"), /^¿Quieres que .* vistazo\?$/);
  assert.match(supportChatOfferHumanBody("en"), /^Want .* to take a look\?$/);
  assert.doesNotMatch(readFileSync("src/app/api/ai/support-chat/route.ts", "utf8"), /`Want \$\{/);
});
