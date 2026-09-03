import test from "node:test";
import assert from "node:assert/strict";

import { buildDefaultNav } from "./onboard-navigation";

/**
 * The seeded nav may contain only destinations that resolve FOR THIS WORKSPACE.
 *
 * F1a spent a whole PR removing seeded links to routes that never existed.
 * Seeding a nav of hopeful destinations would reintroduce exactly that bug in a
 * new table, so the rule is asserted here rather than trusted.
 */

const AGENCY = { settings: null, workspaceType: "talent", hasContactPage: false, locale: "en" as const };
const BUSINESS = { settings: null, workspaceType: "business", hasContactPage: false, locale: "en" as const };

test("home is always present and always first", () => {
  for (const inputs of [AGENCY, BUSINESS]) {
    const nav = buildDefaultNav(inputs);
    assert.equal(nav[0]?.href, "/");
    assert.equal(nav[0]?.sort_order, 0);
  }
});

test("a business workspace gets NO /directory item", () => {
  // `assertRosterWorkspace` 404s /directory for a business workspace. This is
  // C2: the route the OLD dead-CTA guard used to steer authors into.
  const nav = buildDefaultNav(BUSINESS);
  assert.ok(!nav.some((i) => i.href === "/directory"));
});

test("a talent workspace gets /directory, labelled with its own word", () => {
  assert.ok(buildDefaultNav(AGENCY).some((i) => i.href === "/directory"));

  // A tour operator represents guides, not "talent", and the words layer says
  // so. The label follows the preset rather than an English default.
  const tours = buildDefaultNav({
    ...AGENCY,
    settings: { industry_preset: "tours_activities" },
  });
  const directory = tours.find((i) => i.href === "/directory");
  assert.equal(directory?.label, "Guides");

  const toursEs = buildDefaultNav({
    ...AGENCY,
    settings: { industry_preset: "tours_activities" },
    locale: "es",
  });
  assert.equal(toursEs.find((i) => i.href === "/directory")?.label, "Guías");
});

test("/contact appears only when the contact page was actually seeded", () => {
  // Per D7 a contact page exists only when the operator has real details. A nav
  // item for a page that was skipped is a dead link by another name.
  assert.ok(!buildDefaultNav(AGENCY).some((i) => i.href === "/contact"));
  assert.ok(
    buildDefaultNav({ ...AGENCY, hasContactPage: true }).some((i) => i.href === "/contact"),
  );
});

test("the chat is NOT in the nav", () => {
  // A nav item is a promise about a place; the chat is an action, and it lives
  // on the header verb, which F2b resolves through the words layer.
  for (const inputs of [AGENCY, BUSINESS, { ...AGENCY, hasContactPage: true }]) {
    assert.ok(!buildDefaultNav(inputs).some((i) => i.href.includes("inquiry=open")));
  }
});

test("EVERY seeded href is on the resolvable list, for every combination", () => {
  // The whole-rule guard. `/` and `/book` resolve for every workspace type;
  // `/directory` only where the roster is enabled; `/contact` only when seeded.
  const resolvable = new Set(["/", "/book", "/directory", "/contact"]);
  for (const workspaceType of ["talent", "business", null, "who-knows"]) {
    for (const hasContactPage of [true, false]) {
      for (const locale of ["en", "es"] as const) {
        for (const preset of [null, "restaurant", "agency", "sports_venue"]) {
          const nav = buildDefaultNav({
            settings: preset ? { industry_preset: preset } : null,
            workspaceType,
            hasContactPage,
            locale,
          });
          for (const item of nav) {
            assert.ok(
              resolvable.has(item.href),
              `${item.href} is not a route that resolves for ${workspaceType}`,
            );
          }
          // And a business workspace never gets the roster route, whatever the
          // preset says.
          if (workspaceType === "business") {
            assert.ok(!nav.some((i) => i.href === "/directory"));
          }
        }
      }
    }
  }
});

test("labels are never blank and sort order is dense from zero", () => {
  const nav = buildDefaultNav({ ...AGENCY, hasContactPage: true });
  nav.forEach((item, index) => {
    assert.ok(item.label.trim().length > 0, `${item.href} has a blank label`);
    assert.equal(item.sort_order, index);
  });
});

test("Spanish labels are Spanish", () => {
  const nav = buildDefaultNav({ ...AGENCY, hasContactPage: true, locale: "es" });
  assert.equal(nav.find((i) => i.href === "/")?.label, "Inicio");
  assert.equal(nav.find((i) => i.href === "/contact")?.label, "Contacto");
});
