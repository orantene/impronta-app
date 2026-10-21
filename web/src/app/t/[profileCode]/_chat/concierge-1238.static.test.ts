/** TUL-1238: one Add per catalog row, localized placeholder name, consistent counts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { displayGuestName } from "./guest-placeholder-name";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "..", "..", "..");
const read = (f: string) => readFileSync(join(HERE, f), "utf8");
const msgs = (l: string) => (JSON.parse(readFileSync(join(WEB, "messages", `${l}.json`), "utf8")) as { public: { guestChat: Record<string, string> } }).public.guestChat;

test("a catalog row renders ONE add button (the select-in-page button no longer duplicates it)", () => {
  const src = read("GuestDockCatalog.tsx");
  assert.doesNotMatch(src, /\{selectInPage && row\.available \? \(\s*\n\s*<SmallButton/);
  assert.match(src, /if \(selectInPage\) selectCatalogRow\(/);
  assert.match(src, /selectInPage && row\.available \? null : buyHref/);
});

test("the lineup start-inquiry button counts the same items as the tray header", () => {
  const src = read("GuestDockLineupView.tsx");
  assert.match(src, /inquiryCount > 0 && onStartInquiry/);
  assert.match(src, /count: inquiryCount,/);
  assert.doesNotMatch(src, /count: cartTalents\.length,/);
});

test("the placeholder contact name is localized, a real name is untouched", () => {
  const t = (k: string) => (k === "public.guestChat.guestPlaceholderName" ? "Invitado" : k);
  assert.equal(displayGuestName("Guest", t), "Invitado");
  assert.equal(displayGuestName("  Guest ", t), "Invitado");
  assert.equal(displayGuestName("Sofia", t), "Sofia");
  assert.equal(displayGuestName(null, t), "");
});

test("tray copy has no mixed-language label in es and the new key exists in en + es", () => {
  assert.doesNotMatch(msgs("es").dockTrayOpenLineup, /Art[ií]culos/);
  assert.ok(msgs("en").guestPlaceholderName && msgs("es").guestPlaceholderName);
  assert.notEqual(msgs("en").dockTrayOpenLineup, "Open the Items tab");
});
