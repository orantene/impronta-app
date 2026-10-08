import test from "node:test";
import assert from "node:assert/strict";

import { guestChatLimitMessage } from "./guest-chat-limit-copy";

test("the limit line is Spanish for es and English otherwise, with no em dash, for every tier", () => {
  for (const tier of ["account", "email_verified", "guest"]) {
    const es = guestChatLimitMessage(tier, "es");
    const en = guestChatLimitMessage(tier, "en");
    assert.notEqual(es, en);
    assert.ok(!/[—–]/.test(es) && !/[—–]/.test(en));
    assert.ok(!/\b(You|your|verify|account)\b/.test(es.replace("cuenta", "")), es);
  }
  assert.match(guestChatLimitMessage("guest", "es"), /Verifica tu email/);
  assert.match(guestChatLimitMessage("guest", null), /Verify your email/);
});
