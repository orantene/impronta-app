import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// TUL-1415 / TUL-1587: the front-door chat must actually call the roster request action.
// QA on build cc54a839 found it was built but never wired, so the sentence went out as a plain message.
const dir = fileURLToPath(new URL(".", import.meta.url));
const send = readFileSync(join(dir, "use-mini-chat-send.ts"), "utf8");

test("the first send runs the sentence through the neutral-path roster action, lazily", () => {
  assert.match(send, /import\("@\/lib\/server-actions\/roster-request"\)/);
  assert.match(send, /buildRosterRequestFromSentence\(\{ sentence, locale: args\.locale \?\? null \}\)/);
  assert.match(send, /res\.ok \? res\.message : sentence/);
});

test("it runs after the gate and instant-answer routes, before either create path, and a failure never blocks the send", () => {
  const gate = send.indexOf('if (route === "gate")');
  const call = send.indexOf("body = await rosterRequestBody(typed)");
  const early = send.indexOf('firstSendPlan(earlyId, contactPromoted) === "continue"');
  assert.ok(gate > 0 && call > gate && early > call);
  const fn = send.slice(send.indexOf("async function rosterRequestBody"), send.indexOf("async function handleFirstSendUnlocked"));
  assert.match(fn, /catch \{\s*return sentence;/);
});

test("a failed send puts back what the guest typed, not the rewritten request", () => {
  const seg = send.slice(send.indexOf("async function handleFirstSendUnlocked"), send.indexOf("/** Create a fresh inquiry"));
  assert.doesNotMatch(seg, /setDraft\(body\)/);
  assert.match(seg, /setDraft\(typed\)/);
});
