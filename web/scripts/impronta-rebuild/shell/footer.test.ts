/**
 * Impronta shell footer — validation for the EN + ES `site_footer` children
 * trees. Mirrors `impronta-rebuild-pages.test.ts`: validateBuilderNodeTree,
 * href allow-lists, copy rules (no em dashes), plus this lane's own
 * invariants: the tenant-bound social row and EN/ES structural parity.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test scripts/impronta-rebuild/shell/footer.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { improntaFooterTree } from "./footer";
import {
  FOOTER_EMAIL_HREF,
  FOOTER_INSTAGRAM_HREF,
  FOOTER_TIKTOK_HREF,
  FOOTER_WHATSAPP_HREF,
} from "./shared-footer";

const LOCALES = ["en", "es"] as const;

// ── helpers ──────────────────────────────────────────────────────────────────

function childrenOf(node: BuilderNode): ReadonlyArray<BuilderNode> {
  const children = (node as { children?: BuilderNode[] }).children;
  return Array.isArray(children) ? children : [];
}

function walk(nodes: ReadonlyArray<BuilderNode>, visit: (node: BuilderNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(childrenOf(node), visit);
  }
}

function collectHrefs(tree: ReadonlyArray<BuilderNode>): string[] {
  const hrefs: string[] = [];
  walk(tree, (node) => {
    const props = node.props as Record<string, unknown>;
    if (typeof props.href === "string") hrefs.push(props.href);
    if (Array.isArray(props.links)) {
      for (const link of props.links as Array<{ href?: unknown }>) {
        if (typeof link.href === "string") hrefs.push(link.href);
      }
    }
  });
  return hrefs;
}

/** Depth-first kind fingerprint: EN and ES must produce the same shape. */
function kindShape(tree: ReadonlyArray<BuilderNode>): string[] {
  const shape: string[] = [];
  const dive = (nodes: ReadonlyArray<BuilderNode>, depth: number) => {
    for (const node of nodes) {
      shape.push(`${"  ".repeat(depth)}${node.kind}`);
      dive(childrenOf(node), depth + 1);
    }
  };
  dive(tree, 0);
  return shape;
}

const INTERNAL_HREF = /^\/(p\/[a-z0-9-]+|directory)$/;
const APPROVED_EXTERNAL = new Set([
  FOOTER_WHATSAPP_HREF,
  FOOTER_INSTAGRAM_HREF,
  FOOTER_TIKTOK_HREF,
  FOOTER_EMAIL_HREF,
]);

// ── validation ───────────────────────────────────────────────────────────────

for (const locale of LOCALES) {
  const tree = improntaFooterTree[locale];

  test(`footer tree (${locale}) passes validateBuilderNodeTree`, () => {
    const result = validateBuilderNodeTree(tree);
    assert.equal(
      result.ok,
      true,
      result.ok ? undefined : JSON.stringify(result.issues, null, 2),
    );
  });

  test(`footer tree (${locale}) only links to approved destinations`, () => {
    const hrefs = collectHrefs(tree);
    assert.ok(hrefs.length >= 15, `expected a full link set, got ${hrefs.length}`);
    for (const href of hrefs) {
      if (href.startsWith("/")) {
        assert.ok(
          href === "/" || INTERNAL_HREF.test(href),
          `internal href not allowed: ${href}`,
        );
      } else {
        assert.ok(APPROVED_EXTERNAL.has(href), `external href not approved: ${href}`);
      }
    }
  });

  test(`footer tree (${locale}) has the tenant-bound social row`, () => {
    let bound = 0;
    walk(tree, (node) => {
      if (node.kind !== "social_links") return;
      const props = node.props as {
        dataBinding?: { sourceKey?: string };
        shape?: string;
        links?: unknown[];
      };
      assert.equal(props.dataBinding?.sourceKey, "workspace_social_links");
      assert.equal(props.shape, "circle");
      assert.ok((props.links?.length ?? 0) >= 4, "static fallback links missing");
      bound += 1;
    });
    assert.equal(bound, 1, "expected exactly one social_links node");
  });

  test(`footer tree (${locale}) contains no em or en dashes`, () => {
    const serialized = JSON.stringify(tree);
    assert.ok(!serialized.includes("—"), "em dash found in tree");
    assert.ok(!serialized.includes("–"), "en dash found in tree");
  });

  test(`footer tree (${locale}) stacks its columns on mobile`, () => {
    let stacking = 0;
    walk(tree, (node) => {
      if (node.kind !== "container") return;
      const props = node.props as {
        layout?: string;
        responsive?: Record<string, { layout?: string }>;
      };
      if (props.layout === "grid" && props.responsive?.mobile?.layout === "stack") {
        stacking += 1;
      }
    });
    assert.ok(stacking >= 1, "the column grid must stack on mobile");
  });
}

// ── EN / ES structural parity ────────────────────────────────────────────────

test("EN and ES trees have identical node count and kind shape", () => {
  const en = kindShape(improntaFooterTree.en);
  const es = kindShape(improntaFooterTree.es);
  assert.equal(en.length, es.length, "node counts differ");
  assert.deepEqual(en, es, "kind shapes differ");
});

test("EN and ES node ids never collide (both trees can co-exist)", () => {
  const seen = new Set<string>();
  for (const locale of LOCALES) {
    walk(improntaFooterTree[locale], (node) => {
      assert.ok(!seen.has(node.id), `duplicate node id across locales: ${node.id}`);
      seen.add(node.id);
    });
  }
});
