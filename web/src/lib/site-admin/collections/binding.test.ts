import assert from "node:assert/strict";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import {
  collectBuilderCollectionSourceKeys,
  collectionDataSourceDefinition,
  getBuilderDataBindingFindings,
  getBuilderDataSourceDefinition,
  isCollectionDataSourceKey,
  renderBuilderNodes,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import { collectionSourceKey } from "./types";

// A "Team" collection bound to a repeater. The container repeats over the
// collection; its single template child (a heading) field-binds `text` to the
// collection's `name` field via a `{{name}}` token.
const TEAM_KEY = collectionSourceKey("team-1");

function teamRepeaterTree(): BuilderNode[] {
  return [
    {
      id: "team",
      kind: "container",
      props: {
        layout: "grid",
        columns: 3,
        dataBinding: { sourceKey: TEAM_KEY, repeat: true },
      },
      children: [
        {
          id: "team:card",
          kind: "container",
          props: { layout: "stack" },
          children: [
            {
              id: "team:card:name",
              kind: "heading",
              props: { text: "Name", level: 3, fieldBindings: { text: "name" } },
            },
            {
              id: "team:card:role",
              kind: "paragraph",
              props: { text: "Role", fieldBindings: { text: "role" } },
            },
          ],
        },
      ],
    },
  ];
}

// ── data-binding recognition ─────────────────────────────────────────────────

test("a collection sourceKey is recognized (not 'unknown source')", () => {
  assert.equal(isCollectionDataSourceKey(TEAM_KEY), true);
  const def = getBuilderDataSourceDefinition(TEAM_KEY);
  assert.ok(def, "collection sourceKey resolves to a synthetic definition");
  assert.equal(def?.key, TEAM_KEY);

  const findings = getBuilderDataBindingFindings({
    id: "team",
    kind: "container",
    props: { dataBinding: { sourceKey: TEAM_KEY, repeat: true } },
    children: [],
  } as unknown as BuilderNode);
  // The repeater binding to a collection must NOT raise the unknown-source error.
  assert.equal(
    findings.some((f) => f.id === "unknown-source"),
    false,
  );
});

test("collectionDataSourceDefinition surfaces label + fields when provided", () => {
  const def = collectionDataSourceDefinition(TEAM_KEY, {
    sourceKey: TEAM_KEY,
    label: "Team",
    itemCount: 2,
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "photo", label: "Photo", kind: "image" },
    ],
  });
  assert.equal(def.label, "Team");
  assert.match(def.description, /Team/);
  assert.deepEqual(
    def.fields?.map((f) => f.key),
    ["name", "photo"],
  );
});

// ── tree scan ────────────────────────────────────────────────────────────────

test("collectBuilderCollectionSourceKeys finds collection bindings in a tree", () => {
  const keys = collectBuilderCollectionSourceKeys([
    ...teamRepeaterTree(),
    {
      id: "other",
      kind: "container",
      props: { dataBinding: { sourceKey: "featured_talent_profiles" } },
      children: [],
    } as unknown as BuilderNode,
  ]);
  assert.deepEqual(keys, [TEAM_KEY]);
});

// ── render integration: rows resolve through the repeat path ──────────────────

test("a collection-bound repeater renders one item per row with field bindings", () => {
  const html = renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(teamRepeaterTree(), {
        publicPathPrefix: "/impronta",
        dataSources: {
          collections: {
            // The render loader keys resolved rows by the EXACT sourceKey.
            [TEAM_KEY]: [
              { id: "row-1", name: "Ana Director", role: "Director" },
              { id: "row-2", name: "Beto Producer", role: "Producer" },
            ],
          },
        },
      }),
    ),
  );

  // One card per row, each with its bound name + role resolved from the tokens.
  assert.match(html, /Ana Director/);
  assert.match(html, /Beto Producer/);
  assert.match(html, /Director/);
  assert.match(html, /Producer/);
  // The literal template placeholders must NOT leak through.
  assert.doesNotMatch(html, />Name</);
  assert.doesNotMatch(html, />Role</);
});

test("an empty collection falls back to the single template child", () => {
  const html = renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(teamRepeaterTree(), {
        publicPathPrefix: "/impronta",
        dataSources: { collections: { [TEAM_KEY]: [] } },
      }),
    ),
  );
  // No data → the template renders once with its manual fallback values.
  assert.match(html, />Name</);
  assert.match(html, />Role</);
});

test("a collection binding with no dataSources entry does not crash (renders fallback)", () => {
  const html = renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(teamRepeaterTree(), { publicPathPrefix: "/impronta" }),
    ),
  );
  assert.match(html, />Name</);
});
