import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * single-discount-store.static.test.ts — the guard that keeps the consolidation
 * consolidated.
 *
 * THE BUG CLASS: for months this repo had TWO discount systems that could not
 * see each other. One wrote Stripe coupons with no database row (so `?promo=`
 * answered "Code not found" for codes that were live and redeemable); the other
 * wrote the database and mirrored to Stripe. Nothing structural stopped a third
 * from appearing — writing a coupon takes one `stripe.coupons.create` call
 * anywhere in the tree, and the reviewer of that diff has no way to know it is
 * the beginning of a parallel system.
 *
 * So the rules are stated as assertions instead of as good intentions:
 *
 *   1. Coupons and promotion codes are MINTED in exactly two libraries — the
 *      code-discount sync and the account-discount sync. One store each.
 *   2. The deleted Stripe-only discount path must not come back.
 *   3. Writes to `product_discounts` / `subscription_discounts` happen only in
 *      the sanctioned action files, so every write goes through the validation,
 *      the gate, and the revalidation that live there.
 *
 * A grep guard is crude. It is also the only thing that would have failed on
 * the day the second system was born.
 */

const SRC = resolve(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC);

function grep(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of FILES) {
    if (pattern.test(readFileSync(file, "utf8"))) {
      hits.push(relative(SRC, file).split("\\").join("/"));
    }
  }
  return hits.sort();
}

/**
 * Tests are allowed to name the APIs they assert about, and the generated
 * Supabase types name every table and RPC in the database by definition.
 */
function withoutTests(paths: string[]): string[] {
  return paths.filter(
    (p) => !/\.test\.tsx?$/.test(p) && p !== "lib/supabase/database.types.ts",
  );
}

test("Stripe coupons are minted in exactly two libraries", () => {
  const hits = withoutTests(grep(/stripe\.coupons\.create\(/));
  assert.deepEqual(hits, [
    "lib/billing/subscription-discounts.ts",
    "lib/pricing/stripe-discount-sync.ts",
  ]);
});

test("promotion codes are minted only by the code-discount sync", () => {
  const hits = withoutTests(grep(/stripe\.promotionCodes\.create\(/));
  assert.deepEqual(hits, ["lib/pricing/stripe-discount-sync.ts"]);
  // An account discount is a PRIVATE coupon. The moment it gains a promotion
  // code it becomes a string anyone can type, which is the opposite of what it
  // is for.
  const accountSync = readFileSync(
    join(SRC, "lib/billing/subscription-discounts.ts"),
    "utf8",
  );
  assert.equal(
    /promotionCodes\.create\(/.test(accountSync),
    false,
    "account discounts must never mint a typeable code",
  );
});

test("the Stripe-only discount-codes path stays deleted", () => {
  const dead = join(
    SRC,
    "app/(workspace)/platform/admin/billing/discount-codes",
  );
  assert.equal(
    existsSync(dead),
    false,
    "billing/discount-codes was the second discount store; it was imported into product_discounts and removed",
  );
  const legacy = join(
    SRC,
    "app/(workspace)/platform/admin/commerce/discounts/legacy-codes",
  );
  assert.equal(existsSync(legacy), false, "the moved legacy shell is gone too");
});

test("product_discounts is written only where discounts are validated", () => {
  // `.from("product_discounts")` followed anywhere later by a write verb. The
  // read-only loaders (`get-product-catalog`, the checkout resolver) do not
  // match, which is the point: reads are free, writes are governed.
  const writers = withoutTests(
    grep(
      /from\("product_discounts"\)[\s\S]{0,400}?\.(insert|update|upsert|delete)\(/,
    ),
  );
  assert.deepEqual(writers, [
    // The edit write. It sits in a library rather than beside the other
    // mutations for two mechanical reasons — the action file is at its
    // 800-line cap, and its raw `.from()` calls are grandfathered BY COUNT in
    // the eslint suppressions, so new ones there break the ratchet for
    // everyone. Sanctioned only because it is unreachable except through the
    // gated action, which the next assertion pins.
    "lib/billing/discount-edit.ts",
    // Split out of `admin-product-discounts.ts` on 2026-09-02, when adding
    // audit coverage to that file's four write actions pushed it past its
    // 800-line cap. It is the SAME write surface, in a second file, still
    // behind `requirePlatformAdmin` — not a rival store. The next assertion
    // pins that its gate runs before it writes.
    "lib/server-actions/admin-discount-stripe-import.ts",
    "lib/server-actions/admin-product-discounts.ts",
  ]);
});

test("the discount-edit library has exactly one caller, and it is gated", () => {
  // Moving a write out of a "use server" file moves it out of that file's gate
  // too. What keeps the move honest is that nothing else may import it: one
  // caller, and that caller runs `requirePlatformAdmin` before delegating.
  const importers = withoutTests(grep(/from "@\/lib\/billing\/discount-edit"/));
  assert.deepEqual(importers, ["lib/server-actions/admin-product-discounts.ts"]);

  const action = readFileSync(
    join(SRC, "lib/server-actions/admin-product-discounts.ts"),
    "utf8",
  );
  const updateFn = action.slice(action.indexOf("export async function updateDiscount("));
  const gateAt = updateFn.indexOf("requirePlatformAdmin()");
  const callAt = updateFn.indexOf("applyDiscountEdit(");
  assert.ok(gateAt !== -1, "updateDiscount must gate on requirePlatformAdmin");
  assert.ok(
    callAt !== -1 && gateAt < callAt,
    "the admin gate must run BEFORE the edit is applied",
  );
});

test("the Stripe importer gates before it writes", () => {
  // The importer moved into its own file, which moved it out of the original
  // file's gate. Same standard as the discount-edit library above: the gate
  // must run before any write, in the file that now owns the write.
  const src = readFileSync(
    join(SRC, "lib/server-actions/admin-discount-stripe-import.ts"),
    "utf8",
  );
  const fn = src.slice(src.indexOf("export async function importStripePromotionCodes("));
  const gateAt = fn.indexOf("requirePlatformAdmin()");
  const writeAt = fn.search(/from\("product_discounts"\)[\s\S]{0,400}?\.(insert|update|upsert)\(/);
  assert.ok(gateAt !== -1, "importStripePromotionCodes must gate on requirePlatformAdmin");
  assert.ok(
    writeAt === -1 || gateAt < writeAt,
    "the admin gate must run BEFORE any product_discounts write",
  );
});

test("subscription_discounts is written only by its own library and actions", () => {
  const writers = withoutTests(
    grep(
      /from\("subscription_discounts"\)[\s\S]{0,400}?\.(insert|update|upsert|delete)\(/,
    ),
  );
  assert.deepEqual(writers, [
    // `reconcileAppliedDiscount` — the webhook's read-back, which stamps a
    // grant made BEFORE the account subscribed. It belongs with the Stripe
    // half, not with the admin form.
    "lib/billing/subscription-discounts.ts",
    "lib/server-actions/admin-subscription-discounts.ts",
  ]);
});

test("redemptions are counted through the RPC, never by hand", () => {
  // `redemption_count` used to be a column nothing wrote. It is now written in
  // ONE place — inside the `record_discount_redemption` RPC, whose UNIQUE(stripe_event_id)
  // is what makes a webhook replay a no-op. An app-side increment would not have
  // that protection and would double-count on every Stripe retry.
  const writers = withoutTests(
    grep(/from\("discount_redemptions"\)[\s\S]{0,400}?\.(insert|update|upsert)\(/),
  );
  assert.deepEqual(writers, []);
  const callers = withoutTests(grep(/record_discount_redemption/));
  // ONE caller is the invariant here; WHICH file holds it is incidental and is
  // allowed to move. If this fails only because the module was renamed or
  // extracted, update the name below — do not add a second caller. (A guard
  // that pins a path rather than a shape is how a clean refactor reddens main.)
  assert.equal(
    callers.length,
    1,
    `record_discount_redemption must have exactly one caller, found: ${callers.join(", ")}`,
  );
  assert.deepEqual(callers, ["lib/billing/record-discount-redemption.ts"]);
});
