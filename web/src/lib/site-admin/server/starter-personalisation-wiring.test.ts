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
const storefrontSrc = readFileSync(
  join(here, "..", "..", "..", "components", "home", "agency-home-storefront.tsx"),
  "utf8",
);

test("the SEED passes the tenant's display name and signup audience", () => {
  const call = seedSrc.match(
    /resolvePlatformDefaultStorefrontTree\(([\s\S]*?)\n {2}\);/,
  );
  assert.ok(call, "seed no longer calls resolvePlatformDefaultStorefrontTree");
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
});

test("the RENDER-TIME fallback passes the tenant's public name", () => {
  const call = storefrontSrc.match(
    /resolvePlatformDefaultStorefrontTree\(serviceSupabase,\s*\{([\s\S]*?)\}\)/,
  );
  assert.ok(call, "storefront fallback no longer personalises the platform default");
  assert.match(
    call[1]!,
    /businessName:\s*identity\?\.public_name/,
    "the render fallback must pass the tenant identity name",
  );
  // brandLabel falls back to the PLATFORM brand; stamping "Tulala" into a
  // tenant's headline would be worse than the neutral fallback.
  assert.doesNotMatch(call[1]!, /brandLabel/);
});

test("no call site opts out with an empty personalisation object", () => {
  for (const [name, src] of [
    ["seed", seedSrc],
    ["storefront", storefrontSrc],
  ] as const) {
    assert.doesNotMatch(
      src,
      /resolvePlatformDefaultStorefrontTree\([^)]*,\s*\{\s*\}\s*\)/,
      `${name} passes an empty context, which is personalisation in name only`,
    );
  }
});
