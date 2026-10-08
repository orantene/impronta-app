/**
 * TUL-284: every Stripe charge creator either runs the seller-currency guard
 * before touching Stripe, or is on an explicit allow-list with a reason. A new
 * creator that is on neither list fails here. Floors keep the scan from passing
 * vacuously; the synthetic cases prove the classifier itself can fail.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/payments/checkout-currency-guard.static.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

/** Charge creators that run `checkTransactionChargeCurrency` before Stripe. */
export const GUARDED_CREATORS: ReadonlySet<string> = new Set([
  "src/lib/payments/stripe-checkout.ts",
  "src/lib/payments/stripe-payment-intent.ts",
  "src/lib/payments/stripe-terminal.ts",
]);

/** Creators with no seller currency to compare against. One reason each. */
export const ALLOW_LIST: Readonly<Record<string, string>> = {
  "src/lib/stripe/talent-billing.ts": "talent plan subscription: the platform bills the talent in a fixed Stripe price, no seller",
  "src/lib/stripe/workspace-billing.ts": "workspace plan subscription: the platform bills the workspace in a fixed Stripe price, no seller",
  "src/lib/stripe/client-billing.ts": "Discover client subscription, verification fee and top-up: platform products priced in USD, no seller",
  "src/lib/stripe/talent-domain-billing.ts": "domain registration resale: platform product priced in USD, no seller",
};

const CREATOR_RE =
  /(?:checkout\.sessions|paymentIntents|paymentLinks)\.create\(|api\.stripe\.com\/v1\/(?:payment_intents|checkout\/sessions|payment_links)/;
const GUARD_CALL = "checkTransactionChargeCurrency";
const GUARD_CALL_RE = /(?:guardFn|checkTransactionChargeCurrency)\(/;

/** Comments may mention a creator (docs do); only code counts. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|static\.test|render\.test)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Problems for one file that contains a Stripe charge creator; empty = fine. */
export function classifyCreator(
  rel: string,
  src: string,
  guarded: ReadonlySet<string>,
  allow: Readonly<Record<string, string>>,
): string[] {
  src = stripComments(src);
  const creator = src.search(CREATOR_RE);
  if (creator < 0) return [];
  if (allow[rel]) return allow[rel].trim().length > 0 ? [] : [`${rel}: allow-list reason is empty`];
  if (!guarded.has(rel)) return [`${rel}: Stripe charge creator is neither guarded nor allow-listed`];
  const call = src.search(GUARD_CALL_RE);
  if (call < 0) return [`${rel}: guarded creator never calls ${GUARD_CALL}`];
  if (call > creator) return [`${rel}: the guard runs AFTER the Stripe creator`];
  return [];
}

const FOUND = sourceFiles(join(WEB_ROOT, "src"))
  .map((f) => ({ rel: relative(WEB_ROOT, f), src: readFileSync(f, "utf8") }))
  .filter((f) => CREATOR_RE.test(stripComments(f.src)));

describe("every Stripe charge creator is guarded or allow-listed", () => {
  it("floors: the scan sees the creators it should", () => {
    assert.ok(FOUND.length >= 7, `expected at least 7 creator files, found ${FOUND.length}`);
    for (const f of GUARDED_CREATORS) assert.ok(FOUND.some((x) => x.rel === f), `${f} no longer contains a creator`);
    for (const f of Object.keys(ALLOW_LIST)) assert.ok(FOUND.some((x) => x.rel === f), `${f} is allow-listed but has no creator (stale)`);
    assert.ok(GUARDED_CREATORS.size >= 3 && Object.keys(ALLOW_LIST).length >= 4);
  });
  it("each creator file is guarded before Stripe or allow-listed with a reason", () => {
    const problems = FOUND.flatMap((f) => classifyCreator(f.rel, f.src, GUARDED_CREATORS, ALLOW_LIST));
    assert.deepEqual(problems, []);
  });
  it("a guarded creator is never both guarded and allow-listed", () => {
    for (const f of GUARDED_CREATORS) assert.equal(ALLOW_LIST[f], undefined);
  });
  it("callers of the two choke points cannot bypass them: no source file but the creators mentions currencyGuard", () => {
    const mention = sourceFiles(join(WEB_ROOT, "src"))
      .map((f) => ({ rel: relative(WEB_ROOT, f), src: readFileSync(f, "utf8") }))
      .filter((f) => /currencyGuard/.test(f.src) && !f.rel.endsWith("stripe-collection.ts"))
      .map((f) => f.rel)
      .sort();
    assert.deepEqual(mention, [
      "src/lib/payments/stripe-checkout.ts",
      "src/lib/payments/stripe-payment-intent.ts",
      "src/lib/payments/stripe-terminal.ts",
    ]);
  });
  it("the no-inquiry entry points still go through the guarded Checkout creator", () => {
    const callers = [
      "src/lib/server-actions/instant-book-action.ts",
      "src/app/(public)/_events/ticket-picker-actions.ts",
      "src/lib/storefront/cart-checkout.server.ts",
      "src/lib/storefront/class-timetable.server.ts",
      "src/lib/storefront/package-selector.server.ts",
      "src/lib/storefront/appointment-picker.server.ts",
      "src/lib/payments/link-checkout.ts",
      "src/lib/server-actions/client-pipeline.ts",
      "src/lib/payments/stripe-collection.ts",
    ];
    for (const rel of callers) {
      const src = readFileSync(join(WEB_ROOT, rel), "utf8");
      assert.match(src, /createCheckoutSessionForTransaction/, `${rel} no longer uses the guarded creator`);
      assert.doesNotMatch(src, /checkout\.sessions\.create\(/, `${rel} creates a session directly`);
    }
  });
  it("the rule is priced-thing currency plus lane support, not the seller default_currency", () => {
    const src = stripComments(readFileSync(join(WEB_ROOT, "src/lib/payments/seller-currency-guard.ts"), "utf8"));
    assert.match(src, /us: \["USD"\]/);
    assert.match(src, /mx: \["MXN", "USD"\]/);
    assert.match(src, /select\("currency"\)/);
    assert.match(src, /stripe_account_platform/);
    assert.doesNotMatch(src, /select\("default_currency"\)/);
  });
  it("the storefront cart takes the workspace currency, not a hard-coded USD", () => {
    const src = stripComments(readFileSync(join(WEB_ROOT, "src/lib/storefront/cart-checkout.core.ts"), "utf8"));
    assert.match(src, /workspaceCartCurrency\(deps, input\.tenantId\)/);
    assert.doesNotMatch(src, /currency: "USD",\s*\n\s*version: 1/);
  });
  it("the Stripe creators call the guard in charge position (before their Stripe call)", () => {
    for (const rel of GUARDED_CREATORS) {
      const src = readFileSync(join(WEB_ROOT, rel), "utf8");
      assert.match(src, /checkTransactionChargeCurrency/);
      assert.match(src, /createServiceRoleClient\(\)/);
    }
  });
});

describe("classifier self-tests (it can fail)", () => {
  const guarded = new Set(["g.ts"]);
  const allow = { "a.ts": "platform product" };
  it("flags an unlisted creator", () => {
    assert.equal(classifyCreator("x.ts", "await stripe.checkout.sessions.create(p)", guarded, allow).length, 1);
    assert.equal(classifyCreator("x.ts", "fetch('https://api.stripe.com/v1/payment_intents')", guarded, allow).length, 1);
    assert.equal(classifyCreator("x.ts", "stripe.paymentLinks.create(p)", guarded, allow).length, 1);
  });
  it("flags a guarded creator with no guard call, or a guard after the creator", () => {
    assert.equal(classifyCreator("g.ts", "stripe.paymentIntents.create(p)", guarded, allow).length, 1);
    assert.equal(
      classifyCreator("g.ts", "stripe.paymentIntents.create(p); checkTransactionChargeCurrency(sb, i)", guarded, allow).length,
      1,
    );
  });
  it("passes a guarded creator whose guard comes first, and an allow-listed one", () => {
    assert.deepEqual(
      classifyCreator("g.ts", "checkTransactionChargeCurrency(sb, i); stripe.paymentIntents.create(p)", guarded, allow),
      [],
    );
    assert.deepEqual(classifyCreator("a.ts", "stripe.checkout.sessions.create(p)", guarded, allow), []);
  });
  it("flags an allow-list entry with an empty reason, ignores files with no creator", () => {
    assert.equal(classifyCreator("a.ts", "stripe.checkout.sessions.create(p)", guarded, { "a.ts": " " }).length, 1);
    assert.deepEqual(classifyCreator("z.ts", "const x = 1", guarded, allow), []);
  });
});
