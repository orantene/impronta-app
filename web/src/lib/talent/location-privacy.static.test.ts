/**
 * Privacy guard for the talent's exact address (`talent_location_settings.
 * exact_address`). Only the owner's dashboard, the settings module, the loader
 * and the location renderer may name it. Anything else (JSON-LD, sitemap, page
 * data, the public booking APIs, the embed) naming it is a leak waiting to
 * happen, so this list is closed: a new reader must be added here on purpose.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

const SRC = join(process.cwd(), "src");

const ALLOWED = new Set(
  [
    "lib/talent/location-settings.ts",
    "lib/talent/location-settings-actions.ts",
    "components/talent/services/LocationSettingsCard.tsx",
    "lib/site-admin/builder-node/location-block.tsx",
    "lib/site-admin/builder-node/visit-sources.ts",
    // Parameter name only: the confirmation body takes an address its caller
    // already holds (today always null). Not a reader of the settings table.
    "lib/messaging/appointment-confirmed.ts",
    // The one place the private address is released: the confirmation message,
    // and only for "exact after booking" (see confirmation-address.test.ts).
    "lib/messaging/confirmation-address.ts",
    // Demo seeding only: always WRITES exact_address as null for is_demo talents
    // (guarded by assertDemoTarget); never reads or returns a private address.
    "lib/talent-site/demos/location.ts",
    // Comment only: documents that the Gridline area card never reads exactAddress.
    "lib/site-admin/builder-node/area-block.tsx",
  ].map((p) => p.split("/").join(sep)),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("only the allow-listed files name the private address", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    if (ALLOWED.has(rel)) continue;
    if (/exact_address|exactAddress/.test(readFileSync(file, "utf8"))) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "a new reader of the exact address must be reviewed and added to ALLOWED");
});

test("the loader reaches the address only through toPublicLocation", () => {
  const src = readFileSync(join(SRC, "lib/site-admin/builder-node/visit-sources.ts"), "utf8");
  assert.match(src, /toPublicLocation\(locationSettings/);
  // The parsed settings object (which holds the address) is never returned or spread.
  assert.doesNotMatch(src, /return \{[^}]*locationSettings/);
  assert.doesNotMatch(src, /\.\.\.locationSettings/);
});

test("SEO, JSON-LD, sitemap and public APIs never import the location settings", () => {
  const risky = walk(SRC).filter((f) => /seo|json-ld|sitemap|robots|\/api\/public\//.test(f.split(sep).join("/")));
  assert.ok(risky.length > 0);
  for (const file of risky) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /location-settings|talent_location_settings/, relative(SRC, file));
  }
});

test("the table is never read with a browser (anon or session) client", () => {
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes('.from("talent_location_settings")')) continue;
    assert.doesNotMatch(src, /createClient\(|createServerClient\(|createBrowserClient\(/, relative(SRC, file));
    if (!src.includes("admin: SupabaseClient")) {
      assert.match(src, /createServiceRoleClient/, `${relative(SRC, file)} must use the service role`);
    }
  }
});
