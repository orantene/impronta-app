/**
 * Reachability (the fourth layer): a route on disk that the host gate refuses
 * 404s before Next routing runs. Business service pages must pass the gate on
 * business hosts, and only as two-segment paths.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { isPathAllowedForHostKind } from "@/lib/saas/gate";

describe("business service pages pass the host gate (TUL-1272 #5)", () => {
  it("agency and hub hosts serve /services/<slug> and /servicios/<slug>", () => {
    for (const kind of ["agency", "hub"] as const) {
      assert.equal(isPathAllowedForHostKind(kind, "/services/masaje-1a2b3c4d"), true, kind);
      assert.equal(isPathAllowedForHostKind(kind, "/servicios/masaje-1a2b3c4d"), true, kind);
    }
  });
  it("the single-segment list and deeper paths are not claimed by this rule", () => {
    assert.equal(isPathAllowedForHostKind("app", "/servicios/masaje-1a2b3c4d"), false);
    assert.equal(isPathAllowedForHostKind("marketing", "/services/masaje-1a2b3c4d"), false);
  });
  it("both route folders exist on disk", () => {
    for (const seg of ["services", "servicios"]) {
      assert.ok(existsSync(join(process.cwd(), `src/app/(public)/${seg}/[slug]/page.tsx`)), seg);
    }
  });
});
