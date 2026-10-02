/**
 * Maison v2 release 2.9 (v23, "desktop parity", 1440 harness). v22 is published and stays as
 * released: every payload change since lives here, rebuilt from code against v22.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { diffDesignPayloads } from "./diff-payload";
import { generateReleaseItems, releaseNotesFor as authoredRelease } from "./release-notes";
import { EDITORIAL_TYPE_SYSTEM_CSS } from "../theme-catalog/collection/design-type-system";
import { maisonV2At, propsOf } from "./maison-v2-releases.fixtures";

const slots = (tree: ReadonlyArray<{ props?: unknown }>) => tree.map((n) => String((n.props as Record<string, unknown>).slotKey));

test("v23 classifies: one automatic item, the hero lede width; v22 itself is untouched", () => {
  const raw = diffDesignPayloads("maison-v2", { payload: maisonV2At(22), version: 22 }, { payload: maisonV2At(23), version: 23 });
  assert.deepEqual(raw.map((i) => i.id), ["variant-default:home:hero/container/paragraph#2"]);
  assert.equal(raw[0]!.type, "variant-default");
  assert.deepEqual(raw[0]!.paths, ["style.maxWidthFree", "style.responsive.mobile.maxWidthFree"]);
  const { items, notes } = generateReleaseItems("maison-v2", { payload: maisonV2At(22), version: 22 }, { payload: maisonV2At(23), version: 23 });
  assert.ok(notes.en && notes.es);
  const rel = authoredRelease("maison-v2", 23)!;
  for (const i of items.filter((x) => x.type !== "code")) {
    const n = rel.byItemId[i.id ?? ""];
    assert.ok(n?.en && n?.es, `note for ${i.id}`);
    assert.doesNotMatch(`${n.en} ${n.es}`, /—|–/);
  }
  // v22 as released: the 462px lede, the order and the footer sizes of 2.8.
  const v22 = JSON.stringify(maisonV2At(22).homeTree[0]);
  assert.match(v22, /462px/);
  assert.doesNotMatch(v22, /40ch|34ch/);
  assert.deepEqual(slots(maisonV2At(22).homeTree), ["hero", "gallery", "services", "reviews", "about", "contact", "location"]);
});

test("v23 payload: the hero lede is 40ch on desktop and 34ch on the phone", () => {
  const lede = JSON.stringify(maisonV2At(23).homeTree[0]);
  assert.match(lede, /"maxWidthFree":"40ch"/);
  assert.match(lede, /"maxWidthFree":"34ch"/);
  assert.doesNotMatch(lede, /462px/);
  void propsOf;
});

test("1440 harness: the FAQ parity key, the Location heading size and the About text size", () => {
  const map = JSON.parse(readFileSync("design-references/maison-v2/parity-map.json", "utf8")) as {
    sections: Array<{ key: string; parityKey: string | null }>;
  };
  const faq = map.sections.find((s) => s.key === "faq")!;
  assert.equal(faq.parityKey, "contact");
  assert.ok(slots(maisonV2At(23).homeTree).includes("contact"), "the payload carries that slot key");
  assert.match(EDITORIAL_TYPE_SYSTEM_CSS, /\.sb-loc \.sb-loc-title\{font-size:var\(--token-type-section-title-size-desktop,58px\)\}/);
  assert.match(EDITORIAL_TYPE_SYSTEM_CSS, /\.sb-loc \.sb-loc-title\{font-size:30px\}/);
  assert.match(EDITORIAL_TYPE_SYSTEM_CSS, /#about p\.site-builder-node--paragraph:not\(\[style\*="text-transform:uppercase"\]\)\{font-size:17px\}/);
});
