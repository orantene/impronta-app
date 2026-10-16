/**
 * TUL-693: guest chat aria labels and composer labels must come from the
 * catalog (no English on an ES page and vice versa).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const CHAT = path.join(process.cwd(), "src/app/t/[profileCode]/_chat");
const read = (f: string) => readFileSync(path.join(CHAT, f), "utf8");

const REMOVED: Record<string, string[]> = {
  "GuestThreadSwitcherParts.tsx": ['aria-label="New message"'],
  "GuestThreadSwitcher.tsx": ['aria-label="Unread conversations"'],
  "MiniChatPanelColumn.tsx": ['"Enviar mensaje"', '"Tu diseño"', '"Quitar diseño"', '"Your look"', '"Remove look"', '"Send message"'],
};

const KEYS = ["newMessageAria", "unreadConversationsAria", "lookPreviewLabel", "lookPreviewRemoveLabel", "gateSend"];

test("removed hard-coded literals stay gone", () => {
  for (const [file, literals] of Object.entries(REMOVED)) {
    const src = read(file);
    for (const lit of literals) assert.ok(!src.includes(lit), `${file} still has ${lit}`);
  }
});

test("new keys exist in en and es", () => {
  for (const lang of ["en", "es"]) {
    const json = JSON.parse(readFileSync(path.join(process.cwd(), `messages/${lang}.json`), "utf8"));
    for (const k of KEYS) {
      assert.equal(typeof json.public.guestChat[k], "string", `${lang}: public.guestChat.${k}`);
    }
  }
});

test("claim email COPY has matching en and es entries", () => {
  const src = readFileSync(path.join(process.cwd(), "src/lib/inquiry/guest-claim-email.ts"), "utf8");
  for (const k of ["subject", "heading", "body", "cta", "private", "reason", "fallbackWho"]) {
    assert.equal(src.split(new RegExp(`^\\s+${k}:`, "gm")).length - 1, 2, `COPY.${k} must exist for en and es`);
  }
});
