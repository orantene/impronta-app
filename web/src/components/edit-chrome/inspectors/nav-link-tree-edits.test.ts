import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNavLink } from "@/lib/site-admin/builder-node/types";
import {
  addGrandchild,
  patchFeatured,
  patchGrandchild,
  removeGrandchild,
} from "./nav-link-tree-edits";

/** Two top links, each with a column, so an off-by-one hits a visible target. */
const LINKS: BuilderNavLink[] = [
  {
    id: "l1",
    label: "Divisions",
    href: "/directory",
    children: [
      {
        id: "c1",
        label: "By discipline",
        href: "#",
        children: [
          { id: "g1", label: "Models", href: "/p/models" },
          { id: "g2", label: "Hosts", href: "/p/hosts" },
        ],
      },
      { id: "c2", label: "Plain child", href: "/plain" },
    ],
  },
  { id: "l2", label: "About", href: "/p/about" },
];

test("patching a grandchild touches only that one", () => {
  const next = patchGrandchild(LINKS, 0, 0, 1, { label: "Hosts & Promoters" });
  const column = next[0]!.children![0]!.children!;
  assert.equal(column[1]!.label, "Hosts & Promoters");
  assert.equal(column[0]!.label, "Models", "sibling was rewritten");
  assert.equal(next[1]!.label, "About", "another top-level link was rewritten");
  assert.equal(
    LINKS[0]!.children![0]!.children![1]!.label,
    "Hosts",
    "the input array was mutated",
  );
});

test("adding respects the schema's cap of 8", () => {
  // Not a UI preference: a ninth entry is stripped on validate, so an add that
  // appeared to work would silently vanish on save.
  let links: BuilderNavLink[] = patchGrandchild(LINKS, 0, 0, 0, {});
  for (let i = 0; i < 10; i += 1) {
    links = addGrandchild(links, 0, 0, `seed${i}`);
  }
  assert.equal(links[0]!.children![0]!.children!.length, 8);
});

test("removing the last link in a column ends the column", () => {
  // Leaving `children: []` renders a heading with nothing under it.
  let links = removeGrandchild(LINKS, 0, 0, 0);
  links = removeGrandchild(links, 0, 0, 0);
  assert.equal(links[0]!.children![0]!.children, undefined);
});

test("a featured card needs a reason to exist", () => {
  const withCard = patchFeatured(LINKS, 0, { title: "See the board", href: "/directory" });
  assert.equal(withCard[0]!.featured?.title, "See the board");

  // Emptying both fields is how an operator deletes it — an empty card would
  // otherwise render as a blank tile in the panel.
  const cleared = patchFeatured(withCard, 0, { title: "", href: "" });
  assert.equal(cleared[0]!.featured, undefined);

  const explicit = patchFeatured(withCard, 0, null);
  assert.equal(explicit[0]!.featured, undefined);
});

test("featured edits do not leak to other links", () => {
  const next = patchFeatured(LINKS, 1, { title: "Promo", href: "/x" });
  assert.equal(next[0]!.featured, undefined);
  assert.equal(next[1]!.featured?.title, "Promo");
});
