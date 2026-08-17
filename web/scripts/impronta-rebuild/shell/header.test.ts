/**
 * Impronta shell HEADER trees — structural + design-rule assertions.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test scripts/impronta-rebuild/shell/header.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type {
  BuilderNavNode,
  BuilderNode,
  BuilderSectionEmbedNode,
} from "@/lib/site-admin/builder-node/types";

import { improntaHeaderTree } from "./header";

const LOCALES = ["en", "es"] as const;

function walk(nodes: BuilderNode[], visit: (node: BuilderNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if ("children" in node && Array.isArray(node.children)) {
      walk(node.children, visit);
    }
  }
}

function collect(tree: BuilderNode[]): BuilderNode[] {
  const all: BuilderNode[] = [];
  walk(tree, (node) => all.push(node));
  return all;
}

test("header: both trees pass validateBuilderNodeTree", () => {
  for (const locale of LOCALES) {
    const result = validateBuilderNodeTree(improntaHeaderTree[locale]);
    assert.ok(
      result.ok,
      `${locale} header failed validation: ${
        result.ok
          ? ""
          : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" | ")
      }`,
    );
  }
});

test("header: ids are collision-free within each tree", () => {
  for (const locale of LOCALES) {
    const ids = collect(improntaHeaderTree[locale]).map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, `${locale} header has duplicate ids`);
  }
});

test("header: exactly one nav node, fully configured for mobile collapse", () => {
  for (const locale of LOCALES) {
    const navs = collect(improntaHeaderTree[locale]).filter(
      (node): node is BuilderNavNode => node.kind === "nav",
    );
    assert.equal(navs.length, 1, `${locale} header must contain exactly one nav node`);
    const nav = navs[0];
    assert.equal(nav.props.collapseAt, "mobile", `${locale} nav collapseAt`);
    assert.equal(nav.props.mobileMenuVariant, "drawer-right", `${locale} nav mobileMenuVariant`);
    assert.ok(nav.props.menuLabel && nav.props.menuLabel.length > 0, `${locale} nav menuLabel`);
    assert.ok(nav.props.ariaLabel && nav.props.ariaLabel.length > 0, `${locale} nav ariaLabel`);
  }
});

test("header: nav menu label is localized", () => {
  const en = collect(improntaHeaderTree.en).find((n): n is BuilderNavNode => n.kind === "nav");
  const es = collect(improntaHeaderTree.es).find((n): n is BuilderNavNode => n.kind === "nav");
  assert.equal(en?.props.menuLabel, "Menu");
  assert.equal(es?.props.menuLabel, "Menú");
});

const EXPECTED_WIDGET_KEYS = [
  "header_search",
  "header_favorites",
  "header_inquiry",
  "header_account",
  "header_language",
];

test("header: the five live header widgets are embedded, in order, in EN and ES", () => {
  for (const locale of LOCALES) {
    const embeds = collect(improntaHeaderTree[locale]).filter(
      (node): node is BuilderSectionEmbedNode => node.kind === "section_embed",
    );
    assert.deepEqual(
      embeds.map((node) => node.props.sectionTypeKey),
      EXPECTED_WIDGET_KEYS,
      `${locale} header widget embeds`,
    );
  }
});

test("header: mobile-hidden widget set is exactly favorites + inquiry + account", () => {
  for (const locale of LOCALES) {
    const embeds = collect(improntaHeaderTree[locale]).filter(
      (node): node is BuilderSectionEmbedNode => node.kind === "section_embed",
    );
    const hidden = embeds
      .filter((node) => node.props.style?.responsive?.mobile?.visibility === "hidden")
      .map((node) => node.props.sectionTypeKey)
      .sort();
    assert.deepEqual(
      hidden,
      ["header_account", "header_favorites", "header_inquiry"],
      `${locale} mobile-hidden widgets`,
    );
    // Search + language stay visible so a phone visitor keeps both affordances.
    const visible = embeds
      .filter((node) => node.props.style?.responsive?.mobile?.visibility !== "hidden")
      .map((node) => node.props.sectionTypeKey)
      .sort();
    assert.deepEqual(visible, ["header_language", "header_search"], `${locale} mobile-visible widgets`);
  }
});

test("header: announcement row hides on mobile; CTA and nav do not", () => {
  for (const locale of LOCALES) {
    const all = collect(improntaHeaderTree[locale]);
    const utility = all.find((node) => node.id.endsWith("utility-row"));
    assert.ok(utility, `${locale} announcement row exists`);
    const utilityStyle = (utility!.props as { style?: { responsive?: { mobile?: { visibility?: string } } } })
      .style;
    assert.equal(utilityStyle?.responsive?.mobile?.visibility, "hidden");

    for (const node of all) {
      if (node.id.endsWith("utility-row")) continue;
      const style = (node.props as { style?: { responsive?: { mobile?: { visibility?: string } } } }).style;
      const hidden = style?.responsive?.mobile?.visibility === "hidden";
      if (hidden) {
        assert.equal(
          node.kind,
          "section_embed",
          `${locale}: only widget embeds (and the announcement row) may hide on mobile, found ${node.id}`,
        );
      }
    }
  }
});

const INTERNAL_HREF = /^\/(p\/[a-z0-9-]+|directory)$/;

test("header: every internal href is '/' or an allow-listed route", () => {
  for (const locale of LOCALES) {
    const hrefs: string[] = [];
    walk(improntaHeaderTree[locale], (node) => {
      if (node.kind === "button") hrefs.push(node.props.href);
      if (node.kind === "nav") {
        for (const link of node.props.links) {
          hrefs.push(link.href);
          for (const child of link.children ?? []) hrefs.push(child.href);
        }
      }
    });
    assert.ok(hrefs.length > 0, `${locale} header has hrefs`);
    for (const href of hrefs) {
      if (!href.startsWith("/")) continue; // external (WhatsApp) — checked below
      assert.ok(
        href === "/" || INTERNAL_HREF.test(href),
        `${locale}: internal href "${href}" is not allow-listed`,
      );
    }
    const external = hrefs.filter((href) => !href.startsWith("/"));
    assert.deepEqual(external, ["https://wa.me/529843170816"], `${locale} external hrefs`);
  }
});

test("header: EN and ES are structurally identical (node count + kind shape)", () => {
  const shape = (tree: BuilderNode[]): string[] => {
    const kinds: string[] = [];
    walk(tree, (node) => kinds.push(node.kind));
    return kinds;
  };
  const en = shape(improntaHeaderTree.en);
  const es = shape(improntaHeaderTree.es);
  assert.equal(en.length, es.length, "node counts differ");
  assert.deepEqual(en, es, "kind shapes differ");
});

test("header: no em dashes in user-facing copy", () => {
  for (const locale of LOCALES) {
    walk(improntaHeaderTree[locale], (node) => {
      const props = node.props as Record<string, unknown>;
      for (const key of ["text", "label", "menuLabel", "ariaLabel", "alt"]) {
        const value = props[key];
        if (typeof value === "string") {
          assert.ok(!value.includes("—"), `${locale}: em dash in ${node.id}.${key}`);
        }
      }
      if (node.kind === "nav") {
        for (const link of node.props.links) {
          assert.ok(!link.label.includes("—"), `${locale}: em dash in nav link ${link.id}`);
          for (const child of link.children ?? []) {
            assert.ok(!child.label.includes("—"), `${locale}: em dash in nav link ${child.id}`);
          }
        }
      }
    });
  }
});

test("header: main bar is sticky frosted glass; logo is the shell image slot", () => {
  for (const locale of LOCALES) {
    const all = collect(improntaHeaderTree[locale]);
    const bar = all.find((node) => node.id.endsWith("main-bar"));
    assert.ok(bar, `${locale} main bar exists`);
    const style = (bar!.props as { style?: Record<string, unknown> }).style ?? {};
    assert.equal(style.stickyAnchor, "top", `${locale} main bar stickyAnchor`);
    assert.equal(style.backdropFilter, "blur(18px)", `${locale} main bar backdropFilter`);
    assert.ok(
      typeof style.backgroundColor === "string" && style.backgroundColor.startsWith("rgba("),
      `${locale} main bar has a translucent ground`,
    );

    const logo = all.find((node) => node.kind === "image");
    assert.ok(logo, `${locale} logo exists`);
    assert.equal(
      (logo!.props as { src: string }).src,
      "slot://impronta-rebuild/shell-logo",
      `${locale} logo slot`,
    );
  }
});
