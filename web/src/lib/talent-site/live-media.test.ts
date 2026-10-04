import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { applyTalentLiveMedia, treeHasLiveMediaCandidates } from "./live-media";

const img = (id: string, label: string, src: string): BuilderNode =>
  ({ id, kind: "image", props: { layerLabel: label, src } }) as unknown as BuilderNode;

test("applyTalentLiveMedia rewrites hero/about/inset from live urls", () => {
  // Stale library picks (still in gallery) heal to preferred slots; unlabeled kept.
  const tree = [
    img("h", "Hero photo", "https://cdn/work-lashes.jpg"),
    img("i", "Hero inset", "https://cdn/work-old-inset.jpg"),
    img("a", "About portrait", "https://cdn/work-old-about.jpg"),
    img("x", "Other", "https://cdn/keep.jpg"),
  ];
  assert.equal(treeHasLiveMediaCandidates(tree), true);
  const out = applyTalentLiveMedia(tree, {
    headshotUrl: "https://cdn/portrait.jpg",
    insetUrl: "https://cdn/detail.jpg",
    aboutUrl: "https://cdn/hero.jpg",
    gallery: [
      "https://cdn/work-lashes.jpg",
      "https://cdn/work-old-inset.jpg",
      "https://cdn/work-old-about.jpg",
      "https://cdn/keep.jpg",
    ],
  });
  assert.equal((out[0]!.props as { src: string }).src, "https://cdn/portrait.jpg");
  assert.equal((out[1]!.props as { src: string }).src, "https://cdn/detail.jpg");
  assert.equal((out[2]!.props as { src: string }).src, "https://cdn/hero.jpg");
  assert.equal((out[3]!.props as { src: string }).src, "https://cdn/keep.jpg");
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

test("applyTalentLiveMedia preserves authored overrides (custom src, mediaId, liveMedia:false)", () => {
  const media = {
    headshotUrl: "https://cdn/portrait.jpg",
    insetUrl: "https://cdn/detail.jpg",
    aboutUrl: "https://cdn/hero.jpg",
    gallery: ["https://cdn/work1.jpg"],
  };
  const custom = applyTalentLiveMedia(
    [img("h", "Hero photo", "https://images.unsplash.com/custom.jpg")],
    media,
  );
  assert.equal((custom[0]!.props as { src: string }).src, "https://images.unsplash.com/custom.jpg");

  const withMediaId = applyTalentLiveMedia(
    [
      {
        id: "h",
        kind: "image",
        props: { layerLabel: "Hero photo", src: "https://cdn/work1.jpg", mediaId: "asset-1" },
      } as unknown as BuilderNode,
    ],
    media,
  );
  assert.equal((withMediaId[0]!.props as { src: string }).src, "https://cdn/work1.jpg");

  const optedOut = applyTalentLiveMedia(
    [
      {
        id: "h",
        kind: "image",
        props: { layerLabel: "Hero photo", src: "https://cdn/work1.jpg", liveMedia: false },
      } as unknown as BuilderNode,
    ],
    media,
  );
  assert.equal((optedOut[0]!.props as { src: string }).src, "https://cdn/work1.jpg");

  // Library work shot in the hero slot still heals to the preferred headshot.
  const heal = applyTalentLiveMedia([img("h", "Hero photo", "https://cdn/work1.jpg")], media);
  assert.equal((heal[0]!.props as { src: string }).src, "https://cdn/portrait.jpg");
});
