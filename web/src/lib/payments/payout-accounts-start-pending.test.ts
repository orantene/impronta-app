import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * PM decision 2026-10-21: a manually added payout account starts as 'pending_verification', never
 * 'connected', so nobody becomes payout-eligible with no bank info. Receiver logic reads only
 * status = 'connected', so a pending account is ignored until something verifies it.
 */
const SRC = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** Every `payout_accounts` insert in these files (the four manual-account creators). */
const INSERT_SITES: Array<{ file: string; inserts: number }> = [
  { file: "lib/payments/talent-payout-connect.ts", inserts: 1 },
  { file: "app/(workspace)/[tenantSlug]/admin/work/[id]/actions.ts", inserts: 1 },
  { file: "app/(workspace)/[tenantSlug]/admin/account/payout-account-actions.ts", inserts: 2 },
];

function insertBlocks(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf('from("payout_accounts")');
  while (at >= 0) {
    const ins = src.indexOf(".insert({", at);
    const next = src.indexOf('from("payout_accounts")', at + 1);
    if (ins >= 0 && (next < 0 || ins < next)) out.push(src.slice(ins, src.indexOf("});", ins)));
    at = next;
  }
  return out;
}

describe("manual payout accounts start pending", () => {
  for (const { file, inserts } of INSERT_SITES) {
    it(`${file}: ${inserts} insert(s), all pending_verification with no connected_at`, () => {
      const blocks = insertBlocks(read(file));
      assert.equal(blocks.length, inserts);
      for (const b of blocks) {
        assert.match(b, /status: "pending_verification"/);
        assert.ok(!b.includes('status: "connected"'));
        assert.ok(!b.includes("connected_at"));
        assert.match(b, /provider: "manual_bank"/);
      }
    });
  }
});

describe("the payout receiver ignores pending accounts", () => {
  it("the candidate list for a booking reads only connected accounts", () => {
    const src = read("lib/bookings/transactions.ts");
    const at = src.indexOf('.from("payout_accounts")');
    assert.ok(at > 0);
    assert.match(src.slice(at, at + 300), /\.eq\("status", "connected"\)/);
  });

  it("link-payout-receiver and its talent-own fallback read only connected accounts", () => {
    for (const f of ["lib/payments/link-payout-receiver.ts", "lib/payments/link-payout-receiver-talent-own.ts"]) {
      const src = read(f);
      const at = src.indexOf('.from("payout_accounts")');
      assert.ok(at > 0, f);
      assert.match(src.slice(at, at + 400), /\.eq\("status", "connected"\)/, f);
    }
  });
});

describe("the copy says pending, not connected", () => {
  it("talent and workspace creators tell the person the account is pending", () => {
    assert.match(read("app/(workspace)/[tenantSlug]/talent/settings/actions.ts"), /Payout account added\. It stays pending/);
    assert.match(read("app/(workspace)/[tenantSlug]/admin/work/[id]/actions.ts"), /Workspace payout account created\. It stays pending/);
    assert.match(read("app/(workspace)/[tenantSlug]/admin/account/payout-account-actions.ts"), /Your payout account was added\. It stays pending/);
  });
});
