import assert from "node:assert/strict";
import test from "node:test";

import { checkDrawerPhone } from "./drawer-phone-required";

test("missing phone is refused in the guest's language", () => {
  const en = checkDrawerPhone({ phone: "" }, "en");
  assert.equal(en.ok, false);
  const es = checkDrawerPhone(undefined, "es");
  assert.ok(!es.ok && /Falta el tel/.test(es.message));
});

test("a short or junk phone is refused", () => {
  assert.equal(checkDrawerPhone({ phone: "123" }).ok, false);
});

test("a valid number passes and returns E.164", () => {
  const r = checkDrawerPhone({ phone: "+52 998 123 4567" });
  assert.ok(r.ok && r.phone === "+529981234567");
});
