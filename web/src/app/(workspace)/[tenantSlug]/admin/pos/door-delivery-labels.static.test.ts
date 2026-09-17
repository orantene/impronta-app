import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * D-162: the door's Delivery sheet showed the same "Reenviar" on the e-mail
 * row and the print row, and "Sent again." never said which channel. Two
 * comp tickets were re-sent to a printer instead of the guest (Impronta
 * LUMINA, 2026-09-17). The rows must carry distinct actions and the
 * confirmation must name the channel.
 */
const lookup = readFileSync(new URL("./door-lookup.tsx", import.meta.url), "utf8");

test("the print row uses its own action label, not the e-mail one", () => {
  assert.match(lookup, /action: copy\.resend, method: "email" as const/);
  assert.match(lookup, /action: copy\.reprint, method: "print" as const/);
});

test("the confirmation names the channel", () => {
  assert.match(lookup, /copy\.sentEmail/);
  assert.match(lookup, /copy\.sentPrint/);
  assert.doesNotMatch(lookup, /setNote\(res\.ok \? copy\.sent : copy\.notSent\)/);
});

test("e-mail and print labels differ in every language", () => {
  for (const lang of ["en", "es", "fr"] as const) {
    const d = JSON.parse(readFileSync(new URL(`../../../../../../messages/${lang}.json`, import.meta.url), "utf8"));
    const n = d.dashboard.pos.door.delivery;
    assert.ok(n.resend && n.reprint && n.resend !== n.reprint, `${lang}: distinct labels`);
    assert.ok(n.sentEmail.includes("{email}"), `${lang}: sentEmail names the address`);
    assert.ok(typeof n.sentPrint === "string" && n.sentPrint.length > 0, `${lang}: sentPrint present`);
  }
});
