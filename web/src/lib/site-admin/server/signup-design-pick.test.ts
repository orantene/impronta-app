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

// ─── Salon, barber, spa, clinic (F8) ────────────────────────────────────────

test("a salon, barber, spa or clinic lands on the services design, not a shop", () => {
  // These four had NO keyword row, so all of them fell through
  // AUDIENCE_DEFAULT.business to `store` — the fine-art print storefront whose
  // nav said Shop and whose button said "Add to cart, $280" against a
  // fabricated price. A barbershop was handed a shop with a cart in it.
  const cases = [
    "Barbershop in Tulum",
    "Barbería del centro",
    "Hair salon and colour",
    "Day spa and massage",
    "Dental clinic",
    "Clínica dental",
    "Nails and beauty",
    "Wellness and massage studio",
  ];
  for (const businessDescription of cases) {
    const pick = pickSignupDesign({ audience: "business", businessDescription });
    assert.equal(pick.source, "page_design", businessDescription);
    assert.equal(pick.designId, "services", businessDescription);
  }
});

test("the services row sits ABOVE shop, so 'barber shop' is not a storefront", () => {
  // Keyword rows are first-match-wins, and "barber shop" contains "shop". If
  // the services row ever moves below the store row this silently regresses to
  // the exact bug it was added to fix.
  assert.equal(
    pickSignupDesign({ audience: "business", businessDescription: "Barber shop" }).designId,
    "services",
  );
});

test("a real shop still gets the store design", () => {
  // The new row must not swallow retail.
  for (const businessDescription of ["Print shop and framing", "Boutique retail store"]) {
    assert.equal(
      pickSignupDesign({ audience: "business", businessDescription }).designId,
      "store",
      businessDescription,
    );
  }
});
