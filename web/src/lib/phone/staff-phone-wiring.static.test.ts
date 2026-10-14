import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const UI = [
  "components/admin/pos/CustomerSheet.tsx",
  "app/(workspace)/[tenantSlug]/admin/pos/classes-booking.tsx",
  "app/(workspace)/[tenantSlug]/admin/pos/door-box-checkout.tsx",
  "components/admin/admin-new-inquiry-sheet.tsx",
  "components/admin/forms/admin-new-client-sheet.tsx",
  "components/admin/shell/internal/talent/agenda/AgendaNewBooking.tsx",
];

for (const f of UI) {
  test(`staff phone is the shared optional field: ${f}`, () => {
    const src = read(f);
    assert.match(src, /<GuestPhoneField/);
    assert.match(src, /\boptional\b/);
    assert.doesNotMatch(src, /type="tel"/);
  });
}

for (const f of [
  "components/admin/pos/CustomerSheet.tsx",
  "app/(workspace)/[tenantSlug]/admin/pos/classes-booking.tsx",
  "components/admin/admin-new-inquiry-sheet.tsx",
  "components/admin/forms/admin-new-client-sheet.tsx",
  "components/admin/shell/internal/talent/agenda/AgendaNewBooking.tsx",
]) {
  test(`no-phone hint shown: ${f}`, () => assert.match(read(f), /noPhoneHint/));
}

test("inquiry sheet requires phone only for the WhatsApp channel", () => {
  assert.match(read("components/admin/admin-new-inquiry-sheet.tsx"), /optional=\{!staffPhoneRequired\(\{ channel \}\)\}/);
});

for (const f of [
  "lib/server-actions/admin-inquiries.ts",
  "lib/server-actions/admin-clients.ts",
  "lib/talent-agenda/create-slot.ts",
]) {
  test(`server validates and normalizes staff phone: ${f}`, () => {
    const src = read(f);
    assert.match(src, /checkStaffPhone\(/);
    assert.match(src, /requireNotImpersonating\(\)|assertNotImpersonating\(\)/);
  });
}
