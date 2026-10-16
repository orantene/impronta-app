import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supportHandoffBody, ticketHandoffLocale } from "./support-handoff-copy";

test("handoff body follows the locale", () => {
  assert.match(supportHandoffBody("en"), /^Your ticket is with .+\.$/);
  assert.match(supportHandoffBody("es"), /^Tu ticket está con .+\.$/);
  assert.match(supportHandoffBody(undefined), /^Your ticket is with/);
});

test("handoff body prefers the ticket's own locale over the dashboard cookie (TUL-602)", () => {
  assert.equal(
    ticketHandoffLocale({ locale: "en" }, "es"),
    "en",
  );
  assert.equal(ticketHandoffLocale({ locale: "es" }, "en"), "es");
  assert.equal(ticketHandoffLocale({}, "es"), "es");
  assert.equal(ticketHandoffLocale(null, "en"), "en");
});

test("handoff card copy is gender neutral", () => {
  const en = JSON.parse(readFileSync(join(__dirname, "../../../messages/en.json"), "utf8"));
  assert.doesNotMatch(en.dashboard.adminSupport.handoffBody, /\b(he|she|him|her)\b/i);
});
