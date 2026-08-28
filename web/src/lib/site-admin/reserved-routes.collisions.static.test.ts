/**
 * Tripwire: the reserved-slug registry must cover every root segment that
 * actually resolves on a tenant host.
 *
 * Once builder pages serve at `/<slug>` instead of `/p/<slug>`, a page slug
 * and a platform route share one namespace. The allow-list wins that race, so
 * an uncovered collision is not a conflict the operator can see — it is a page
 * they can create, publish and link, that silently opens something else.
 *
 * This test does NOT restate the list. It walks the real route tree under
 * `src/app`, asks the real surface allow-list which of those segments resolve
 * on an agency host, and asserts the registry covers them. Add a route, and
 * this fails until the word is reserved.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  PLATFORM_RESERVED_SLUGS,
  PLATFORM_LOCALE_SLUGS,
  isReservedSlug,
  reservedSlugMessage,
} from "./reserved-routes";
import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";
import { STATIC_LOCALES, localeMetadata } from "@/i18n/config";

const APP_DIR = join(process.cwd(), "src", "app");

/**
 * Top-level URL segments the App Router can serve. Route groups `(name)` are
 * transparent, so their children are top-level too; `@slot`, `[dynamic]` and
 * private `_folders` never own a literal first segment.
 */
function topLevelRouteSegments(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("(") && entry.endsWith(")")) {
      out.push(...topLevelRouteSegments(full));
      continue;
    }
    if (entry.startsWith("@") || entry.startsWith("[") || entry.startsWith("_")) {
      continue;
    }
    out.push(entry);
  }
  return [...new Set(out)].sort();
}

test("every route segment reachable on a tenant host is reserved", () => {
  const segments = topLevelRouteSegments(APP_DIR);
  assert.ok(segments.length > 10, "route-tree walk found suspiciously few segments");

  const colliding = segments.filter((segment) =>
    isPathAllowedForHostKind("agency", `/${segment}`),
  );
  assert.ok(colliding.length > 5, "allow-list probe found suspiciously few collisions");

  const missing = colliding.filter((segment) => !isReservedSlug(segment));
  assert.deepEqual(
    missing,
    [],
    `These root routes resolve on a tenant host but are not reserved, so a CMS page with the same slug would be unreachable: ${missing.join(", ")}. Add them to PLATFORM_RESERVED_SLUGS and mirror them into public.platform_reserved_slugs.`,
  );
});

test("every platform locale code is reserved", () => {
  const codes = [...STATIC_LOCALES, ...Object.keys(localeMetadata)].map((c) =>
    c.toLowerCase(),
  );
  for (const code of codes) {
    assert.equal(
      isReservedSlug(code),
      true,
      `locale "${code}" is a URL prefix and must be reserved`,
    );
  }
  // The derived export must stay in sync with what the registry actually holds.
  for (const code of PLATFORM_LOCALE_SLUGS) {
    assert.ok(
      (PLATFORM_RESERVED_SLUGS as readonly string[]).includes(code),
      `PLATFORM_LOCALE_SLUGS contains "${code}" but the registry does not`,
    );
  }
});

test("the words the clean-URL move made dangerous are reserved", () => {
  // The explicit minimum from the work order. Kept as a literal list on
  // purpose: the derivation above could go quiet if the allow-list changed
  // shape, and these must never stop being reserved.
  for (const word of [
    "directory",
    "login",
    "register",
    "claim",
    "join",
    "talent",
    "client",
    "p",
    "es",
  ]) {
    assert.equal(isReservedSlug(word), true, `"${word}" must be reserved`);
  }
});

test("registry has no duplicate entries", () => {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const slug of PLATFORM_RESERVED_SLUGS) {
    if (seen.has(slug)) dupes.push(slug);
    seen.add(slug);
  }
  assert.deepEqual(dupes, []);
});

test("tenant-ownable slugs stay ownable", () => {
  // `/contact` was deliberately removed from the storefront allow-list so a
  // tenant can own it as a CMS page. Reserving it would undo that decision.
  for (const word of ["contact", "about", "services", "work", "team", "faq"]) {
    assert.equal(isReservedSlug(word), false, `"${word}" must stay tenant-ownable`);
  }
});

test("layer 1 (registry) and layer 2 (DB seed) hold the same words", () => {
  // Layer 2 is a table seeded by migrations. Code and DB drifting apart is the
  // whole failure mode the 3-layer design exists to prevent, and nothing else
  // in CI can see the SQL, so read it here.
  const migrationsDir = join(process.cwd(), "..", "supabase", "migrations");
  const seeded = new Set<string>();
  for (const file of readdirSync(migrationsDir)) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    if (!sql.includes("platform_reserved_slugs")) continue;
    for (const match of sql.matchAll(/^\s*\('([^']+)',/gm)) {
      seeded.add(match[1]!);
    }
  }
  assert.ok(seeded.size > 10, "found no platform_reserved_slugs seed rows");

  const missingFromDb = PLATFORM_RESERVED_SLUGS.filter(
    (slug) => !seeded.has(slug),
  );
  assert.deepEqual(
    missingFromDb,
    [],
    `Reserved in code but never mirrored into public.platform_reserved_slugs: ${missingFromDb.join(", ")}. Add them in a migration.`,
  );
});

test("the creation-time error names the word and a usable alternative", () => {
  const message = reservedSlugMessage("login");
  assert.match(message, /"login"/);
  assert.match(message, /login-page/);
  // The suggestion must itself be creatable.
  assert.equal(isReservedSlug("login-page"), false);
});
