import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveEditPageSlugFromPath,
  resolvePublicSurfaceOwnershipFromPath,
} from "./edit-path";

const locales = ["en", "es"] as const;

test("resolves homepage on a path-based free workspace root", () => {
  assert.equal(
    resolveEditPageSlugFromPath({
      rawPathname: "/freeflow-760905",
      supportedLocales: locales,
      publicPathPrefix: "/freeflow-760905",
    }),
    null,
  );
});

test("resolves nested CMS page on a path-based workspace", () => {
  assert.equal(
    resolveEditPageSlugFromPath({
      rawPathname: "/freeflow-760905/about",
      supportedLocales: locales,
      publicPathPrefix: "/freeflow-760905",
    }),
    "about",
  );
});

test("resolves localized path-based workspace pages", () => {
  assert.equal(
    resolveEditPageSlugFromPath({
      rawPathname: "/es/freeflow-760905/p/about",
      supportedLocales: locales,
      publicPathPrefix: "/freeflow-760905",
    }),
    "about",
  );
});

test("preserves branded subdomain clean page slugs", () => {
  assert.equal(
    resolveEditPageSlugFromPath({
      rawPathname: "/about",
      supportedLocales: locales,
      publicPathPrefix: null,
    }),
    "about",
  );
});

test("classifies directory route as non-builder surface", () => {
  assert.deepEqual(
    resolvePublicSurfaceOwnershipFromPath({
      rawPathname: "/freeflow-760905/directory",
      supportedLocales: locales,
      publicPathPrefix: "/freeflow-760905",
    }),
    { kind: "directory" },
  );
});

test("classifies profile route as non-builder surface", () => {
  assert.deepEqual(
    resolvePublicSurfaceOwnershipFromPath({
      rawPathname: "/freeflow-760905/t/TAL-1234",
      supportedLocales: locales,
      publicPathPrefix: "/freeflow-760905",
    }),
    { kind: "profile" },
  );
});

test("classifies CMS page route as builder page ownership", () => {
  assert.deepEqual(
    resolvePublicSurfaceOwnershipFromPath({
      rawPathname: "/freeflow-760905/p/about",
      supportedLocales: locales,
      publicPathPrefix: "/freeflow-760905",
    }),
    { kind: "builder_page", pageSlug: "about" },
  );
});

test("classifies localized directory route as non-builder surface", () => {
  assert.deepEqual(
    resolvePublicSurfaceOwnershipFromPath({
      rawPathname: "/es/freeflow-760905/directory",
      supportedLocales: locales,
      publicPathPrefix: "/freeflow-760905",
    }),
    { kind: "directory" },
  );
});

test("resolveEditPageSlugFromPath returns null for directory surface", () => {
  assert.equal(
    resolveEditPageSlugFromPath({
      rawPathname: "/freeflow-760905/directory",
      supportedLocales: locales,
      publicPathPrefix: "/freeflow-760905",
    }),
    null,
  );
});
