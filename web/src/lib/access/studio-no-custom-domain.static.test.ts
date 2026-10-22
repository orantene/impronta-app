import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PLAN_LIMITS } from "./plan-limits";
import { customDomainEligible } from "@/lib/saas/workspace-public-url";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("Studio is not custom-domain eligible and its limit row agrees", () => {
  assert.equal(customDomainEligible("studio"), false);
  assert.equal(PLAN_LIMITS.studio.max_custom_domains, 0);
  for (const plan of ["website", "agency", "network", "legacy"] as const) {
    assert.equal(customDomainEligible(plan), true, plan);
  }
});

test("no message bundle sells a custom domain on the Studio upgrade", () => {
  for (const file of ["../../../messages/en.json", "../../../messages/es.json"]) {
    const json = JSON.parse(read(file)) as Record<string, unknown>;
    const celebration = findKey(json, "upgradeCelebration") as { unlocks?: { studio?: Record<string, string> } } | undefined;
    assert.ok(celebration?.unlocks?.studio, `${file} studio unlocks`);
    assert.equal("customDomain" in celebration.unlocks.studio, false, file);
  }
});

test("copy never calls the custom domain Agency-only", () => {
  for (const file of ["../../../messages/en.json", "../../../messages/es.json"]) {
    const raw = read(file);
    assert.doesNotMatch(raw, /custom domain \(Agency\)|dominio propio \(Agency\)/, file);
    assert.doesNotMatch(raw, /own domain is part of the Agency plan|propio dominio es parte del plan Agency/, file);
  }
});

function findKey(node: unknown, key: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const hit = findKey(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
