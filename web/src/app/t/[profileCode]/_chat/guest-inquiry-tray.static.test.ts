/** TUL-1066: the persistent tray lists talent + catalog items; talent and catalog items can both be removed. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(HERE, f), "utf8");

test("the tray count is talent plus added catalog items", () => {
  const src = read("GuestInquiryTray.tsx");
  assert.match(src, /talents\.length \+ useAddedCatalogItems\(\)\.length/);
});

test("talent remove goes through the unified path; catalog items remove through removeAddedCatalogLine", () => {
  const src = read("GuestInquiryTray.tsx");
  assert.match(src, /onRemoveCartTalent\(tl\.talentProfileId\)/);
  assert.equal((src.match(/dockTrayRemove/g) ?? []).length, 2);
  assert.match(src, /removeAddedCatalogLine\(it\)/);
});

test("the dock mounts the tray with the remove path", () => {
  assert.match(read("MiniChatPanelColumn.tsx"), /<GuestDockInquiryTray onRemoveCartTalent=\{onRemoveCartTalent\}/);
});

test("TUL-1066: the open tray carries one primary Send inquiry step, wired to the chat that holds the draft", () => {
  assert.match(read("GuestDockInquiryTray.tsx"), /data-guest-inquiry-tray-send/);
  assert.match(read("GuestDockInquiryTray.tsx"), /dockTraySend/);
  assert.match(read("MiniChatPanelColumn.tsx"), /onSend=\{card \? undefined : startInquiryInChat\}/);
  for (const lang of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(HERE, "..", "..", "..", "..", "..", "messages", `${lang}.json`), "utf8")) as { public: { guestChat: Record<string, string> } };
    assert.ok(m.public.guestChat.dockTraySend, `${lang}.dockTraySend`);
  }
});

test("tray copy exists in EN and ES", () => {
  for (const lang of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(HERE, "..", "..", "..", "..", "..", "messages", `${lang}.json`), "utf8")) as { public: { guestChat: Record<string, string> } };
    for (const k of ["dockTrayLabel", "dockTrayRemove", "dockTrayOpenLineup"]) assert.ok(m.public.guestChat[k], `${lang}.${k}`);
  }
});
