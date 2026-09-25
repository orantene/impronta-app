/**
 * Guards the vanity Max SSR crash class that survived #2272:
 * passing a function (`jumpSlug`) from the server `render.tsx` path into the
 * `services_catalog` client island. RSC refuses to serialize functions → HTTP
 * 500 + `__next_error__` on book-jorgelina even when the island no longer
 * value-imports `app/t/[profileCode]`.
 *
 * Also freezes remaining catalog-island imports of the hub route folder and
 * of `"use server"` instant-book-action (types must come from client-safe
 * modules).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, "../../..");

function read(rel: string): string {
  return readFileSync(join(WEB_SRC, rel), "utf8");
}

test("services_catalog island receives nodeId, never a jumpSlug function prop", () => {
  const renderSrc = read("lib/site-admin/builder-node/render.tsx");
  const filterSrc = read("lib/site-admin/builder-node/services-catalog-filter.tsx");

  // The server renderer must not invent a function to pass across the boundary.
  assert.doesNotMatch(
    renderSrc,
    /jumpSlug\s*=/,
    "render.tsx must not pass jumpSlug into the catalog island",
  );
  assert.match(
    renderSrc,
    /nodeId=\{node\.id\}/,
    "render.tsx must pass serializable nodeId for jump-nav ids",
  );

  assert.doesNotMatch(filterSrc, /jumpSlug/, "filter must not accept a function prop");
  assert.match(filterSrc, /nodeId:\s*string/);
  assert.match(filterSrc, /catalogCategoryJumpId\(/);
});

test("catalog island graph does not import app/t/[profileCode] or use-server instant-book-action", () => {
  const files = [
    "lib/site-admin/builder-node/services-catalog-filter.tsx",
    "lib/site-admin/builder-node/services-catalog-static-fallback.tsx",
    "components/public-booking/CatalogBookingSheet.tsx",
    "components/public-booking/catalog-booking-logic.ts",
    "components/public-booking/catalog-island-boundary.tsx",
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /@\/app\/t\/\[profileCode\]/,
      `${rel} must not import the hub profile route folder`,
    );
    assert.doesNotMatch(
      src,
      /from\s+["']@\/lib\/server-actions\/instant-book-action["']/,
      `${rel} must not import the "use server" instant-book-action module (use instant-book-types)`,
    );
  }
});
