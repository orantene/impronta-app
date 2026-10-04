import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { applyTalentLiveMedia, treeHasLiveMediaCandidates } from "./live-media";

const img = (id: string, label: string, src: string): BuilderNode =>
  ({ id, kind: "image", props: { layerLabel: label, src } }) as unknown as BuilderNode;

test("applyTalentLiveMedia rewrites hero/about/inset from live urls", () => {
  const tree = [
    img("h", "Hero photo", "https://old/lashes.jpg"),
    img("i", "Hero inset", "https://old/inset.jpg"),
    img("a", "About portrait", "https://old/about.jpg"),
    img("x", "Other", "https://old/keep.jpg"),
  ];
  assert.equal(treeHasLiveMediaCandidates(tree), true);
  const out = applyTalentLiveMedia(tree, {
    headshotUrl: "https://cdn/portrait.jpg",
    insetUrl: "https://cdn/detail.jpg",
    aboutUrl: "https://cdn/hero.jpg",
    gallery: [],
  });
  assert.equal((out[0]!.props as { src: string }).src, "https://cdn/portrait.jpg");
  assert.equal((out[1]!.props as { src: string }).src, "https://cdn/detail.jpg");
  assert.equal((out[2]!.props as { src: string }).src, "https://cdn/hero.jpg");
  assert.equal((out[3]!.props as { src: string }).src, "https://old/keep.jpg");
});

test("applyTalentLiveMedia is identity when urls empty or already match", () => {
  const tree = [img("h", "Hero photo", "https://cdn/portrait.jpg")];
  const same = applyTalentLiveMedia(tree, {
    headshotUrl: "https://cdn/portrait.jpg",
    insetUrl: "",
    aboutUrl: "",
    gallery: [],
  });
  assert.equal(same, tree);
  const empty = applyTalentLiveMedia(tree, {
    headshotUrl: "",
    insetUrl: "",
    aboutUrl: "",
    gallery: [],
  });
  assert.equal(empty, tree);
});
