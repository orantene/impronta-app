import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import { validateBuilderNodeTree } from "./validate";
import { assignExperimentVariant } from "./experiment";
import type { BuilderNode } from "./types";

function html(nodes: BuilderNode[], options = {}): string {
  return renderToStaticMarkup(
    createElement(Fragment, null, renderBuilderNodes(nodes, options)),
  );
}

function ctaNode(experiment?: unknown): BuilderNode {
  return {
    id: "cta-1",
    kind: "button",
    ...(experiment ? { experiment } : {}),
    props: { label: "Get started", href: "/start" },
  } as BuilderNode;
}

const liveExperiment = {
  experimentId: "btn-exp-1",
  variants: [
    { key: "a" },
    { key: "b", propOverrides: { label: "Book a call", href: "/call" } },
  ],
};

// Find seeds that bucket into each arm so the override assertions are stable.
function seedFor(arm: "a" | "b", experimentId: string): string {
  for (let i = 0; i < 500; i++) {
    const seed = `seed-${i}`;
    if (assignExperimentVariant(experimentId, seed) === arm) return seed;
  }
  throw new Error(`no seed found for arm ${arm}`);
}

describe("ABTEST-1 — shared variant engine render path", () => {
  it("byte-stability: a node with NO experiment renders identically with/without a seed", () => {
    const noExp = html([ctaNode()]);
    const withSeed = html([ctaNode()], { experimentSeed: "any-visitor" });
    assert.equal(noExp, withSeed);
    // And carries no experiment data attrs / no runtime.
    assert.ok(!noExp.includes("data-experiment"));
    assert.ok(!noExp.includes("data-builder-node-experiment-runtime"));
  });

  it("control (seed → 'a') renders the base props and tags the served variant", () => {
    const aSeed = seedFor("a", "btn-exp-1");
    const out = html([ctaNode(liveExperiment)], {
      experimentSeed: aSeed,
      experimentTenantId: "11111111-1111-1111-1111-111111111111",
    });
    // Base label kept (no B override on the control arm).
    assert.ok(out.includes("Get started"));
    assert.ok(!out.includes("Book a call"));
    assert.ok(out.includes('data-experiment="btn-exp-1"'));
    assert.ok(out.includes('data-variant="a"'));
    assert.ok(out.includes('data-experiment-trigger="click"'));
  });

  it("variant B (seed → 'b') applies the override props and tags variant b", () => {
    const bSeed = seedFor("b", "btn-exp-1");
    const out = html([ctaNode(liveExperiment)], { experimentSeed: bSeed });
    // Overridden label + href win.
    assert.ok(out.includes("Book a call"));
    assert.ok(out.includes("/call"));
    assert.ok(!out.includes("Get started"));
    assert.ok(out.includes('data-variant="b"'));
  });

  it("injects the experiment runtime once when a seed + a live experiment exist", () => {
    const out = html([ctaNode(liveExperiment)], {
      experimentSeed: "v-1",
      experimentTenantId: "22222222-2222-2222-2222-222222222222",
      experimentSurface: "adminWorkspace",
    });
    // Count the <script> element (not the selector string inside its body).
    const matches = out.match(/<script data-builder-node-experiment-runtime/g) ?? [];
    assert.equal(matches.length, 1);
    // tenant + surface tags are baked onto the script element.
    assert.ok(out.includes('data-tenant-id="22222222-2222-2222-2222-222222222222"'));
    assert.ok(out.includes('data-surface="adminWorkspace"'));
  });

  it("NO runtime is injected when there is no seed (editor canvas / tests)", () => {
    const out = html([ctaNode(liveExperiment)]);
    assert.ok(!out.includes("data-builder-node-experiment-runtime"));
    // …and no data-experiment attrs without a seed (control, untracked).
    assert.ok(!out.includes("data-experiment="));
  });

  it("a form node converts on submit (trigger tag)", () => {
    const form: BuilderNode = {
      id: "form-1",
      kind: "form",
      experiment: {
        experimentId: "form-exp-1",
        variants: [{ key: "a" }, { key: "b", propOverrides: { label: "B copy" } }],
      },
      props: { fields: [{ id: "f1", name: "email", type: "email", label: "Email" }] },
    } as BuilderNode;
    const out = html([form], { experimentSeed: seedFor("a", "form-exp-1") });
    assert.ok(out.includes('data-experiment-trigger="submit"'));
  });
});

describe("ABTEST-1 — experiment config round-trips through validate", () => {
  // A bare button is not a valid tree ROOT (drop-policy), so wrap the CTA in a
  // container the way the real tree does.
  function wrap(experiment: unknown) {
    return [
      {
        id: "root-1",
        kind: "container",
        props: { layout: "stack" },
        children: [
          {
            id: "cta-x",
            kind: "button",
            props: { label: "Hi", href: "/x", experiment },
          },
        ],
      },
    ];
  }

  it("carries props.experiment onto the node base and back into props", () => {
    const result = validateBuilderNodeTree(wrap(liveExperiment));
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.issues));
    const container = result.tree[0] as BuilderNode & { children: BuilderNode[] };
    const node = container.children[0] as BuilderNode & { experiment?: unknown };
    // Mirrored onto the base.
    assert.ok(node.experiment);
    assert.equal((node.experiment as { experimentId: string }).experimentId, "btn-exp-1");
    // …and kept in props (source of truth).
    assert.ok((node.props as { experiment?: unknown }).experiment);
  });

  it("drops an experiment whose B arm has no override (== no experiment)", () => {
    const result = validateBuilderNodeTree(
      wrap({ experimentId: "z", variants: [{ key: "a" }, { key: "b" }] }),
    );
    assert.ok(result.ok);
    const container = result.tree[0] as BuilderNode & { children: BuilderNode[] };
    const node = container.children[0] as BuilderNode & { experiment?: unknown };
    assert.equal(node.experiment, undefined);
    assert.equal((node.props as { experiment?: unknown }).experiment, undefined);
  });
});
