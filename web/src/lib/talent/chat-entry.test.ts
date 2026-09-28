import assert from "node:assert/strict";
import test from "node:test";

import {
  askEntryPointsVisible,
  dockMounted,
  resolveTalentAskEntry,
  resolveTalentChatGreeting,
} from "./chat-entry";
import { parseTalentSiteSwitches } from "./site-switches";

test("ask entry across chat x inquiries, no thread (report §8)", () => {
  const cases: [boolean, boolean, string][] = [
    [true, true, "chat"],
    [false, true, "form"],
    [true, false, "existing_client"], // §8 On/Off/On: chat stays, existing clients only
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

test("a visitor with an active thread always keeps the dock", () => {
  for (const chatEnabled of [true, false]) {
    for (const acceptingInquiries of [true, false]) {
      const entry = resolveTalentAskEntry(
        { chatEnabled, acceptingInquiries },
        { hasActiveThread: true },
      );
      assert.ok(dockMounted(entry), `chat=${chatEnabled} inquiries=${acceptingInquiries}`);
      // Only the fully-open talent shows new-conversation entry points.
      assert.equal(askEntryPointsVisible(entry), chatEnabled && acceptingInquiries);
    }
  }
});

test("entry points and dock per entry", () => {
  assert.deepEqual(
    (["chat", "existing_client", "form", "hidden"] as const).map((e) => [
      askEntryPointsVisible(e),
      dockMounted(e),
    ]),
    [
      [true, true],
      [false, true],
      [true, false],
      [false, false],
    ],
  );
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

test("existing-client mode explains itself (EN + ES tú), over her own greeting", () => {
  const own = parseTalentSiteSwitches({ chat_config: { greeting: "Hola" } });
  const es = resolveTalentChatGreeting(own, "x", { entry: "existing_client", locale: "es" });
  const en = resolveTalentChatGreeting(own, "x", { entry: "existing_client", locale: "en" });
  assert.match(es ?? "", /reserva que ya tienes/);
  assert.match(en ?? "", /Message only about an existing booking/);
  assert.doesNotMatch(`${es}${en}`, /—/);
});
