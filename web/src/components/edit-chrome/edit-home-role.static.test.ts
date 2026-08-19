import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { resolvePublicSurfaceOwnershipFromPath } from "./edit-path";

/**
 * The editor and the live site have to agree about what "/" is.
 *
 * They did not. The public renderer resolves `pageRoles.home` to decide what
 * the root path serves; the editor mount skipped that and fell through to the
 * legacy homepage adapter. For a tenant whose "/" is a FREEFORM page — which is
 * what page roles are for — the live site served one page while the builder
 * opened a different one and offered to edit it. Nothing errored. An operator
 * could publish edits all day to a page no visitor was looking at.
 */
const MOUNT = readFileSync(new URL("./edit-chrome-mount.tsx", import.meta.url), "utf8");

test("the root path still carries no slug of its own", () => {
  // This is WHY the resolution is needed; if it ever changes, the mount's
  // fallback becomes dead code rather than a silent behaviour change.
  const ownership = resolvePublicSurfaceOwnershipFromPath({
    rawPathname: "/",
    supportedLocales: ["en", "es"],
    publicPathPrefix: "",
  } as never);
  assert.equal(ownership.kind, "builder_page");
  assert.equal(
    (ownership as { pageSlug: string | null }).pageSlug,
    null,
    "root resolves to a null slug — the home ROLE is what names the page",
  );
});

test("the mount resolves the home role for the root path", () => {
  assert.match(MOUNT, /resolveAgencyHomeSlug\(ctx\.tenantId, localeContext\.locale\)/);
  // Only when there is no slug already — a real page path must never be
  // overridden by the homepage pointer.
  assert.match(MOUNT, /if \(\s*!pageSlug &&/);
});

test("a tenant without a home role keeps the legacy adapter", () => {
  // resolveAgencyHomeSlug returns null unless a PUBLISHED page exists at the
  // pointer for the locale, and the catch keeps a failed lookup on the old
  // path rather than blanking the canvas.
  const block = MOUNT.slice(MOUNT.indexOf("if (\n    !pageSlug &&"));
  assert.match(block.slice(0, 400), /catch \{\s*pageSlug = null;/);
});

test("the freeform probe still filters by locale", () => {
  // The probe now runs for the homepage too, where it never did before. Losing
  // the locale filter here is what once made every multi-locale page open blank.
  const probe = MOUNT.slice(MOUNT.indexOf('.from("cms_pages")'));
  assert.match(probe.slice(0, 500), /\.eq\("locale", localeContext\.locale\)/);
});
