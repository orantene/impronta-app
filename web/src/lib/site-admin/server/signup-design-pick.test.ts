import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { PAGE_DESIGNS } from "@/lib/site-admin/builder-node/page-designs";

import {
  pickSignupDesign,
  signupDesignPickIds,
} from "./signup-design-pick";

test("every design this picker can emit is a real PAGE_DESIGNS id", () => {
  const known = new Set(PAGE_DESIGNS.map((design) => design.id));
  for (const id of signupDesignPickIds()) {
    assert.ok(known.has(id), `unknown design id ${id}`);
  }
});

test("a restaurant brief picks the restaurant page design", () => {
  const pick = pickSignupDesign({
    audience: "business",
    businessDescription: "A small restaurant in Playa del Carmen.",
  });
  assert.deepEqual(pick, { source: "page_design", designId: "restaurant" });
});

test("agency with no stronger keyword keeps the Lab platform default", () => {
  const pick = pickSignupDesign({
    audience: "agency",
    businessDescription: "We book talent for productions.",
  });
  assert.deepEqual(pick, { source: "platform_default", designId: null });
});

test("operator with no keyword lands on the coach design", () => {
  const pick = pickSignupDesign({
    audience: "operator",
    businessDescription: "",
  });
  assert.deepEqual(pick, { source: "page_design", designId: "coach" });
});

test("organization defaults to conference when the brief is generic", () => {
  const pick = pickSignupDesign({
    audience: "organization",
    businessDescription: "We run gatherings for members.",
  });
  assert.deepEqual(pick, { source: "page_design", designId: "conference" });
});

test("a fashion keyword overrides the audience default", () => {
  const pick = pickSignupDesign({
    audience: "operator",
    businessDescription: "Fashion casting and roster management.",
  });
  assert.deepEqual(pick, { source: "page_design", designId: "agency" });
});

test("restore does not match the store keyword", () => {
  const pick = pickSignupDesign({
    audience: "operator",
    businessDescription: "I restore antique cameras.",
  });
  assert.equal(pick.designId, "coach");
});

test("missing audience follows the funnel default (operator)", () => {
  const pick = pickSignupDesign({ businessDescription: null });
  assert.deepEqual(pick, { source: "page_design", designId: "coach" });
});

test("the Website surfaces mount the homepage design swap", () => {
  const root = join(process.cwd(), "src/components/admin/shell/internal/page-modules");
  const overview = readFileSync(join(root, "WebsitePage-1.tsx"), "utf8");
  const hub = readFileSync(join(root, "WebsiteDesignHub.tsx"), "utf8");
  assert.match(overview, /<HomepageDesignSwap/);
  assert.match(hub, /<HomepageDesignSwap/);
});
