import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { TALENT_ENGINE_STAFF_ONLY, talentWriteRefusal } from "@/lib/messaging/talent-writes";

import { sellerTrayGroups, defaultTrayGroups } from "../kit/Tray";
import { EN_COPY as testKitCopy } from "../kit/test-copy";
import { sellerMenuItems } from "./seller";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "talent-engine.ts"), "utf8");

/** Verbs whose talent implementation is `() => refused()`. */
function refusedVerbs(): string[] {
  return [...src.matchAll(/^\s+(\w+): \(\) => refused\(\),?$/gm)].map((m) => m[1]!).sort();
}

test("F38: start conversation, notes, resolve/reopen and upload are real on the talent engine", () => {
  for (const verb of ["startConversation", "resolve", "reopen"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${verb}: \\(\\) => refused\\(\\)`), `${verb} still refuses`);
  }
  assert.match(src, /startConversation: \(input\) => messagingTalentStartConversation\(input\)/);
  assert.match(src, /note: \(input\) => messagingTalentPrivateNote\(input\)/);
  assert.match(src, /upload: engineComposerActions\.upload/);
  assert.doesNotMatch(src, /You cannot do that from here/);
  assert.match(src, /seller: true/);
});

test("F38: the only refusing verbs are the declared staff-only ones", () => {
  assert.deepEqual(refusedVerbs(), [...TALENT_ENGINE_STAFF_ONLY].sort());
});

test("F38: seller chrome renders no control for a staff-only verb", () => {
  const menu = [{ id: "rename" }, { id: "handover" }, { id: "copy_link" }, { id: "history" }, { id: "close_lost" }];
  assert.deepEqual(sellerMenuItems(menu, true).map((m) => m.id), ["copy_link"]);
  const keys = sellerTrayGroups(testKitCopy).flatMap((g) => g.items.map((i) => i.key));
  assert.ok(!keys.includes("handover") && !keys.includes("close_lost"));
  assert.ok(keys.includes("file") && keys.includes("payment"));
  assert.ok(defaultTrayGroups(testKitCopy).flatMap((g) => g.items.map((i) => i.key)).includes("handover"));
});

test("F38: her writes run on her own sale and refuse on an agency sale", () => {
  assert.equal(talentWriteRefusal(true), null);
  assert.equal(talentWriteRefusal(false), "not_her_sale");
});

test("talent upload accepts a talent named on a guest chat; voice mic is hidden for her", () => {
  const signed = readFileSync(join(process.cwd(), "src/lib/server-actions/inquiry-attachment-signed.ts"), "utf8");
  assert.match(signed, /loadOwnedTalentInquiry/);
  assert.match(signed, /talentNamedScope/);
  const engine = readFileSync(join(process.cwd(), "src/components/messages-v5/shell/talent-engine.ts"), "utf8");
  assert.match(engine, /voice: false/);
});
