/**
 * free-plan-storefront-parity.static.test.ts
 *
 * WHAT THIS TEST DOES
 * ───────────────────
 * Owner ruling, 2026-09-24 ("sure they can through the network with their
 * own profile hub page... and if they complete their profile and they
 * activate their own custom landing page also yes"): a free-plan talent's
 * services, prices and storefront are public and bookable on every hub
 * profile template — the same access her own activated personal site
 * (Maison) already had. Before this ruling, Atelier / Light / Lumen / Noir
 * each gated `hasServices` / `hasStorefront` / `hasServiceMenu` (and, on
 * Light, `packageTeasers` / the service-menu items) behind
 * `!isFreePlan`, silencing a free talent's whole commerce section on her
 * own hub profiles.
 *
 * These are Next.js server components with a server-action / Supabase /
 * React import graph that can't render under `node:test` (same rationale
 * as `render-branch-parity.static.test.ts`, next to this file's siblings).
 * The regression this guards against — a re-added `!isFreePlan` gate on a
 * commerce line, most likely from copy-pasting an older block — is a plain
 * text property, so a source-text scan is the right tool.
 *
 * Read this test again before re-adding ANY plan gate to these four files'
 * commerce sections: it is deliberate policy, not an oversight, that none
 * exists.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const GATED_TEMPLATES = [
  "_atelier/AtelierProfileLayout.tsx",
  "_light/LightProfileLayout.tsx",
  "_lumen/LumenProfileLayout.tsx",
  "_noir/NoirProfileLayout.tsx",
] as const;

function read(rel: string): string {
  return readFileSync(path.join(HERE, rel), "utf8");
}

test("no hub-profile template gates commerce on isFreePlan any more", () => {
  for (const rel of GATED_TEMPLATES) {
    const src = read(rel);
    assert.ok(
      !src.includes("isFreePlan"),
      `${rel} still references isFreePlan — the owner's 2026-09-24 ruling removed every commerce gate on plan tier from these four templates`,
    );
  }
});

test("Maison is not touched by this ruling — it never gated commerce in the first place", () => {
  const src = read("_maison/MaisonProfileLayout.tsx");
  assert.ok(
    !src.includes("isFreePlan"),
    "MaisonProfileLayout.tsx should stay free of isFreePlan — it was already correct before this ruling and must not be edited to match it",
  );
});

test("the storefront and service-menu items are passed through unconditionally on Light", () => {
  const src = read("_light/LightProfileLayout.tsx");
  assert.ok(
    !/packageTeasers=\{[^}]*\?\s*\[\]/.test(src),
    "Light's ServicesBlock must not ternary packageTeasers to an empty array on any condition",
  );
  assert.ok(
    !/items=\{[^}]*\?\s*\[\]/.test(src),
    "Light's ServiceMenuBlock must not ternary its items to an empty array on any condition",
  );
});
