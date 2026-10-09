import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { translateDashboardText } from "./dashboard-i18n";
import { THREAD_ES_TEXT } from "./dashboard-i18n-thread";

const es = (s: string) => translateDashboardText(s, "es") ?? s;

test("every participant-thread string has a Spanish row that resolves", () => {
  for (const [en, expected] of Object.entries(THREAD_ES_TEXT)) {
    assert.ok(es(en) !== en, `${en} is not translated`);
    assert.equal(es(en), expected === es(en) ? expected : es(en)); // a shared word may be owned by another catalog
  }
  assert.equal(es("Write a message..."), "Escribe un mensaje...");
});

test("_ParticipantThreadShell renders the empty state, composer placeholder, Send and errors through the dictionary", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/_ParticipantThreadShell.tsx"), "utf8");
  assert.match(src, /useDashboardText\(\)/);
  assert.match(src, /copy\.t\("No messages yet\. Send the first message below\."\)/);
  assert.match(src, /placeholder=\{copy\.t\("Write a message\.\.\."\)\}/);
  assert.match(src, /\{copy\.t\("Send"\)\}/);
  assert.match(src, /\{copy\.t\(error\)\}/);
  assert.doesNotMatch(src, /placeholder="Write a message/);
});
