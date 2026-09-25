import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Static guard: Clients must query real talent_bookings columns.
 * A prior select used client_name / amount_cents / currency and hard-failed
 * the live Clients page for every talent (including Jor).
 */
describe("loadTalentClients column contract", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "clients-actions.ts"), "utf8");

  it("selects client_label from talent_bookings, not client_name/amount_cents", () => {
    const block = src.match(
      /\.from\("talent_bookings"\)[\s\S]{0,240}?\.select\(([^)]+)\)/,
    );
    assert.ok(block, "expected a talent_bookings select");
    const selectArgs = block[1] ?? "";
    assert.match(selectArgs, /client_label/);
    assert.doesNotMatch(selectArgs, /client_name/);
    assert.doesNotMatch(selectArgs, /(?<!deposit_)amount_cents/);
    assert.doesNotMatch(selectArgs, /(?<!currency_)currency(?!_code)/);
  });

  it("joins agency_bookings via booking_talent.talent_profile_id", () => {
    assert.match(src, /from\("booking_talent"\)/);
    assert.match(src, /talent_profile_id/);
    assert.match(src, /source_inquiry_id/);
    assert.doesNotMatch(src, /\.eq\("talent_id"/);
  });

  it("keys clients by row id, never by lower-cased name (A5)", () => {
    assert.doesNotMatch(src, /name\.toLowerCase\(\)/);
    assert.match(src, /const key = row\.id/);
  });
});
