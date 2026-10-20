import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { APP_ROOT_SEGMENTS, RESERVED_SERVICE_SLUGS, isReservedServiceSlug } from "./service-slug-reserved";
import { normalizeStoredServiceSlug, serviceContentFromRow } from "./service-content-fields";

const APP = join(fileURLToPath(new URL(".", import.meta.url)), "../../app");

/** Static, routable top-level segments: no route groups, dynamic or private folders. */
function rootSegments(dir: string): string[] {
  return readdirSync(dir).filter((e) => {
    if (!statSync(join(dir, e)).isDirectory() && !/\.(txt|js|xml)$/.test(e)) return false;
    return !/^[([@_%]/.test(e);
  });
}

test("every static top-level route (root, (public), (auth)) is in the service-slug denylist", () => {
  const segs = new Set([...rootSegments(APP), ...rootSegments(join(APP, "(public)")), ...rootSegments(join(APP, "(auth)"))]);
  const missing = [...segs].filter((s) => !RESERVED_SERVICE_SLUGS.has(s.toLowerCase()));
  assert.deepEqual(missing, [], "add new top-level routes to APP_ROOT_SEGMENTS in service-slug-reserved.ts");
  assert.deepEqual([...APP_ROOT_SEGMENTS], [...APP_ROOT_SEGMENTS].sort(), "keep APP_ROOT_SEGMENTS sorted");
});

test("the coordinator's named words, locale codes and policy pages are reserved", () => {
  const words = [
    "book", "directory", "about", "admin", "api", "p", "t", "w", "en", "es", "blog", "events", "eventos",
    "contact", "login", "register", "start", "pay", "manage", "account", "client", "platform", "_next",
    "static", "assets", "robots.txt", "sitemap.xml", "llms.txt", "politicas", "privacidad", "privacy", "pt-br",
  ];
  for (const w of words) assert.equal(isReservedServiceSlug(w), true, w);
  assert.equal(isReservedServiceSlug(" Book "), true);
  assert.equal(isReservedServiceSlug("corte-clasico"), false);
  assert.equal(isReservedServiceSlug("book-a-cut"), false);
});

test("normalizeStoredServiceSlug and the row parser treat a reserved slug as no custom slug", () => {
  assert.equal(normalizeStoredServiceSlug("book"), null);
  assert.equal(normalizeStoredServiceSlug("ES"), null);
  assert.equal(normalizeStoredServiceSlug("corte-clasico"), "corte-clasico");
  const c = serviceContentFromRow({ slug: "admin", slug_history: ["login", "corte-viejo"] });
  assert.equal(c.slug, null);
  assert.deepEqual(c.slugHistory, ["corte-viejo"]);
  assert.equal(serviceContentFromRow({ slug: "servicio-corte-3fa91c2b" }).slug, null, "derived grammar is ambiguous");
});
