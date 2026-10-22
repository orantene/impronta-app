import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// TUL-1415 / TUL-1587: the front-door chat must send the roster sentence as a STRUCTURED request
// (lines the owner inbox draws), not only a rewritten chat message. QA on staging build 5 (main
// f70e89ca89) found the action result was used for its text alone, so the owner saw a plain message.
const dir = fileURLToPath(new URL(".", import.meta.url));
const root = join(dir, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const send = readFileSync(join(dir, "use-mini-chat-send.ts"), "utf8");
const actions = read("src/app/t/[profileCode]/_actions/guest-chat-actions.ts");

test("the first send runs the sentence through the neutral-path roster action, lazily, and keeps the structured lines", () => {
  assert.match(send, /import\("@\/lib\/server-actions\/roster-request"\)/);
  assert.match(send, /buildRosterRequestFromSentence\(\{ sentence, locale: args\.locale \?\? null \}\)/);
  assert.match(send, /body: res\.message, request: toRosterRequestWire\(res\)/);
  assert.match(send, /body: sentence, request: null/);
});

test("it runs after the gate and instant-answer routes, before either create path, and a failure never blocks the send", () => {
  const gate = send.indexOf('if (route === "gate")');
  const call = send.indexOf("await rosterRequestFor(typed)");
  const early = send.indexOf('firstSendPlan(earlyId, contactPromoted) === "continue"');
  assert.ok(gate > 0 && call > gate && early > call);
  const fn = send.slice(send.indexOf("async function rosterRequestFor"), send.indexOf("async function handleFirstSendUnlocked"));
  assert.match(fn, /catch \{\s*return \{ body: sentence, request: null \}/);
});

test("BOTH delivery paths carry the structured request: the fresh create and the early-row continue", () => {
  const start = send.slice(send.indexOf("await onStartInquiry({"), send.indexOf("setSending(false);", send.indexOf("await onStartInquiry({")));
  assert.match(start, /rosterRequest: roster\.request/);
  const cont = send.slice(send.indexOf("async function continueEarlyInquiry"), send.indexOf("async function rosterRequestFor"));
  assert.match(cont, /rosterRequest: RosterRequestWire \| null/);
  assert.match(cont, /await onSendMessage\(\{[\s\S]*?\.\.\.\(rosterRequest \? \{ rosterRequest \} : \{\}\)/);
  assert.match(send, /continueEarlyInquiry\(earlyId, body, roster\.request\)/);
});

test("a failed send puts back what the guest typed, not the rewritten request", () => {
  const seg = send.slice(send.indexOf("async function handleFirstSendUnlocked"), send.indexOf("/** Create a fresh inquiry"));
  assert.doesNotMatch(seg, /setDraft\(body\)/);
  assert.match(seg, /setDraft\(typed\)/);
});

test("the server stores the request ON the guest message through every first-message path, re-validated against the roster", () => {
  assert.match(actions, /resolveRosterRequestMetadata\(admin, tenantId, input\.rosterRequest\)/g);
  const uses = actions.match(/resolveRosterRequestMetadata\(/g) ?? [];
  // fresh create, join-an-open-thread, and the early-row follow-up send
  assert.equal(uses.length, 3);
  assert.match(actions, /resolveRosterRequestMetadata\(admin, owned\.inquiry\.tenantId, input\.rosterRequest\)/);
  const engine = read("src/lib/inquiry/inquiry-engine-messages.ts");
  assert.match(engine, /metadata: \{ \.\.\.\(ctx\.metadata \?\? \{\}\) \}/);
  const cont = read("src/lib/inquiry/guest-continue-thread.ts");
  assert.match(cont, /metadata: args\.metadata/);
});

test("the server re-reads the tenant-strict roster, refuses a hub, and fails closed to a plain message", () => {
  const srv = read("src/lib/service-hub/roster-request-meta.server.ts");
  assert.match(srv, /loadRequestableServices\(admin, tenantId\)/);
  assert.match(srv, /kind === "hub"\) return undefined/);
  assert.match(srv, /catch \(err\)[\s\S]*return undefined/);
});

test("the owner inbox reads the stored request onto the thread message and draws it", () => {
  assert.match(read("src/lib/messaging/thread.ts"), /rosterRequest: readRosterRequestMeta\(row\.metadata\)/);
  assert.match(read("src/components/messages-v5/kit/MessageBubble.tsx"), /message\.rosterRequest \?/);
});
