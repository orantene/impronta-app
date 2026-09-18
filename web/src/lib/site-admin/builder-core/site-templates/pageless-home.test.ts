import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { buildComponentsForType } from "./business-components";
import { EXAMPLE_IDENTITY, fixtureImageResolver } from "./examples";
import { DEFAULT_LOOK_BY_FAMILY } from "./look-defaults";
import { getLook } from "./looks";
import { composePagelessHome, foldComponentsForPagelessHome } from "./pageless-home";
import type { ComponentContext, SiteLocale } from "./types";

// D-169: a page-less tenant renders ONE page. The Look puts the type's
// catalogue / transaction components on inner pages nothing serves, so the
// fallback home used to carry none of them.

function kindsOf(tree: BuilderNode[]): Set<string> {
  const out = new Set<string>();
  const walk = (n: BuilderNode) => {
    out.add(n.kind);
    const children = (n as { children?: BuilderNode[] }).children ?? [];
    for (const c of children) walk(c);
  };
  for (const n of tree) walk(n);
  return out;
}

function ctxFor(family: ComponentContext["family"], typeId: string, locale: SiteLocale = "es"): ComponentContext {
  // The live fallback's context: identity + images, no facts, NOT an example.
  return { locale, family, typeId, identity: EXAMPLE_IDENTITY, images: fixtureImageResolver, rosterActive: family === "agency" };
}

function composeFor(family: ComponentContext["family"], typeId: string) {
  const look = getLook(DEFAULT_LOOK_BY_FAMILY[family]);
  assert.ok(look, `${family} has a default Look`);
  const ctx = ctxFor(family, typeId);
  return composePagelessHome({ look: look!, locale: "es", identity: ctx.identity, images: fixtureImageResolver, typeId, ctx });
}

test("a page-less restaurant home carries its menu board and reserve-table block", () => {
  const { tree, issues } = composeFor("dining", "restaurant");
  assert.ok(tree, `tree composed: ${issues.join(" | ")}`);
  const kinds = kindsOf(tree!);
  assert.ok(kinds.has("menu_board"), "menu_board on the home");
  assert.ok(kinds.has("reserve_table"), "reserve_table on the home");
  assert.ok(kinds.has("location_map"), "the contact page's map folded onto the home");
});

test("a page-less studio home carries its session picker", () => {
  const { tree, issues } = composeFor("fitness", "yoga-studio");
  assert.ok(tree, `tree composed: ${issues.join(" | ")}`);
  const kinds = kindsOf(tree!);
  assert.ok(kinds.has("session_picker"), "session_picker on the home");
  const picker = JSON.stringify(tree).match(/"kind":"session_picker","props":\{"offeringId":""/);
  assert.ok(picker, "the picker ships unbound; the island binds the tenant's next offering");
});

test("folding moves inner-page slots onto the home's and leaves the gallery to the Look's teaser", () => {
  const folded = foldComponentsForPagelessHome(buildComponentsForType("restaurant", ctxFor("dining", "restaurant")));
  for (const slot of ["catalogue", "transaction", "people", "map", "gallery"] as const) {
    assert.ok(!folded.has(slot), `${slot} folded away`);
  }
  const offer = folded.get("home.offer") ?? [];
  assert.ok(offer.length >= 2, "offer slot carries catalogue + transaction");
  const kinds = kindsOf(offer);
  assert.ok(kinds.has("menu_board") && kinds.has("reserve_table"));
  assert.ok(kindsOf(folded.get("whatsapp") ?? []).has("location_map"));
});

test("an example context keeps the honest empty line for the session picker", () => {
  const ctx = { ...ctxFor("fitness", "yoga-studio"), example: true };
  const kinds = kindsOf(buildComponentsForType("yoga-studio", ctx).get("transaction") ?? []);
  assert.ok(!kinds.has("session_picker"));
});
