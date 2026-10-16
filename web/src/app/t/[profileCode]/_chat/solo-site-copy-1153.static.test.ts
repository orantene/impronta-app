import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const body = readFileSync(join(__dirname, "GuestConversationBody.tsx"), "utf8");
const en = JSON.parse(readFileSync(join(__dirname, "../../../../../messages/en.json"), "utf8"));
const es = JSON.parse(readFileSync(join(__dirname, "../../../../../messages/es.json"), "utf8"));

test("TUL-1153: solo site never leads with the directory talent-pick greeting", () => {
  assert.match(body, /talentPickFirst && !brand\.soloTalent/);
});

test("TUL-1153: lineup empty state has no directory wording", () => {
  assert.doesNotMatch(en.public.guestChat.dockLineupEmptyInquiry, /directory/i);
  assert.doesNotMatch(es.public.guestChat.dockLineupEmptyInquiry, /directorio/i);
});

test("TUL-1153: a one-talent workspace site is flagged soloTalent in the agency mount", () => {
  const mount = readFileSync(join(__dirname, "../../../(public)/_chat/AgencyChatLauncherMount.tsx"), "utf8");
  assert.match(mount, /rosterSize !== null && rosterSize <= 1/);
  assert.match(mount, /\n\s+soloTalent,\n/);
});

test("TUL-1153: the send bar never says agency on a one-talent site", () => {
  const bar = readFileSync(join(__dirname, "SendToAgencyBar.tsx"), "utf8");
  const col = readFileSync(join(__dirname, "MiniChatPanelColumn.tsx"), "utf8");
  assert.match(bar, /isHub \|\| solo\s*\n\s*\? t\("public\.guestChat\.sendHub"\)/);
  assert.match(col, /solo=\{Boolean\(brand\.soloTalent\)\}/);
  assert.doesNotMatch(es.public.guestChat.sendSoloSent, /agencia/i);
});
