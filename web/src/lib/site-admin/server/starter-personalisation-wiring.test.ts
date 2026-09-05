/**
 * WIRING coverage for the starter personalisation pass.
 *
 * This codebase has repeatedly shipped features that were dead while their unit
 * tests were green — an audience personaliser exactly like this one sat unused
 * at its only real call site for months. So the pure-function suite in
 * `../builder-node/starter-personalisation.test.ts` is deliberately NOT the only
 * coverage. This file asserts the two things that actually make the feature
 * live:
 *
 *  1. BEHAVIOURAL — the REAL `resolvePlatformDefaultStorefrontTree`, driven over
 *     a recording Supabase mock that serves a template tree full of
 *     placeholders, returns a tree that is already personalised. Every consumer
 *     of the platform default goes through that function, so a substitution
 *     that happens there cannot be bypassed by a caller.
 *  2. STRUCTURAL — the two real call sites pass a MEANINGFUL context, not an
 *     empty object. A required parameter makes the pass impossible to forget;
 *     it does not stop someone from passing `{}`, which is what "dead at the
 *     call site" would look like here.
 *
 * Runs in the `test:builder` lane (glob over `src/lib/site-admin/server`), which
 * supplies the `server-only` shim this module graph needs.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import { improntaDesign } from "@/lib/site-admin/builder-node/page-designs";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { resolvePlatformDefaultStorefrontTree } from "./default-storefront-template";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The kind of tree an admin would author in Builder Lab for the platform
 * default: a name placeholder, an audience switch, an unknown placeholder that
 * must not reach a published page, and a machine value that must survive.
 */
const AUTHORED_TREE: BuilderNodeTree = [
  {
    id: "root",
    kind: "container",
    props: { layout: "stack" },
    children: [
      {
        id: "h1",
        kind: "heading",
        props: {
          level: 1,
          text:
            "{{audience: agency=A curated roster, ready for your next production." +
            "|business=Come see what we do." +
            "|else=Available for your next project.}}",
        },
      },
      {
        id: "p1",
        kind: "paragraph",
        props: {
          text: "{{business.name}} is open for bookings. Ask {{owner.firstName}} today.",
        },
      },
      {
        id: "b1",
        kind: "button",
        props: { label: "Book {{business.name}}", href: "/book?src={{business.name}}" },
      },
      {
        id: "roster",
        kind: "container",
        props: { layout: "stack", layerLabel: "Featured Talent Section" },
        children: [
          {
            id: "roster-embed",
            kind: "section_embed",
            props: { sectionTypeKey: "featured_talent" },
          },
        ],
      },
    ],
  },
];

/**
 * Minimal recording mock of the PostgREST builder chain
 * `loadReservedStorefrontSlugTree` emits. Every chain method returns `this`;
 * `maybeSingle()` resolves the row.
 */
function mockSupabase(row: unknown): { client: SupabaseClient; tables: string[] } {
  const tables: string[] = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
    returns: () => chain,
  };
  const client = {
    from: (table: string) => {
      tables.push(table);
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, tables };
}

test("the REAL default-storefront resolver returns an already-personalised tree", async () => {
  const { client, tables } = mockSupabase({
    builder_tree: AUTHORED_TREE,
    status: "published",
    target_context: "workspace",
    kind: "page",
  });

  const resolved = await resolvePlatformDefaultStorefrontTree(client, {
    businessName: "Riviera Maya Work",
    audience: "agency",
  });

  assert.ok(resolved, "resolver returned null over a published template row");
  assert.ok(tables.includes("builder_templates"), "template row was never read");

  const blob = JSON.stringify(resolved.builderTree);

  // The audience switch collapsed to the agency case.
  assert.ok(
    blob.includes("A curated roster, ready for your next production."),
    blob,
  );
  assert.ok(!blob.includes("Come see what we do."), "other audience cases leaked");
  // The name landed in the paragraph AND in the button label.
  assert.ok(blob.includes("Riviera Maya Work is open for bookings."), blob);
  assert.ok(blob.includes("Book Riviera Maya Work"), blob);
  // The unknown placeholder was stripped, not published.
  assert.ok(!blob.includes("owner.firstName"), "unknown placeholder survived");
  // The href is a machine value and keeps its braces.
  assert.ok(blob.includes("/book?src={{business.name}}"), blob);
  // Nothing else may carry raw template syntax.
  assert.equal(blob.split("{{").length - 1, 1, blob);
  // Agency keeps the roster showcase (the business prune must not fire here).
  assert.ok(blob.includes("featured_talent"), "agency roster showcase was dropped");
});

test("the REAL resolver drops the roster showcase for a business audience", async () => {
  const { client } = mockSupabase({
    builder_tree: AUTHORED_TREE,
    status: "published",
    target_context: "workspace",
    kind: "page",
  });
  const resolved = await resolvePlatformDefaultStorefrontTree(client, {
    businessName: "Casa Verde",
    audience: "business",
  });
  assert.ok(resolved);
  const blob = JSON.stringify(resolved.builderTree);
  assert.ok(blob.includes("Come see what we do."), blob);
  assert.ok(
    !blob.includes("featured_talent"),
    "business seed still has a featured_talent embed",
  );
  assert.ok(
    !blob.includes("Featured Talent Section"),
    "business seed still has the decomposed roster wrapper",
  );
});

test("the resolver degrades to the else case when the audience is unknown", async () => {
  const { client } = mockSupabase({
    builder_tree: AUTHORED_TREE,
    status: "published",
    target_context: "workspace",
    kind: "page",
  });
  const resolved = await resolvePlatformDefaultStorefrontTree(client, {
    businessName: "Riviera Maya Work",
  });
  assert.ok(resolved);
  assert.ok(
    JSON.stringify(resolved.builderTree).includes(
      "Available for your next project.",
    ),
  );
});

test("the REAL resolver keeps repeater tokens from a PAGE_DESIGN that has them", async () => {
  const authored = JSON.stringify(improntaDesign.tree);
  assert.ok(
    authored.includes('"{{num}}"'),
    "improntaDesign no longer carries {{num}}; this test would go green for the wrong reason",
  );
  const { client } = mockSupabase({
    builder_tree: improntaDesign.tree,
    status: "published",
    target_context: "workspace",
    kind: "page",
  });
  const resolved = await resolvePlatformDefaultStorefrontTree(client, {
    businessName: "Riviera Maya Work",
    audience: "agency",
  });
  assert.ok(resolved);
  const blob = JSON.stringify(resolved.builderTree);
  assert.ok(blob.includes('"{{num}}"'), "resolver stripped impronta {{num}}");
  assert.ok(blob.includes('"{{title}}"'), "resolver stripped impronta {{title}}");
  assert.ok(blob.includes('"{{detail}}"'), "resolver stripped impronta {{detail}}");
});

test("a template with no placeholders is served through the resolver unchanged", async () => {
  const plain: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "h", kind: "heading", props: { text: "Come see what we do.", level: 1 } },
      ],
    },
  ];
  const { client } = mockSupabase({
    builder_tree: plain,
    status: "published",
    target_context: "workspace",
    kind: "page",
  });
  const resolved = await resolvePlatformDefaultStorefrontTree(client, {
    businessName: "Riviera Maya Work",
    audience: "agency",
  });
  assert.ok(resolved);
  assert.deepEqual(resolved.builderTree, plain);
});

// ── the call sites must pass a REAL context, not an empty object ──────────

const seedSrc = readFileSync(join(here, "onboard-starter-content.ts"), "utf8");
const signupServeSrc = readFileSync(
  join(here, "signup-ai-draft-serve.ts"),
  "utf8",
);
const storefrontSrc = readFileSync(
  join(here, "..", "..", "..", "components", "home", "agency-home-storefront.tsx"),
  "utf8",
);

test("the SEED passes the tenant's display name and signup audience", () => {
  const call = seedSrc.match(
    /resolveSignupStarterTreeForOnboard\(([\s\S]*?)\n {2}\);/,
  );
  assert.ok(call, "seed no longer calls resolveSignupStarterTreeForOnboard");
  const args = call[1]!;
  assert.match(
    args,
    /businessName:\s*planRow\?\.display_name/,
    "the seed must hand the resolver the workspace display name it just read",
  );
  assert.match(
    args,
    /audience:\s*params\.audience/,
    "the seed must hand the resolver the signup audience it was given",
  );
  assert.match(
    signupServeSrc,
    /resolvePlatformDefaultStorefrontTree\(\s*client,\s*personalisation/,
    "AI-at-signup fallback must still stamp the Lab default through personalisation",
  );
});

test("the RENDER-TIME fallback passes the tenant's public name", () => {
  // Asserts the SHAPE, not the call's formatting. The previous regex required
  // the argument object to be closed by `})` immediately after
  // `resolvePlatformDefaultStorefrontTree(serviceSupabase, {`, so adding a
  // THIRD argument — the tenantId, which is the whole point of this change —
  // turned it red by REFORMATTING, while the personalisation it guards was
  // untouched. This repo already has that scar: a static guard pinned to
  // source text reddening main on a clean refactor.
  //
  // (Second time for this exact guard: the same fix rode on the PR that was
  // reverted, so main got the strict version back. Worth knowing that a revert
  // restores a guard's brittleness along with its subject.)
  const callStart = storefrontSrc.indexOf(
    "resolvePlatformDefaultStorefrontTree(",
  );
  assert.notEqual(
    callStart,
    -1,
    "storefront fallback no longer personalises the platform default",
  );
  const callSrc = storefrontSrc.slice(callStart, callStart + 600);
  assert.match(
    callSrc,
    /serviceSupabase/,
    "the render fallback must resolve with the service client",
  );
  assert.match(
    callSrc,
    /businessName:\s*identity\?\.public_name/,
    "the render fallback must pass the tenant identity name",
  );
  // brandLabel falls back to the PLATFORM brand; stamping "Tulala" into a
  // tenant's headline would be worse than the neutral fallback.
  assert.doesNotMatch(callSrc, /brandLabel/);
});

test("the resolver wires pruneStarterRosterForAudience after personalisation", () => {
  const resolverSrc = readFileSync(
    join(here, "default-storefront-template.ts"),
    "utf8",
  );
  assert.match(
    resolverSrc,
    /pruneStarterRosterForAudience\([\s\S]*personalisation\.audience/,
    "prune must run on the resolver output, not only in a helper nobody calls",
  );
});

test("no call site opts out with an empty personalisation object", () => {
  for (const [name, src] of [
    ["seed", seedSrc],
    ["signup-serve", signupServeSrc],
    ["storefront", storefrontSrc],
  ] as const) {
    assert.doesNotMatch(
      src,
      /resolvePlatformDefaultStorefrontTree\([^)]*,\s*\{\s*\}\s*\)/,
      `${name} passes an empty context, which is personalisation in name only`,
    );
  }
});
