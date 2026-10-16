import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator } from "@/i18n/messages";

import { accountQuickLinks } from "./quick-links";

test("quick links point at the real /account tabs, ES and EN", () => {
  const es = accountQuickLinks(createTranslator("es"));
  assert.deepEqual(es.map((l) => [l.label, l.href]), [
    ["Mis reservas", "/account"],
    ["Mensajes", "/account?tab=messages"],
    ["Recibos", "/account?tab=payments"],
    ["Mi cuenta", "/account?tab=settings"],
  ]);
  const en = accountQuickLinks(createTranslator("en"));
  assert.deepEqual(en.map((l) => l.label), ["My bookings", "Messages", "Receipts", "My account"]);
});

test("an absolute account base (marketing apex) is kept", () => {
  const links = accountQuickLinks(createTranslator("en"), "https://app.tulala.digital/account");
  assert.equal(links[1].href, "https://app.tulala.digital/account?tab=messages");
  assert.equal(links[0].href, "https://app.tulala.digital/account");
});
