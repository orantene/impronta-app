import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { swapImageSrcInTree } from "./page-image-swap.server";
import { DUPLICATE_DISTANCE, hammingDistance, perceptualHash, runStockQa } from "./stock-qa.server";

async function frame(w: number, h: number, kind: "flat" | "gradient" | "noise"): Promise<Buffer> {
  if (kind === "flat") return sharp({ create: { width: w, height: h, channels: 3, background: "#808080" } }).jpeg().toBuffer();
  const px = Buffer.alloc(w * h * 3);
  let seed = 7;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (kind === "gradient") {
        px[i] = Math.round((x / w) * 255);
        px[i + 1] = Math.round((y / h) * 255);
        px[i + 2] = 128;
      } else {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        px[i] = px[i + 1] = px[i + 2] = seed % 256;
      }
    }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}

test("automated QA: aspect ratio per role, flat frames rejected, verdicts recorded, vision skipped without a model", async () => {
  const hero = await frame(768, 512, "gradient");
  const ok = await runStockQa({ bytes: hero, role: "hero", existingHashes: [], typeLabel: "a spa", visionModel: null });
  assert.equal(ok.passed, true);
  assert.equal(ok.checks.aspect.verdict, "pass");
  assert.equal(ok.checks.no_text.verdict, "skipped");
  assert.match(ok.phash, /^[0-9a-f]{16}$/);

  const wrongShape = await runStockQa({ bytes: hero, role: "portrait", existingHashes: [], typeLabel: null });
  assert.equal(wrongShape.passed, false);
  assert.equal(wrongShape.checks.aspect.verdict, "fail");

  const flat = await runStockQa({ bytes: await frame(768, 512, "flat"), role: "hero", existingHashes: [], typeLabel: null });
  assert.equal(flat.checks.not_blank.verdict, "fail");
});

test("near-duplicates are caught by perceptual hash; different frames are not", async () => {
  const a = await frame(768, 512, "gradient");
  const aResized = await sharp(a).resize(600, 400).jpeg({ quality: 60 }).toBuffer();
  const b = await frame(768, 512, "noise");
  const ha = await perceptualHash(a), hb = await perceptualHash(b), ha2 = await perceptualHash(aResized);
  assert.ok(hammingDistance(ha, ha2) <= DUPLICATE_DISTANCE, `same picture re-encoded: ${hammingDistance(ha, ha2)}`);
  assert.ok(hammingDistance(ha, hb) > DUPLICATE_DISTANCE, `different pictures: ${hammingDistance(ha, hb)}`);
  const dup = await runStockQa({ bytes: aResized, role: "hero", existingHashes: [ha], typeLabel: null });
  assert.equal(dup.checks.not_duplicate.verdict, "fail");
});

test("swapImageSrcInTree replaces only the exact src, keeps everything else, and counts nodes", () => {
  const tree = [
    { kind: "section", children: [{ kind: "image", props: { src: "https://x/old.jpg", alt: "a", i18n: { en: { alt: "a-en" } } } }, { kind: "image", props: { src: "https://x/other.jpg" } }] },
    { kind: "heading", props: { text: "https://x/old.jpg" } },
  ];
  const out = swapImageSrcInTree(tree, "https://x/old.jpg", "https://x/new.jpg", { es: "nuevo", en: "new" });
  assert.equal(out.changed, 1);
  const t = out.tree as Array<{ children?: Array<{ props: Record<string, unknown> }>; props?: Record<string, unknown> }>;
  assert.equal(t[0].children?.[0].props.src, "https://x/new.jpg");
  assert.equal(t[0].children?.[0].props.alt, "nuevo");
  assert.deepEqual(t[0].children?.[0].props.i18n, { en: { alt: "new" } });
  assert.equal(t[0].children?.[1].props.src, "https://x/other.jpg");
  assert.equal(t[1].props?.text, "https://x/old.jpg");
  assert.notEqual(out.tree, tree);
});

test("swapImageSrcInTree honours maxNodes so a seed image reused in two slots swaps one node", () => {
  const tree = [{ kind: "image", props: { src: "https://x/seed.jpg" } }, { kind: "image", props: { src: "https://x/seed.jpg" } }];
  const one = swapImageSrcInTree(tree, "https://x/seed.jpg", "https://x/mine.jpg", null, 1);
  assert.equal(one.changed, 1);
  const t = one.tree as Array<{ props: { src: string } }>;
  assert.deepEqual(t.map((n) => n.props.src), ["https://x/mine.jpg", "https://x/seed.jpg"]);
});
