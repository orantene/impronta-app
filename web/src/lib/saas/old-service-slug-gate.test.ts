import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { isBusinessServiceOldSlugCandidate } from "@/lib/services/business-pages/paths";

import { isPathAllowedForHostKind } from "./gate";

const KEY = "SERVICE_PRESENTATION_RESOLVER_ENABLED";
const prev = process.env[KEY];
afterEach(() => {
  if (prev === undefined) delete process.env[KEY];
  else process.env[KEY] = prev;
});

describe("TUL-1594: the gate lets a plain old service slug reach the business route", () => {
  it("flag on, agency host: /services/<plain> and /servicios/<plain> are allowed", () => {
    process.env[KEY] = "true";
    assert.equal(isPathAllowedForHostKind("agency", "/services/old-haircut"), true);
    assert.equal(isPathAllowedForHostKind("agency", "/servicios/corte-viejo"), true);
  });

  it("flag off: exactly today (not allowed, so the CMS rewrite keeps them)", () => {
    delete process.env[KEY];
    assert.equal(isPathAllowedForHostKind("agency", "/services/old-haircut"), false);
    assert.equal(isPathAllowedForHostKind("agency", "/servicios/corte-viejo"), false);
  });

  it("agency hosts only: hub and talent-less kinds never get it", () => {
    process.env[KEY] = "true";
    assert.equal(isPathAllowedForHostKind("hub", "/services/old-haircut"), false);
    assert.equal(isPathAllowedForHostKind("app", "/services/old-haircut"), false);
  });

  it("id8 slugs stay allowed (flag on) and denied (flag off), unchanged", () => {
    process.env[KEY] = "true";
    assert.equal(isPathAllowedForHostKind("agency", "/services/masaje-1a2b3c4d"), true);
    delete process.env[KEY];
    assert.equal(isPathAllowedForHostKind("agency", "/services/masaje-1a2b3c4d"), false);
  });

  it("the single-segment list, deeper CMS paths, and reserved words are not candidates", () => {
    process.env[KEY] = "true";
    for (const p of ["/services", "/servicios", "/services/", "/services/a/b", "/services/menu", "/services/tours", "/services/classes", "/services/Bad Slug", "/other/old-haircut"]) {
      assert.equal(isBusinessServiceOldSlugCandidate(p), false, p);
    }
    assert.equal(isPathAllowedForHostKind("agency", "/services"), false);
    assert.equal(isPathAllowedForHostKind("agency", "/services/photography/portraits"), false);
  });
});
