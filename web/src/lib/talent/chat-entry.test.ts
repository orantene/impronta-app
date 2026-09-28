import assert from "node:assert/strict";
import test from "node:test";

import { resolveTalentAskEntry, resolveTalentChatGreeting } from "./chat-entry";
import { parseTalentSiteSwitches } from "./site-switches";

test("ask entry across chat on/off x inquiries on/off", () => {
  const cases: [boolean, boolean, string][] = [
    [true, true, "chat"],
    [false, true, "form"],
    [true, false, "hidden"],
    [false, false, "hidden"],
  ];
  for (const [chatEnabled, acceptingInquiries, want] of cases) {
    assert.equal(
      resolveTalentAskEntry({ chatEnabled, acceptingInquiries }),
      want,
      `chat=${chatEnabled} inquiries=${acceptingInquiries}`,
    );
  }
});

test("a talent with no talent_sites row gets the chat", () => {
  assert.equal(resolveTalentAskEntry(parseTalentSiteSwitches(null)), "chat");
});

test("greeting: her own greeting wins, else the default", () => {
  const own = parseTalentSiteSwitches({ chat_config: { greeting: "  Hola, cuéntame  " } });
  assert.equal(resolveTalentChatGreeting(own, "Trade voice"), "Hola, cuéntame");
  const none = parseTalentSiteSwitches({ chat_config: { greeting: "   " } });
  assert.equal(resolveTalentChatGreeting(none, "Trade voice"), "Trade voice");
  assert.equal(resolveTalentChatGreeting(parseTalentSiteSwitches(null), null), null);
});
