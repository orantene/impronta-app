/**
 * quota-line.test.ts — the "N of M photos" sentence (B13).
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *      node_modules/.bin/tsx --test src/lib/media/quota-line.test.ts
 *
 * Three things this pins, all of which are the difference between a useful
 * line and a broken one:
 *   1. an UNMETERED plan never renders a fraction — "42 of null photos" is the
 *      exact failure the plan called out;
 *   2. the "almost full" tone fires at the SAME threshold the upload gate warns
 *      on, so the line and the warning cannot say different things;
 *   3. no tone maps to an amber/gold class — the admin palette bans them.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { MEDIA_QUOTA_SOFT_WARN_RATIO } from "@/lib/billing/media-entitlements";
import {
  advanceMediaQuota,
  formatMediaQuotaLine,
  mediaQuotaToneClass,
} from "@/lib/media/quota-line";

/** Stand-in catalog: echoes the key's placeholders so substitution is visible. */
const CATALOG: Record<string, string> = {
  "dashboard.mediaQuota.usage": "{used} of {cap} photos used on your plan.",
  "dashboard.mediaQuota.unlimited": "Your plan has no photo limit.",
  "dashboard.mediaQuota.roomLeft": "Room for {remaining} more.",
  "dashboard.mediaQuota.full": "No room left.",
  "dashboard.mediaQuota.forTalent": "{talent}: {used} of {cap} photos used on their plan.",
  "dashboard.mediaQuota.forTalentUnlimited": "{talent} has no photo limit on their plan.",
};
const t = (key: string) => CATALOG[key] ?? key;

test("no quota renders no line at all, never a guessed zero", () => {
  assert.equal(formatMediaQuotaLine(t, null), null);
  assert.equal(formatMediaQuotaLine(t, undefined), null);
});

test("an unmetered plan never prints a fraction", () => {
  const line = formatMediaQuotaLine(t, { used: 412, cap: null, remaining: null });
  assert.ok(line);
  assert.equal(line.text, "Your plan has no photo limit.");
  assert.equal(line.tone, "normal");
  assert.ok(!line.text.includes("null"));
});

test("an unmetered plan read by staff names the talent and still has no fraction", () => {
  const line = formatMediaQuotaLine(t, { used: 5, cap: null, remaining: null }, "Ana Ruiz");
  assert.ok(line);
  assert.equal(line.text, "Ana Ruiz has no photo limit on their plan.");
  assert.ok(!line.text.includes("null"));
});

test("a metered plan reads as used-of-cap plus the room left", () => {
  const line = formatMediaQuotaLine(t, { used: 42, cap: 150, remaining: 108 });
  assert.ok(line);
  assert.equal(line.text, "42 of 150 photos used on your plan. Room for 108 more.");
  assert.equal(line.tone, "normal");
});

test("staff read the same numbers in the third person", () => {
  const line = formatMediaQuotaLine(t, { used: 142, cap: 150, remaining: 8 }, "Ana Ruiz");
  assert.ok(line);
  assert.equal(line.text, "Ana Ruiz: 142 of 150 photos used on their plan. Room for 8 more.");
});

test("the attention tone fires at the same ratio the upload gate warns on", () => {
  const cap = 150;
  const warnAt = Math.floor(cap * MEDIA_QUOTA_SOFT_WARN_RATIO);

  const under = formatMediaQuotaLine(t, { used: warnAt - 1, cap, remaining: cap - warnAt + 1 });
  const at = formatMediaQuotaLine(t, { used: warnAt, cap, remaining: cap - warnAt });
  assert.equal(under?.tone, "normal");
  assert.equal(at?.tone, "attention");
});

test("a full plan says so and reads as an error, not as a nudge", () => {
  const line = formatMediaQuotaLine(t, { used: 150, cap: 150, remaining: 0 });
  assert.ok(line);
  assert.equal(line.tone, "full");
  assert.ok(line.text.endsWith("No room left."));
});

test("someone already over their cap is never shown a negative remainder", () => {
  const line = formatMediaQuotaLine(t, { used: 170, cap: 150, remaining: null });
  assert.ok(line);
  assert.equal(line.tone, "full");
  assert.ok(!line.text.includes("-"));
});

test("a landed upload advances the snapshot without a re-read", () => {
  assert.deepEqual(advanceMediaQuota({ used: 41, cap: 150, remaining: 109 }), {
    used: 42,
    cap: 150,
    remaining: 108,
  });
  // Unmetered stays unmetered, and remaining never goes below zero.
  assert.deepEqual(advanceMediaQuota({ used: 9, cap: null, remaining: null }), {
    used: 10,
    cap: null,
    remaining: null,
  });
  assert.deepEqual(advanceMediaQuota({ used: 150, cap: 150, remaining: 0 }), {
    used: 151,
    cap: 150,
    remaining: 0,
  });
  assert.equal(advanceMediaQuota(null), null);
});

test("no tone reaches for an amber or gold class", () => {
  for (const tone of ["normal", "attention", "full"] as const) {
    const cls = mediaQuotaToneClass(tone);
    assert.ok(
      !/amber|gold|orange|yellow/i.test(cls),
      `${tone} resolved to ${cls}; admin chrome bans warm accents`,
    );
  }
  // The readable ink token, not the 0.38-alpha dim one — this line is
  // information, and the contrast trap is real (B4).
  assert.equal(mediaQuotaToneClass("normal"), "text-admin-ink-muted");
});
