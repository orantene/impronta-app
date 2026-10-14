import test from "node:test";
import assert from "node:assert/strict";

import { inquiryManagerDeniedMessage } from "./inquiry-manager-denied";

test("denial copy is Spanish for es and es-MX", () => {
  assert.match(inquiryManagerDeniedMessage("es"), /No tienes permiso/);
  assert.match(inquiryManagerDeniedMessage("es-MX"), /No tienes permiso/);
});

test("denial copy falls back to English and never says 'not the coordinator'", () => {
  for (const l of ["en", "fr", null, undefined]) {
    const m = inquiryManagerDeniedMessage(l);
    assert.match(m, /permission/);
    assert.doesNotMatch(m, /not the coordinator/i);
  }
});
