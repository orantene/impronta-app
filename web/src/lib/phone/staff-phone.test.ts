import assert from "node:assert/strict";
import { test } from "node:test";

import { checkStaffPhone, noPhoneHint, readStaffPhone, staffPhoneRequired } from "./staff-phone";

test("required only when the action needs it", () => {
  assert.equal(staffPhoneRequired({}), false);
  assert.equal(staffPhoneRequired({ channel: "phone" }), false);
  assert.equal(staffPhoneRequired({ sendConfirmation: true }), true);
  assert.equal(staffPhoneRequired({ sendPaymentLinkByWhatsapp: true }), true);
  assert.equal(staffPhoneRequired({ channel: "WhatsApp" }), true);
});

test("optional empty passes, required empty fails, valid is E.164", () => {
  assert.deepEqual(checkStaffPhone("", {}), { ok: true, phone: null });
  assert.equal(checkStaffPhone("  ", { sendConfirmation: true }, "es").ok, false);
  assert.deepEqual(checkStaffPhone("+52 55 1234 5678", {}), { ok: true, phone: "+525512345678" });
  assert.equal(checkStaffPhone("12", {}).ok, false);
});

test("read-time fallback never destroys stored values", () => {
  assert.equal(readStaffPhone("555-12"), "555-12");
  assert.equal(readStaffPhone("+52 55 1234 5678"), "+525512345678");
  assert.equal(readStaffPhone(null), "");
});

test("hint is bilingual", () => {
  assert.match(noPhoneHint("es"), /Sin teléfono/);
  assert.match(noPhoneHint("en"), /No phone/);
});
