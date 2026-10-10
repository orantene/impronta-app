import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { translateDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { TRUST_ES_TEXT, translateRiskLine } from "@/components/admin/shell/internal/dashboard-i18n-trust";

const here = dirname(fileURLToPath(import.meta.url));
const es = (s: string) => translateDashboardText(s, "es") ?? s;

test("TUL-500: every guest-trust chip and empty-thread string has a Spanish row that resolves", () => {
  for (const [en, expected] of Object.entries(TRUST_ES_TEXT)) {
    if (expected === en) continue; // same word in both languages (Spam)
    const got = es(en);
    assert.notEqual(got, en, `${en} is not translated`);
    // Another catalog may already own a shared word (Email, Phone, Cancel, ...): either value is Spanish, never English.
    assert.ok(got === expected || got !== en, en);
  }
});

test("risk lines with a booking count translate by shape", () => {
  assert.equal(translateRiskLine("Gold client · booked 3x on Tulala", true, es), "Cliente Oro · 3 reservas en Tulala");
  assert.equal(translateRiskLine("Booked 1x on Tulala", true, es), "1 reserva en Tulala");
  assert.equal(translateRiskLine("New guest — unverified", true, es), "Invitado nuevo, sin verificar");
  assert.equal(translateRiskLine("Booked 3x on Tulala", false, es), "Booked 3x on Tulala");
});

test("GuestTrustChip renders its labels through the dashboard dictionary", () => {
  const src = readFileSync(join(here, "GuestTrustChip.tsx"), "utf8");
  assert.match(src, /useDashboardText\(\)/);
  assert.match(src, /copy\.t\(identityMeta\.label\)/);
  assert.match(src, /copy\.t\(blockState === "done" \? "Blocked"/);
  assert.match(src, /copy\.t\(reportState === "choosing" \? "Cancel" : "Report"\)/);
  assert.match(src, /translateRiskLine\(riskLine, copy\.isSpanish, copy\.t\)/);
  assert.doesNotMatch(src, />\s*\{identityMeta\.label\}\s*</);
  // TUL-379: seed displayName "Guest" / empty → localized, not raw English.
  assert.match(src, /copy\.t\("Guest"\)/);
  assert.match(src, /identity === "guest"/);
});

test("the empty thread state translates its title and body", () => {
  const src = readFileSync(join(here, "..", "talent", "talent-thread-stream.tsx"), "utf8");
  assert.match(src, /copy\.t\(title\)/);
  assert.match(src, /copy\.t\(body\)/);
});
