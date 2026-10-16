import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { buildComponentsForType } from "./business-components";
import { EXAMPLE_IDENTITY, fixtureImageResolver } from "./examples";
import { DEFAULT_LOOK_BY_FAMILY } from "./look-defaults";
import { getLook } from "./looks";
import { composePagelessHome, foldComponentsForPagelessHome, stripPagelessFooterChrome } from "./pageless-home";
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

// TUL-697: the fallback home is the ONLY page a page-less tenant has. Its
// header, footer and teaser buttons must not link to inner pages nothing
// serves (/services, /about, /gallery, /contact answer 404 signed out).
function innerPageLinks(tree: BuilderNode[]): string[] {
  const inner = /^\/(services|about|gallery|contact)$/;
  const found: string[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (typeof o.href === "string" && inner.test(o.href)) found.push(o.href);
    for (const v of Object.values(o)) walk(v);
  };
  walk(tree);
  return found;
}

for (const [family, typeId] of [["agency", "agency"], ["fitness", "yoga-studio"], ["dining", "restaurant"]] as const) {
  test(`TUL-697: a page-less ${typeId} home links to no unserved inner page`, () => {
    const { tree, issues } = composeFor(family, typeId);
    assert.ok(tree, `tree composed: ${issues.join(" | ")}`);
    assert.deepEqual(innerPageLinks(tree!), []);
  });
}

test("TUL-697: the page-less home keeps its /book link", () => {
  const { tree } = composeFor("agency", "agency");
  assert.ok(JSON.stringify(tree).includes('"/book"'), "/book survives");
});

// TUL-885: the page-less home sits inside the platform's own header + footer, so
// the Look's footer band must not add a second "©" line or a second hamburger.

function textsOf(tree: BuilderNode[], kind: string): string[] {
  const out: string[] = [];
  const walk = (n: BuilderNode) => {
    if (n.kind === kind) out.push(String((n as { props?: { text?: unknown } }).props?.text ?? ""));
    for (const c of (n as { children?: BuilderNode[] }).children ?? []) walk(c);
  };
  for (const n of tree) walk(n);
  return out;
}

function navCount(tree: BuilderNode[]): number {
  let n = 0;
  const walk = (x: BuilderNode) => {
    if (x.kind === "nav") n += 1;
    for (const c of (x as { children?: BuilderNode[] }).children ?? []) walk(c);
  };
  for (const x of tree) walk(x);
  return n;
}

test("TUL-885: the page-less home has no © line and exactly one nav (the header's)", () => {
  for (const [family, typeId] of [
    ["dining", "restaurant"],
    ["fitness", "yoga-studio"],
  ] as const) {
    const { tree, issues } = composeFor(family, typeId);
    assert.ok(tree, `${typeId} composed: ${issues.join(" | ")}`);
    const rights = textsOf(tree!, "paragraph").filter((t) => t.replace(/\{\/?[a-z]\}/gi, "").trim().startsWith("©"));
    assert.deepEqual(rights, [], `${typeId}: the platform footer prints the single © line`);
    assert.equal(navCount(tree!), 1, `${typeId}: one nav, in the header; the footer has no hamburger`);
  }
});

test("TUL-885: stripPagelessFooterChrome removes the © paragraph and nav at any depth and keeps the rest", () => {
  const footer = [
    {
      kind: "container",
      children: [
        { kind: "paragraph", props: { text: "© Acme" } },
        { kind: "nav", props: { links: [] } },
        { kind: "heading", props: { text: "Acme" } },
        { kind: "container", children: [{ kind: "paragraph", props: { text: "{b}© 2026 Acme{/b}" } }, { kind: "paragraph", props: { text: "Tagline" } }] },
      ],
    },
  ];
  const out = stripPagelessFooterChrome(footer) as unknown as Array<{ children: Array<{ kind: string; children?: Array<{ kind: string; props?: { text?: string } }> }> }>;
  assert.deepEqual(out[0].children.map((c) => c.kind), ["heading", "container"]);
  assert.deepEqual(out[0].children[1].children?.map((c) => c.props?.text), ["Tagline"]);
  // Non-mutating: the input still has everything.
  assert.equal((footer[0].children as unknown[]).length, 4);
});

test("TUL-885: a paragraph that merely mentions © mid-sentence is kept", () => {
  const out = stripPagelessFooterChrome([{ kind: "paragraph", props: { text: "All images © their owners" } }]);
  assert.equal(out.length, 1);
});
