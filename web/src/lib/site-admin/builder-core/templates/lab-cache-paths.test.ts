/**
 * lab-cache-paths.test.ts — the cache invalidation a Builder Lab write performs.
 *
 * THE TWO FAILURES THIS PINS
 * ──────────────────────────
 *  1. The DEFAULT-pointer write revalidated nothing at all. It was the one write
 *     in the Lab that could change what an anonymous visitor renders while
 *     leaving both the admin tree and the public surface on cached payloads.
 *  2. Every OTHER Lab write revalidated `/platform/admin` with the DEFAULT
 *     segment type ("page"). The Lab is at `/platform/admin/builder-lab`, a
 *     child segment, so those calls never reached the surface the operator was
 *     staring at. A test that only asserted "the path is /platform/admin" would
 *     have passed against the bug, so the TYPE is asserted explicitly here.
 *
 * The public path is the expensive one — `revalidatePath("/")` drops cached data
 * for every tenant storefront — so the "only when this row is actually the live
 * default" rule is pinned in both directions.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PLATFORM_ADMIN_REVALIDATE,
  PUBLIC_PATH_FOR_SURFACE,
  revalidateTargetsForPointerWrite,
  revalidateTargetsForTemplateWrite,
  surfacesServableByTarget,
} from "./lab-cache-paths";

describe("the Lab admin segment", () => {
  it("is revalidated as a LAYOUT so the child Lab route is actually reached", () => {
    assert.equal(PLATFORM_ADMIN_REVALIDATE.path, "/platform/admin");
    // The whole bug in one assertion: "page" here is a no-op for
    // /platform/admin/builder-lab.
    assert.equal(PLATFORM_ADMIN_REVALIDATE.type, "layout");
  });
});

describe("surfacesServableByTarget", () => {
  it("mirrors the render-side target_context filter", () => {
    assert.deepEqual(surfacesServableByTarget("workspace"), ["storefront"]);
    assert.deepEqual(surfacesServableByTarget("talent"), ["talent"]);
    assert.deepEqual(surfacesServableByTarget("both"), ["storefront", "talent"]);
    // "platform"-context rows are filtered out of both default chains.
    assert.deepEqual(surfacesServableByTarget("platform"), []);
  });
});

describe("revalidateTargetsForPointerWrite", () => {
  it("busts the Lab AND the surface's public path — the write changed the answer", () => {
    assert.deepEqual(revalidateTargetsForPointerWrite("storefront"), [
      PLATFORM_ADMIN_REVALIDATE,
      { path: "/" },
    ]);
  });

  it("names the talent path with an explicit type (it is a dynamic segment)", () => {
    const targets = revalidateTargetsForPointerWrite("talent");
    assert.deepEqual(targets[1], { path: "/t/[profileCode]", type: "page" });
  });

  it("never busts the OTHER surface's public path", () => {
    // Flipping the talent default must not drop every tenant storefront's
    // cached branding.
    const paths = revalidateTargetsForPointerWrite("talent").map((t) => t.path);
    assert.equal(paths.includes("/"), false);
  });
});

describe("revalidateTargetsForTemplateWrite", () => {
  const LIVE = "tpl-live";

  it("busts the public storefront when the published row IS the live default", () => {
    const targets = revalidateTargetsForTemplateWrite({
      templateId: LIVE,
      targetContext: "workspace",
      pointerBySurface: { storefront: LIVE, talent: null },
    });
    assert.deepEqual(targets, [
      PLATFORM_ADMIN_REVALIDATE,
      PUBLIC_PATH_FOR_SURFACE.storefront,
    ]);
  });

  it("does NOT bust anything public for an unrelated starter publish", () => {
    const targets = revalidateTargetsForTemplateWrite({
      templateId: "tpl-other",
      targetContext: "workspace",
      pointerBySurface: { storefront: LIVE, talent: null },
    });
    assert.deepEqual(targets, [PLATFORM_ADMIN_REVALIDATE]);
  });

  it("does NOT bust anything public when no default is set at all", () => {
    const targets = revalidateTargetsForTemplateWrite({
      templateId: LIVE,
      targetContext: "both",
      pointerBySurface: { storefront: null, talent: null },
    });
    assert.deepEqual(targets, [PLATFORM_ADMIN_REVALIDATE]);
  });

  it("busts BOTH public paths for a `both`-context row that is default on each", () => {
    const targets = revalidateTargetsForTemplateWrite({
      templateId: LIVE,
      targetContext: "both",
      pointerBySurface: { storefront: LIVE, talent: LIVE },
    });
    assert.deepEqual(targets.map((t) => t.path), [
      "/platform/admin",
      "/",
      "/t/[profileCode]",
    ]);
  });

  it("ignores a pointer on a surface the row's target can never serve", () => {
    // A talent-context row cannot render as a storefront default even if the
    // pointer somehow named it, so publishing it must not bust `/`.
    const targets = revalidateTargetsForTemplateWrite({
      templateId: LIVE,
      targetContext: "talent",
      pointerBySurface: { storefront: LIVE, talent: null },
    });
    assert.deepEqual(targets, [PLATFORM_ADMIN_REVALIDATE]);
  });
});
