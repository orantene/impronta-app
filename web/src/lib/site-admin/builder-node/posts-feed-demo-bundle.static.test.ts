import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * TUL-1164: the example posts (~9 KB of titles, excerpts and photo names) are
 * only needed server-side, so they must not ship in the admin client bundle.
 * The admin bundle ceiling counts every chunk, dynamic ones included, so the
 * fix is to keep the data out of every client module, not to lazy-load it.
 */
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

// Marker text that only lives in the example data.
const MARKER = /Cómo trabajamos, paso a paso|mk-hero-business/;

test("the example data lives only in posts-feed-demo.ts", () => {
  assert.match(read("posts-feed-demo.ts"), MARKER);
  for (const f of [
    "posts-feed-model.ts",
    "posts-feed-block.tsx",
    "posts-feed-cards-view.tsx",
    "posts-feed-editor-demo.tsx",
    "render.tsx",
  ]) {
    assert.doesNotMatch(read(f), MARKER, `${f} must not carry the example data`);
  }
});

test("no client-reachable module imports the demo data module", () => {
  const importers = [
    "posts-feed-model.ts",
    "posts-feed-block.tsx",
    "posts-feed-cards-view.tsx",
    "posts-feed-editor-demo.tsx",
    "native-data-block-needs.ts",
    "render.tsx",
  ];
  for (const f of importers) {
    assert.doesNotMatch(read(f), /from "\.\/posts-feed-demo"/, `${f} must not import posts-feed-demo`);
  }
  // Only the server-side callers import it.
  assert.match(read("posts-feed-sources.ts"), /from "\.\/posts-feed-demo"/);
  assert.match(read("posts-feed-demo-action.ts"), /from "\.\/posts-feed-demo"/);
});

test("the canvas island fetches through the server action", () => {
  const island = read("posts-feed-editor-demo.tsx");
  assert.match(island, /^"use client";/);
  assert.match(island, /loadPostsFeedDemoCardsAction/);
  assert.match(read("posts-feed-demo-action.ts"), /^"use server";/);
});

test("the block view takes no allowDemo flag and never builds example cards itself", () => {
  const block = read("posts-feed-block.tsx");
  assert.doesNotMatch(block, /allowDemo|demoPostsFeedCards/);
  assert.doesNotMatch(read("render.tsx"), /postsFeedDemo/);
});
