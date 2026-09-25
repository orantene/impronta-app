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
  const mergeSrc = readFileSync(join(here, "clients-merge.ts"), "utf8");

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

  it("keys clients by inquiry or bare booking id, never by lower-cased name (A5)", () => {
    assert.doesNotMatch(src, /name\.toLowerCase\(\)/);
    assert.doesNotMatch(mergeSrc, /name\.toLowerCase\(\)/);
    assert.match(mergeSrc, /function clientMergeKey/);
    assert.match(mergeSrc, /inquiry:\$\{opts\.inquiryId\}/);
  });

  it("does not accumulate visits from talent_bookings mirrors", () => {
    // Shared-PK create-slot mirrors would otherwise list each name twice
    // (Nothing owed + MXN amount) or double visit counts.
    assert.match(src, /accumulateVisit:\s*false/);
    assert.match(src, /accumulateVisit:\s*true/);
  });

  it("does not re-export types without from (use-server SWC trap)", () => {
    // `export type { X }` of a locally-imported type makes Next emit a
    // runtime reference → RSC 500 / Admin boot pageerror. Keep the type in
    // clients-merge; consumers import it from there.
    assert.doesNotMatch(src, /^export\s+type\s+\{/m);
  });
});
