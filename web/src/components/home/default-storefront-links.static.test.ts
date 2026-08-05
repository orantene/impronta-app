import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M2 guard — the default storefront's "Our talent" grid must be clickable.
 *
 * `DefaultStorefrontBody` is what a tenant's public page renders before any CMS
 * composition is published (and it is exactly what a brand-new workspace showed
 * during the stranger-signup rehearsal). Its cards rendered a name, a photo and
 * a type/city line inside a bare `<li>` — no anchor anywhere — so a visitor
 * could not open a single profile from the storefront.
 *
 * Source-text (not render) so it stays dependency-free in the tsx --test lane:
 * the component is an async server component that reaches Supabase + request
 * headers, which no unit lane can mount.
 */

const here = dirname(fileURLToPath(import.meta.url));
const bodySrc = readFileSync(join(here, "default-storefront-body.tsx"), "utf8");
const rosterSrc = readFileSync(
  join(here, "..", "..", "lib", "home", "default-storefront-roster.ts"),
  "utf8",
);

test("the roster reader carries the profile code the /t route needs", () => {
  assert.match(
    rosterSrc,
    /profileCode: string \| null;/,
    "DefaultStorefrontTalent must expose profileCode",
  );
  assert.match(
    rosterSrc,
    /^\s*profile_code,\s*$/m,
    "ROSTER_SELECT must project talent_profiles.profile_code",
  );
  assert.match(
    rosterSrc,
    /profileCode: p\.profile_code/,
    "mapRosterRows must emit profileCode",
  );
});

test("storefront talent cards render as links to /t/<profileCode>", () => {
  assert.match(
    bodySrc,
    /`\/t\/\$\{encodeURIComponent\(code\)\}`/,
    "cards must target the canonical /t/<profileCode> profile route",
  );
  assert.ok(
    bodySrc.includes("prefixPublicHref("),
    "hrefs must be prefixed for path-hosted tenants (tulala.digital/w/<slug>)",
  );
  assert.ok(
    bodySrc.includes("withLocalePath("),
    "hrefs must carry the request locale prefix",
  );
  assert.ok(
    /<Link href=\{href\}/.test(bodySrc),
    "the default card wrapper must be a next/link anchor",
  );
});

test("storefront cards honor the tenant-wide profile-popup ceiling", () => {
  assert.ok(
    bodySrc.includes("resolveCardDesign("),
    "the grid must read the tenant CardDesign to see the popup ceiling",
  );
  assert.ok(
    /profilePopup === "off"/.test(bodySrc),
    "popup 'off' is a tenant-wide CEILING the storefront must respect",
  );
  assert.ok(
    /<a href=\{href\}/.test(bodySrc),
    "popup 'off' must fall back to a plain anchor (full-page load defeats the " +
      "@modal/(.)t intercepting route)",
  );
});
