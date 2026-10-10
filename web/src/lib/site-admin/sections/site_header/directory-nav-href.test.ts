import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  directoryOrBookHref,
  filterNavItemsForRoster,
  isDirectoryHref,
  resolveRosterSafeHref,
} from "./directory-nav-href";

describe("directory-nav-href (TUL-519 card 77)", () => {
  it("detects bare, locale, and query directory paths", () => {
    assert.equal(isDirectoryHref("/directory"), true);
    assert.equal(isDirectoryHref("/directory?type=model"), true);
    assert.equal(isDirectoryHref("/es/directory"), true);
    assert.equal(isDirectoryHref("/en/directory/"), true);
    assert.equal(isDirectoryHref("/services"), false);
    assert.equal(isDirectoryHref("/book"), false);
    assert.equal(isDirectoryHref("/about"), false);
  });

  it("falls back to /book when the workspace has no roster", () => {
    assert.equal(directoryOrBookHref(true), "/directory");
    assert.equal(directoryOrBookHref(false), "/book");
  });

  it("strips directory nav items for business workspaces only", () => {
    const items = [
      { label: "Services", href: "/services" },
      { label: "Roster", href: "/directory" },
      { label: "About", href: "/about" },
      { label: "Team", href: "/es/directory" },
    ];
    assert.deepEqual(
      filterNavItemsForRoster(items, true).map((i) => i.href),
      ["/services", "/directory", "/about", "/es/directory"],
    );
    assert.deepEqual(
      filterNavItemsForRoster(items, false).map((i) => i.href),
      ["/services", "/about"],
    );
  });

  it("rewrites directory CTAs to /book when the workspace has no roster", () => {
    assert.equal(resolveRosterSafeHref("/directory", true), "/directory");
    assert.equal(resolveRosterSafeHref("/directory", false), "/book");
    assert.equal(resolveRosterSafeHref("/es/directory", false), "/book");
    assert.equal(resolveRosterSafeHref("/services", false), "/services");
    assert.equal(resolveRosterSafeHref(null, false), "/book");
    assert.equal(resolveRosterSafeHref(null, true), "/directory");
    assert.equal(resolveRosterSafeHref(undefined, false, "/book"), "/book");
  });
});
