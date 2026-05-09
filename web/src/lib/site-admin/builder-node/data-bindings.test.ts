import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILDER_DATA_SOURCE_REGISTRY,
  builderNodeSupportsDataBinding,
  collectBuilderDataBindingTreeFindings,
  getBuilderDataBindingFindings,
  getBuilderDataSourceDefinition,
  getBuilderNodeDataBinding,
  getDefaultBuilderDataBinding,
  normalizeBuilderDataBinding,
} from "./data-bindings";
import type { BuilderNode } from "./types";

test("data source registry exposes the SaaS binding foundation", () => {
  assert.ok(getBuilderDataSourceDefinition("workspace_profile"));
  assert.ok(getBuilderDataSourceDefinition("roster_talent"));
  assert.ok(getBuilderDataSourceDefinition("taxonomy_category"));
  assert.ok(getBuilderDataSourceDefinition("featured_talent_profiles"));
  assert.ok(getBuilderDataSourceDefinition("tenant_directory_search"));
  assert.ok(getBuilderDataSourceDefinition("inquiry_path"));
  assert.equal(getBuilderDataSourceDefinition("missing"), null);

  const keys = new Set(BUILDER_DATA_SOURCE_REGISTRY.map((source) => source.key));
  assert.equal(keys.size, BUILDER_DATA_SOURCE_REGISTRY.length);
});

test("collects data binding findings across a builder tree", () => {
  const tree: BuilderNode[] = [
    {
      id: "root-container",
      kind: "container",
      props: {
        layout: "grid",
        dataBinding: { sourceKey: "featured_talent_profiles", maxItems: 9 },
      },
      children: [
        {
          id: "nested-heading",
          kind: "heading",
          props: { text: "Featured", level: 2 },
        },
        {
          id: "nested-container",
          kind: "container",
          props: {
            layout: "stack",
            dataBinding: { sourceKey: "unknown_source" },
          },
          children: [],
        },
      ],
    },
  ];

  assert.deepEqual(
    collectBuilderDataBindingTreeFindings(tree, { workspacePlan: "agency" }).map(
      (finding) => ({
      id: finding.id,
      nodeId: finding.nodeId,
      severity: finding.severity,
    })),
    [
      { id: "missing-mode", nodeId: "root-container", severity: "warning" },
      { id: "free-roster-limit", nodeId: "root-container", severity: "warning" },
      { id: "unknown-source", nodeId: "nested-container", severity: "error" },
    ],
  );
});

test("only safe structural node kinds currently support data bindings", () => {
  assert.equal(builderNodeSupportsDataBinding("section"), true);
  assert.equal(builderNodeSupportsDataBinding("container"), true);
  assert.equal(builderNodeSupportsDataBinding("heading"), false);
  assert.equal(builderNodeSupportsDataBinding("image"), false);
});

test("normalizes persisted binding payloads", () => {
  assert.deepEqual(normalizeBuilderDataBinding(null), null);
  assert.deepEqual(normalizeBuilderDataBinding({ sourceKey: " " }), null);
  assert.deepEqual(
    normalizeBuilderDataBinding({
      sourceKey: "roster_talent",
      mode: "manual",
      filterQuery: " featured = true ",
      maxItems: 999,
    }),
    {
      sourceKey: "featured_talent_profiles",
      mode: "manual",
      filterQuery: "featured = true",
      maxItems: 100,
    },
  );
  assert.deepEqual(
    normalizeBuilderDataBinding({
      sourceKey: "featured_talent_profiles",
      mode: "auto",
    }),
    {
      sourceKey: "featured_talent_profiles",
      mode: "bound",
    },
  );
});

test("default binding follows source capabilities", () => {
  assert.deepEqual(getDefaultBuilderDataBinding("workspace_profile"), {
    sourceKey: "workspace_profile",
    mode: undefined,
    maxItems: undefined,
  });
  assert.deepEqual(getDefaultBuilderDataBinding("featured_talent_profiles"), {
    sourceKey: "featured_talent_profiles",
    mode: "bound",
    maxItems: 5,
  });
});

test("reports actionable binding findings", () => {
  const containerWithoutBinding: BuilderNode = {
    id: "node-1",
    kind: "container",
    props: { layout: "grid", columns: 3 },
    children: [],
  };
  assert.equal(
    getBuilderDataBindingFindings(containerWithoutBinding)[0]?.id,
    "missing-binding",
  );

  const invalidSource: BuilderNode = {
    id: "node-2",
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: { sourceKey: "unknown_source" },
    },
    children: [],
  };
  assert.equal(getBuilderDataBindingFindings(invalidSource)[0]?.id, "unknown-source");

  const rosterBinding: BuilderNode = {
    id: "node-3",
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: { sourceKey: "featured_talent_profiles", maxItems: 12 },
    },
    children: [],
  };
  assert.deepEqual(
    getBuilderDataBindingFindings(rosterBinding).map((finding) => finding.id),
    ["missing-mode", "free-roster-limit"],
  );
  assert.deepEqual(getBuilderNodeDataBinding(rosterBinding), {
    sourceKey: "featured_talent_profiles",
    maxItems: 12,
  });
});

test("flags plan-restricted binding sources when workspace plan is lower", () => {
  const locationBinding: BuilderNode = {
    id: "node-plan",
    kind: "container",
    props: {
      layout: "stack",
      dataBinding: { sourceKey: "talent_locations", mode: "bound", maxItems: 4 },
    },
    children: [],
  };

  assert.ok(
    getBuilderDataBindingFindings(locationBinding, { workspacePlan: "free" }).some(
      (finding) => finding.id === "source-plan-restricted",
    ),
  );
  assert.equal(
    getBuilderDataBindingFindings(locationBinding, { workspacePlan: "agency" }).some(
      (finding) => finding.id === "source-plan-restricted",
    ),
    false,
  );
});

test("elevates free roster limit to error on free plan", () => {
  const rosterBinding: BuilderNode = {
    id: "node-free-limit",
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: { sourceKey: "featured_talent_profiles", mode: "bound", maxItems: 8 },
    },
    children: [],
  };

  const freeFinding = getBuilderDataBindingFindings(rosterBinding, {
    workspacePlan: "free",
  }).find((finding) => finding.id === "free-roster-limit");
  assert.equal(freeFinding?.severity, "error");

  const agencyFinding = getBuilderDataBindingFindings(rosterBinding, {
    workspacePlan: "agency",
  }).find((finding) => finding.id === "free-roster-limit");
  assert.equal(agencyFinding?.severity, "warning");
});

test("flags hybrid mode without filter intent", () => {
  const hybridBinding: BuilderNode = {
    id: "node-hybrid",
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: {
        sourceKey: "featured_talent_profiles",
        mode: "hybrid",
      },
    },
    children: [],
  };

  assert.ok(
    getBuilderDataBindingFindings(hybridBinding).some(
      (finding) => finding.id === "hybrid-missing-filter-intent",
    ),
  );
});
