/**
 * TUL-1123 (guard for TUL-825): a brand-new account has services without photos
 * and nothing else wrong. The Services page must say that as a friendly
 * optional tip, never as the "2 sin foto" / "items need attention" warning.
 * Fails if the tip wiring in ServicesHome is reverted to the warning sentence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { attentionSummary, photoOnlyTip } from "./attention-summary";

const HOME = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "ServicesHome.tsx"), "utf8");

const NEW_ACCOUNT = { total: 2, noPhoto: 2, noPrice: 0, soldOut: 0 };
const WARNING_WORDS = /atenci[oó]n|attention|necesitan|need|sin foto|no photo/i;

describe("TUL-1123 brand-new account sees a gentle tip, not a warning", () => {
  for (const locale of ["es", "es-MX", "en"]) {
    it(`photo-only gap reads as an optional tip (${locale})`, () => {
      const tip = photoOnlyTip(NEW_ACCOUNT, locale);
      assert.ok(tip, "a photo-only gap must produce a tip");
      assert.match(tip, /opcional|optional/i);
      assert.doesNotMatch(tip, WARNING_WORDS);
    });
  }

  it("the warning sentence is still what real problems get", () => {
    assert.match(attentionSummary({ total: 2, noPhoto: 1, noPrice: 1, soldOut: 0 }, "es"), /sin foto/);
    assert.equal(photoOnlyTip({ total: 2, noPhoto: 1, noPrice: 1, soldOut: 0 }, "es"), null);
  });

  it("ServicesHome shows the tip first and the warning only as the fallback", () => {
    assert.match(
      HOME,
      /photoOnlyTip\(\{ total: attentionTotal, \.\.\.attention \}, copy\.locale\) \?\? attentionSummary\(/,
    );
  });

  it("the strip stays neutral: no warning colours on it", () => {
    const block = HOME.slice(HOME.indexOf("attentionTotal > 0 && filter"), HOME.indexOf("attentionTotal > 0 && filter") + 700);
    assert.ok(block.includes("border-admin-border-soft bg-white"), "neutral strip classes");
    assert.doesNotMatch(block, /amber|rose|red-|orange|yellow|warn/i);
  });
});
