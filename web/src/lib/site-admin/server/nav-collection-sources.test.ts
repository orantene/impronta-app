/**
 * A4 follow-up — pure tests for the nav-collection source collector + key guard
 * (node:test + node:assert). Only the tree-walk + key recognition are exercised
 * here; the DB resolver (`resolveNavCollectionDataSources`) is an integration
 * concern proven by the render-side nav-from-collection tests.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectNavCollectionSourceKeys,
  isNavCollectionSourceKey,
} from "./nav-collection-sources";
import type { BuilderNode } from "@/lib/site-admin/builder-node";

test("isNavCollectionSourceKey recognises only cms_page / cms_posts", () => {
  assert.equal(isNavCollectionSourceKey("cms_page"), true);
  assert.equal(isNavCollectionSourceKey("cms_posts"), true);
  assert.equal(isNavCollectionSourceKey("workspace_social_links"), false);
  assert.equal(isNavCollectionSourceKey("collection:abc"), false);
  assert.equal(isNavCollectionSourceKey(null), false);
  assert.equal(isNavCollectionSourceKey(undefined), false);
});

test("collectNavCollectionSourceKeys finds bound nav sources, dedupes, ignores others", () => {
  const tree: BuilderNode[] = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "nav-a",
          kind: "nav",
          props: {
            links: [{ id: "l1", label: "Home", href: "/" }],
            dataBinding: { sourceKey: "cms_page" },
          },
        },
        {
          id: "nav-b",
          kind: "nav",
          props: {
            links: [{ id: "l2", label: "Blog", href: "/blog" }],
            dataBinding: { sourceKey: "cms_posts" },
          },
        },
        // Duplicate source — must dedupe.
        {
          id: "nav-c",
          kind: "nav",
          props: {
            links: [{ id: "l3", label: "About", href: "/p/about" }],
            dataBinding: { sourceKey: "cms_page" },
          },
        },
        // Unbound nav — contributes nothing.
        {
          id: "nav-d",
          kind: "nav",
          props: { links: [{ id: "l4", label: "Static", href: "/x" }] },
        },
        // A non-nav bound node (social) is NOT a nav-collection source.
        {
          id: "soc",
          kind: "social_links",
          props: {
            links: [],
            dataBinding: { sourceKey: "workspace_social_links" },
          },
        },
      ],
    },
  ];
  const keys = collectNavCollectionSourceKeys(tree).sort();
  assert.deepEqual(keys, ["cms_page", "cms_posts"]);
});

test("collectNavCollectionSourceKeys returns [] for a tree with no bound navs", () => {
  const tree: BuilderNode[] = [
    {
      id: "nav-only",
      kind: "nav",
      props: { links: [{ id: "l1", label: "Home", href: "/" }] },
    },
  ];
  assert.deepEqual(collectNavCollectionSourceKeys(tree), []);
});
