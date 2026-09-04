/**
 * The gate that caused an unbounded oversell, pinned so it cannot come back.
 *
 * Before capacity 0.3b, both halves of the stock path tested
 * `kind === "product"`:
 *   instant-book-engine.ts  — reserve
 *   offering-stock.ts       — release
 * The single live stock-carrying offering on the platform is a 12-spot course
 * with kind='package'. Neither half ever ran for it, so it never decremented
 * and could be sold without limit while the page advertised twelve.
 *
 * These tests assert the rule that replaced it: a POOL means stock, whatever
 * the kind. They are static-text guards as well as unit tests, because the
 * failure mode is a predicate quietly regaining a `kind` term.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { join } from "node:path";
import { test } from "node:test";

import { readInquiryOfferingContext, shouldReleaseStock } from "@/lib/talent/offering-stock";

const WEB_SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(WEB_SRC, rel), "utf8");

test("a seat-limited PACKAGE releases its units — the kind test is gone", () => {
  const ctx = readInquiryOfferingContext({
    offering: { offering_id: "o1", kind: "package", stock_reserved: true },
  });
  assert.equal(shouldReleaseStock(ctx), true);
});

test("a product still releases", () => {
  const ctx = readInquiryOfferingContext({
    offering: { offering_id: "o1", kind: "product", stock_reserved: true },
  });
  assert.equal(shouldReleaseStock(ctx), true);
});

test("an inquiry that never reserved is never released", () => {
  const ctx = readInquiryOfferingContext({
    offering: { offering_id: "o1", kind: "package", stock_reserved: false },
  });
  assert.equal(shouldReleaseStock(ctx), false);
});

test("a released stamp without an offering id is refused", () => {
  const ctx = readInquiryOfferingContext({ offering: { kind: "product", stock_reserved: true } });
  assert.equal(shouldReleaseStock(ctx), false);
});

test("no offering stamp at all is not a release", () => {
  assert.equal(shouldReleaseStock(readInquiryOfferingContext(null)), false);
  assert.equal(shouldReleaseStock(readInquiryOfferingContext({})), false);
});

test("the reserve gate keys on the pool, not the kind", () => {
  // REPOINTED at the purchase pipeline. `instant-book-engine.ts` was deleted in
  // 0.6b-2; the behaviour this guards moved to `createPurchase`, which asks
  // `loadOfferingCapacityPoolId` and reserves only when a pool exists. The
  // assertion is kept because the BUG it guards is still possible — gating on
  // `kind === 'product'` is what let the 12-spot course oversell.
  // Reads the WHOLE pipeline, not one file. This guard named
  // `lib/orders/purchase.ts` and went red the moment that file was split for
  // the 800-line cap — the pool resolution simply moved to a sibling. The
  // assertion below was right both before and after; only its subject moved.
  // Concatenating the directory means the next split cannot break it either,
  // and a `kind === "product"` reintroduced ANYWHERE in the pipeline is caught
  // rather than only in the file this line happened to name.
  const dir = join(WEB_SRC, "lib", "orders");
  const src = readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    // Comments BLANKED before asserting. Raw contents would redden main the
    // moment someone documents the bug — and `lib/orders/` is exactly where a
    // person explains why the gate keys on the pool, most naturally by naming
    // the predicate they are avoiding. The comment in this very test does it.
    // Worse than a false red: it could then be "fixed" by editing prose.
    // Reusing `blankComments` rather than inlining a regex because it already
    // handles a `//` inside a string literal, and two comment-strippers is the
    // duplication this phase has been removing, not adding.
    .map((f) => blankComments(readFileSync(join(dir, f), "utf8")))
    .join("\n");
  assert.ok(
    src.includes("capacity_pool_id"),
    "the pipeline must resolve a pool id rather than infer one from kind",
  );
  assert.ok(
    !src.includes('kind === "product"') && !src.includes("kind === 'product'"),
    "stock must never be gated on the offering kind",
  );
  assert.ok(
    !/offering\.kind === "product" && offering\.inventoryQty/.test(src),
    "the kind-gated reserve predicate must not come back",
  );
});

test("the storefront sold-out badge keys on the pool, not the kind", () => {
  const src = read("app/t/[profileCode]/_shared/StorefrontBody.tsx");
  assert.ok(
    !/kind === "product" && it\.inventoryQty === 0/.test(src),
    "sold-out must not be gated on kind — a package sells out too",
  );
  assert.equal(
    src.match(/it\.capacityPoolId != null && it\.inventoryQty === 0/g)?.length,
    2,
    "both the service row and the product tile must use the pool test",
  );
});

test("the quantity picker cannot offer more than the pool holds", () => {
  const src = read("app/t/[profileCode]/_shared/OfferingInstantMount.tsx");
  assert.ok(
    !/d\.kind === "product" && d\.inventoryQty != null \? Math/.test(src),
    "the quantity cap must not be gated on kind",
  );
  assert.ok(src.includes("d.capacityPoolId != null && d.inventoryQty != null"), "cap must key on the pool");
});
