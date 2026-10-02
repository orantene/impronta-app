import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { RETENTION_PERIODS, retentionMode } from "./retention-config";
import { isAgeAndTermsConfirmed } from "./acceptances.core";

const read = (p: string) => readFileSync(p, "utf8");
const PAGES = [
  "src/app/(marketing)/legal/terms/page.tsx",
  "src/app/(marketing)/legal/terms/terms-es.tsx",
  "src/app/(marketing)/legal/privacy/page.tsx",
  "src/app/(marketing)/legal/privacy/privacy-es.tsx",
  "src/app/(marketing)/legal/refunds/page.tsx",
  "src/app/(marketing)/legal/refunds/refunds-es.tsx",
];

test("retention constants follow the 2026-10-01 owner decisions", () => {
  assert.equal(RETENTION_PERIODS.messagesAndBookingsYears, 3);
  assert.equal(RETENTION_PERIODS.deletedAccountPurgeDaysAfterGrace, 30);
  assert.equal(RETENTION_PERIODS.deletedAccountGraceDays, 14);
  assert.equal(RETENTION_PERIODS.logsDays, 90);
  assert.equal(retentionMode({}), "dry-run");
});

test("no page or deletion copy states the superseded retention periods", () => {
  for (const f of ["src/components/account/AccountDeletionCard.tsx", "src/lib/account/deletion-email.ts"]) {
    assert.doesNotMatch(read(f), /5 years|5 años/, f);
  }
});

test("legal pages do not claim Tulala collects on the talent's behalf", () => {
  for (const f of PAGES) {
    const s = read(f).replace(/\s+/g, " ");
    assert.doesNotMatch(s, /on behalf of the talent|en nombre del talento/i, f);
  }
  assert.match(read(PAGES[0]), /Pending legal review/);
  assert.match(read(PAGES[1]), /Pendiente de revisión legal/);
  assert.match(read(PAGES[2]), /Pending legal review/);
  assert.match(read(PAGES[3]), /Pendiente de revisión legal/);
});

test("signup acceptance: accepted vs missing", () => {
  assert.equal(isAgeAndTermsConfirmed("on"), true);
  assert.equal(isAgeAndTermsConfirmed(null), false);
});
