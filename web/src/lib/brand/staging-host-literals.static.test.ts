import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// TUL-1843 / TUL-1845: these files build public URLs and must derive the root
// domain from env (lib/brand/public-root-domain), never from a literal.
const FILES = [
  "src/components/home/hub-landing.tsx",
  "src/components/home/hub-agency-list.tsx",
  "src/lib/talent/agency-roster-profile-url.ts",
  "src/lib/talent/load-representation.ts",
  "src/lib/talent/public-profile-href.ts",
  "src/components/admin/shell/internal/talent-drawers/representation.tsx",
  "src/app/(workspace)/talent/discover/page.tsx",
  "src/app/(workspace)/[tenantSlug]/admin/roster/[id]/TalentEditForm.tsx",
  "src/app/(workspace)/[tenantSlug]/talent/settings/payouts/actions.ts",
];

const LITERAL = /https?:\/\/(?:\$\{[^}]+\}|[a-z0-9-]+)\.tulala\.digital|["'`]https:\/\/(?:app\.)?tulala\.digital/;

for (const rel of FILES) {
  test(`${rel} has no tulala.digital URL literal`, () => {
    const src = readFileSync(path.join(process.cwd(), rel), "utf8");
    const code = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    const hit = LITERAL.exec(code);
    // CANONICAL_PROFILE_ORIGIN is the one retained constant (public-profile-href), exported for back-compat.
    const allowed = rel.endsWith("public-profile-href.ts") && hit?.[0].includes("https://tulala.digital");
    assert.ok(!hit || allowed, `literal found: ${hit?.[0]}`);
  });
}

test("payouts localhost fallback uses getAppUrl()", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/settings/payouts/actions.ts"), "utf8");
  assert.match(src, /origin = getAppUrl\(\)/);
});

test("ES representation block has no leftover English product words", () => {
  const es = JSON.parse(readFileSync(path.join(process.cwd(), "messages/es.json"), "utf8")) as Record<string, unknown>;
  const block = (es as { dashboard?: { talentDrawers?: { representation?: Record<string, string> } } }).dashboard?.talentDrawers?.representation ?? {};
  const rep = Object.values(block).join("\n");
  assert.ok(rep.length > 100, "representation block found");
  for (const word of ["AGENCY", "clients", "Profile", "Directory", "La agency"]) {
    assert.ok(!rep.includes(word), `ES still contains "${word}"`);
  }
  assert.ok("selfPageName" in block);
});
