import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMERCE_AUDIT } from "./commerce-audit";

/**
 * Coverage guard for commercial write auditing.
 *
 * Before 2026-09-02, exactly one of the platform's commercial write surfaces
 * recorded who changed what. Adding the calls was the easy part; keeping them
 * is the hard part, because the next person to add a price action will copy a
 * neighbouring function and the neighbour they copy might be the one that
 * forgot. So this asserts coverage structurally rather than trusting review.
 *
 * The check is deliberately COARSE — it counts exported write actions against
 * `recordCommerceAudit` calls per file, rather than parsing which action audits
 * which. A precise AST check would be more satisfying and would break on every
 * refactor; this one fails loudly on the thing that actually goes wrong, which
 * is somebody adding a write and not an audit.
 */

const WEB_ROOT = process.cwd();

/**
 * Files that write commercial state, with the number of exported actions in
 * each that MUTATE something. Read-only exports (loaders, validators, preflight
 * checks) are excluded by name below.
 */
const AUDITED_WRITE_MODULES = [
  "admin-product-pricing",
  "admin-product-features",
  "admin-product-discounts",
  "admin-subscription-discounts",
  "admin-trial-offers",
  "admin-pricing-defaults",
  "admin-plan-downgrade",
  "admin-discount-stripe-import",
];

/** Exported actions that legitimately write nothing. */
const READ_ONLY_ACTION = /^(load|get|list|search|validate|verify)/i;

function readAction(name: string): string {
  return readFileSync(
    join(WEB_ROOT, "src", "lib", "server-actions", `${name}.ts`),
    "utf8",
  );
}

function exportedActions(src: string): string[] {
  return [...src.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
}

test("every commercial write module imports from the audit module", () => {
  // Asserts on the MODULE, not on one exported name: some call sites use the
  // generic `recordCommerceAudit`, and the near-cap discount files use the
  // named per-domain wrappers. Both are audit coverage; only an absent import
  // is not.
  const missing = AUDITED_WRITE_MODULES.filter(
    (name) => !readAction(name).includes("@/lib/billing/commerce-audit"),
  );
  assert.deepEqual(
    missing,
    [],
    "These modules write commercial state without importing from " +
      "@/lib/billing/commerce-audit.",
  );
});

test("every mutating action in those modules records an audit", () => {
  const shortfalls: string[] = [];

  for (const name of AUDITED_WRITE_MODULES) {
    const src = readAction(name);
    const mutating = exportedActions(src).filter((a) => !READ_ONLY_ACTION.test(a));
    // Counts both the generic helper and the named per-domain wrappers
    // (auditDiscountCreated, auditDiscountArchived, ...) that exist so a
    // near-cap file can stay under its line budget.
    const auditCalls =
      (src.match(/recordCommerceAudit\(\{/g) ?? []).length +
      (src.match(/\bauditDiscount[A-Z]\w*\(/g) ?? []).length;

    if (auditCalls < mutating.length) {
      shortfalls.push(
        `${name}: ${mutating.length} mutating action(s) [${mutating.join(", ")}] ` +
          `but only ${auditCalls} audit call(s)`,
      );
    }
  }

  assert.deepEqual(
    shortfalls,
    [],
    "A commercial write action is not recording an audit row. Every write that " +
      "changes what a customer is charged or can access must call " +
      "recordCommerceAudit after it succeeds.",
  );
});

test("audit action keys are unique and namespaced", () => {
  const values = Object.values(COMMERCE_AUDIT);
  assert.equal(
    new Set(values).size,
    values.length,
    "two COMMERCE_AUDIT entries share an action string; the audit surface " +
      "filters on these, so collisions merge unrelated changes",
  );
  for (const v of values) {
    assert.ok(
      v.startsWith("platform.commerce."),
      `${v} is not namespaced under platform.commerce.`,
    );
  }
});

test("the audit helper never throws out of its own failure path", () => {
  // The whole body is inside try/catch and every failure is logged rather than
  // returned. If this stops being true, an audit outage becomes a commerce
  // outage: the operator's price change fails because the LOG failed.
  const src = readFileSync(join(WEB_ROOT, "src", "lib", "billing", "commerce-audit.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function recordCommerceAudit"));
  assert.ok(body.includes("try {"), "recordCommerceAudit must wrap its work in try/catch");
  assert.ok(body.includes("} catch (err) {"), "recordCommerceAudit must catch");
  assert.ok(
    !/\bthrow\b/.test(body),
    "recordCommerceAudit must not throw — see the module header",
  );
});

test("routine commerce writes default to info, not warn", () => {
  // platform_audit_log is 1189 info rows across 40 actions and 6 warn rows
  // across 4. `warn` is the only useful filter on this table, and routing all
  // 26 commerce write actions into it does not raise the alarm, it retires it.
  //
  // Asserted against the source because recordCommerceAudit builds its own
  // service client and cannot be called without one. A static read is weaker
  // than an injected fake, and it is what this module currently allows.
  const src = readFileSync(
    new URL("./commerce-audit.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /severity:\s*entry\.severity\s*\?\?\s*"info"/,
    "the default severity must be info",
  );
  assert.doesNotMatch(
    src,
    /severity:\s*entry\.severity\s*\?\?\s*"warn"/,
    "defaulting to warn floods the only tier anyone filters on",
  );
});

test("an explicit severity from the caller still wins", () => {
  // The Stripe import already distinguishes them: warn when rows actually
  // moved, info when nothing did. The default must not override that.
  const src = readFileSync(
    new URL("./commerce-audit.ts", import.meta.url),
    "utf8",
  );
  assert.match(src, /severity:\s*args\.imported > 0/);
});
